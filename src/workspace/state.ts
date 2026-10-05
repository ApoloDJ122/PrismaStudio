import type { FileBuffer, ProjectNode } from "../types/project.ts";
import { emptySession, type SessionState, type SessionTab } from "../types/session.ts";

/*
 * Lógica de estado del workspace, sin React.
 *
 * Estas funciones son las que deciden qué pasa con las pestañas y los búferes
 * al renombrar, eliminar o cerrar, y qué se guarda entre sesiones. Están
 * separadas del hook para poder comprobarlas con pruebas sin montar la
 * interfaz.
 */

export type Buffers = Record<string, FileBuffer>;

export type OpenTab = {
  path: string;
  name: string;
  language: string;
};

export type CursorPosition = {
  line: number;
  column: number;
};

export type CursorMap = Record<string, CursorPosition>;

export function isSamePathOrInside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(parent + "\\") || path.startsWith(parent + "/");
}

export function parentOf(path: string): string {
  const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return index === -1 ? "" : path.slice(0, index);
}

function buffer(name: string, content: string): FileBuffer {
  return { name, language: "html", content, savedContent: content };
}

function tab(path: string, name: string, language = "html"): OpenTab {
  return { path, name, language };
}

/**
 * Reubica los búferes tras un renombrado.
 * Solo el elemento renombrado cambia de nombre: los archivos que había dentro
 * de una carpeta conservan el suyo, porque sus nombres no han cambiado.
 */
export function rekeyBuffers(
  buffers: Buffers,
  oldPath: string,
  newPath: string,
  newName: string,
): Buffers {
  const result: Buffers = {};

  for (const [key, value] of Object.entries(buffers)) {
    if (!isSamePathOrInside(key, oldPath)) {
      result[key] = value;
      continue;
    }

    const moved = newPath + key.slice(oldPath.length);
    result[moved] = key === oldPath ? { ...value, name: newName } : value;
  }

  return result;
}

/** Reubica las pestañas tras un renombrado, con la misma regla de nombres. */
export function rekeyTabs(
  tabs: OpenTab[],
  oldPath: string,
  newPath: string,
  newName: string,
  language: string,
): OpenTab[] {
  return tabs.map((item) => {
    if (!isSamePathOrInside(item.path, oldPath)) {
      return item;
    }

    const moved = newPath + item.path.slice(oldPath.length);

    return moved === newPath ? { ...item, path: moved, name: newName, language } : { ...item, path: moved };
  });
}

/** Reubica las posiciones del cursor tras un renombrado. */
export function rekeyCursors(cursors: CursorMap, oldPath: string, newPath: string): CursorMap {
  const result: CursorMap = {};

  for (const [key, value] of Object.entries(cursors)) {
    result[isSamePathOrInside(key, oldPath) ? newPath + key.slice(oldPath.length) : key] = value;
  }

  return result;
}

export function removeBuffersInside(buffers: Buffers, path: string): Buffers {
  const result: Buffers = {};

  for (const [key, value] of Object.entries(buffers)) {
    if (!isSamePathOrInside(key, path)) {
      result[key] = value;
    }
  }

  return result;
}

export function removeCursorsInside(cursors: CursorMap, path: string): CursorMap {
  const result: CursorMap = {};

  for (const [key, value] of Object.entries(cursors)) {
    if (!isSamePathOrInside(key, path)) {
      result[key] = value;
    }
  }

  return result;
}

/** Quita del mapa la entrada de una ruta concreta, al cerrar una pestaña. */
export function withoutKey<T>(source: Record<string, T>, path: string): Record<string, T> {
  if (source[path] === undefined) {
    return source;
  }

  const next = { ...source };
  delete next[path];
  return next;
}

export function tabsInside(tabs: OpenTab[], path: string): OpenTab[] {
  return tabs.filter((item) => isSamePathOrInside(item.path, path));
}

/**
 * Índice que debe quedar activo tras retirar las pestañas de `removedPaths`.
 * Devuelve `-1` cuando no queda ninguna pestaña.
 *
 * Si la pestaña activa sigue existiendo, se conserva aunque cambie de posición.
 * Si era una de las retiradas, se activa la que ocupaba su lugar y, si no hay
 * ninguna, la anterior.
 */
export function nextActiveIndex(
  tabs: OpenTab[],
  removedPaths: string[],
  activeIndex: number,
): number {
  const isRemoved = (item: OpenTab) => removedPaths.some((path) => item.path === path);
  const remaining = tabs.filter((item) => !isRemoved(item));

  if (remaining.length === 0) {
    return -1;
  }

  const active = tabs[activeIndex];

  if (active === undefined || isRemoved(active)) {
    // Se activaba una de las retiradas: entra la que ocupaba su lugar y, si no
    // hay ninguna detrás, la que había justo antes.
    return Math.min(activeIndex < 0 ? 0 : activeIndex, remaining.length - 1);
  }

  // La pestaña activa sigue existiendo: solo hay que correcting su posición.
  const removedBefore = tabs.slice(0, activeIndex).filter(isRemoved).length;
  return Math.max(0, activeIndex - removedBefore);
}

/** Contenido que se comparó con el disco para decidir si un archivo es editable. */
export type ExternalChange = {
  name: string;
  /** Lo que había en el archivo cuando se abrió o se guardó por última vez. */
  loaded: string;
  /** Lo que hay ahora en el disco. */
  onDisk: string;
};

/**
 * Decide si un archivo ha cambiado en el disco desde que Prisma lo abrió.
 *
 * Si es así, no se guarda: escribirlo dejaría fuera los cambios que hizo otra
 * persona o programa, y Prisma no tiene forma de mezclarlos. Es preferible
 * avisar y dejar que el usuario decida.
 *
 * Devuelve el mensaje para el usuario, o `null` si se puede guardar.
 */
export function externalChangeMessage(file: ExternalChange): string | null {
  if (file.onDisk === file.loaded) {
    return null;
  }

  return (
    `"${file.name}" ha cambiado en el disco desde que lo abriste, así que no se ha guardado ` +
    `para no perder esos cambios. Cierra la pestaña y vuelve a abrir el archivo si quieres ` +
    `trabajar sobre la versión que está en el disco.`
  );
}

/** Estado que se guarda en disco entre sesiones. */
export function buildSessionState(
  projectPath: string,
  tabs: OpenTab[],
  activePath: string | null,
  cursors: CursorMap,
): SessionState {
  return {
    ...emptySession(),
    lastProject: projectPath,
    activePath,
    openTabs: tabs.map((item) => ({
      path: item.path,
      name: item.name,
      line: cursors[item.path]?.line ?? 0,
    })),
  };
}

/**
 * Pestañas de la sesión que se pueden recuperar: las que siguen existiendo en
 * el árbol del proyecto y son compatibles con el editor. Las demás se descartan
 * sin impedir la recuperación del resto.
 *
 * Se devuelven las entradas de la sesión tal cual, incluida la línea del cursor
 * guardada, porque el contenido real solo se puede leer después, archivo a archivo.
 */
export function restorableTabs(session: SessionState, tree: ProjectNode): SessionTab[] {
  const found: SessionTab[] = [];

  for (const item of session.openTabs) {
    const node = findNodeByPath(tree, item.path);

    if (node === null || node.kind !== "file" || node.language === null) {
      continue;
    }

    found.push({ path: node.path, name: node.name, line: item.line });
  }

  return found;
}

/** Índice de la pestaña que debe quedar activa tras recuperar la sesión. */
export function restoredActiveIndex(
  tabs: ReadonlyArray<{ path: string }>,
  session: SessionState,
): number {
  if (tabs.length === 0) {
    return -1;
  }

  if (session.activePath !== null) {
    const index = tabs.findIndex((item) => item.path === session.activePath);

    if (index >= 0) {
      return index;
    }
  }

  return 0;
}

export function findNodeByPath(node: ProjectNode, path: string): ProjectNode | null {
  if (node.path === path) {
    return node;
  }

  for (const child of node.children) {
    const found = findNodeByPath(child, path);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

export function flattenFiles(node: ProjectNode, out: ProjectNode[] = []): ProjectNode[] {
  for (const child of node.children) {
    if (child.kind === "folder") {
      flattenFiles(child, out);
    } else {
      out.push(child);
    }
  }

  return out;
}

// Ayudas solo para las pruebas, para no repetir literales en cada caso.
export const fixtures = { buffer, tab };
