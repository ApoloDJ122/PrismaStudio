import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createFile as createFileRequest,
  createFolder as createFolderRequest,
  deleteEntry as deleteEntryRequest,
  readProjectFile,
  renameEntry as renameEntryRequest,
  saveProjectFile,
  searchProjectFiles,
} from "../services/projects";
import type { FileBuffer, ProjectNode, SearchMatch } from "../types/project";
import { messageOf, type ProjectState } from "./useProject";

type Buffers = Record<string, FileBuffer>;

function isSamePathOrInside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(parent + "\\") || path.startsWith(parent + "/");
}

function parentOf(path: string): string {
  const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return index === -1 ? "" : path.slice(0, index);
}

function rekey(buffers: Buffers, oldPath: string, newPath: string, newName: string): Buffers {
  const result: Buffers = {};

  for (const [key, buffer] of Object.entries(buffers)) {
    if (isSamePathOrInside(key, oldPath)) {
      result[newPath + key.slice(oldPath.length)] =
        key === oldPath ? { ...buffer, name: newName } : buffer;
    } else {
      result[key] = buffer;
    }
  }

  return result;
}

function removeKey(buffers: Buffers, path: string): Buffers {
  const result: Buffers = {};

  for (const [key, buffer] of Object.entries(buffers)) {
    if (!isSamePathOrInside(key, path)) {
      result[key] = buffer;
    }
  }

  return result;
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

/** Estado del editor y operaciones sobre los archivos del proyecto abierto. */
export function useWorkspace(projectState: ProjectState) {
  const { project, applyTree } = projectState;

  const [buffers, setBuffers] = useState<Buffers>({});
  const [activePath, setActivePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [reveal, setReveal] = useState<{ path: string; line: number } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // El ultimo error se guarda tambien en una referencia para poder devolverlo
  // de inmediato a quien lanzo la operacion, sin esperar al siguiente render.
  const lastErrorRef = useRef<string | null>(null);

  const reportError = useCallback((message: string) => {
    lastErrorRef.current = message;
    setError(message);
  }, []);

  const clearError = useCallback(() => {
    lastErrorRef.current = null;
    setError(null);
  }, []);

  // Referencias para que los manejadores no dependan del estado y puedan memoizarse.
  const projectRef = useRef(project);
  const buffersRef = useRef(buffers);
  const activePathRef = useRef(activePath);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    buffersRef.current = buffers;
  }, [buffers]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  const selectFile = useCallback(async (path: string, revealLine?: number) => {
    const current = projectRef.current;

    if (current === null) {
      return;
    }

    clearError();

    if (revealLine !== undefined) {
      setReveal({ path, line: revealLine });
    }

    if (buffersRef.current[path] !== undefined) {
      setActivePath(path);
      return;
    }

    setIsLoadingFile(true);

    try {
      const file = await readProjectFile(path, current.path);

      // Se indexa por la ruta del arbol, no por la que devuelve Rust: en Windows
      // Rust entrega rutas canonicalizadas y no coincidirian con las del arbol.
      setBuffers((buffersNow) => ({
        ...buffersNow,
        [path]: {
          name: file.name,
          language: file.language,
          content: file.content,
          savedContent: file.content,
        },
      }));
      setActivePath(path);
    } catch (cause) {
      reportError(messageOf(cause, "No se pudo abrir el archivo."));
    } finally {
      setIsLoadingFile(false);
    }
  }, [clearError, reportError]);

  const updateContent = useCallback((content: string) => {
    const path = activePathRef.current;

    if (path === null) {
      return;
    }

    setBuffers((current) => {
      const buffer = current[path];

      if (buffer === undefined) {
        return current;
      }

      return { ...current, [path]: { ...buffer, content } };
    });
  }, []);

  const dirtyPaths = useMemo(() => {
    const paths = new Set<string>();

    for (const [path, buffer] of Object.entries(buffers)) {
      if (buffer.content !== buffer.savedContent) {
        paths.add(path);
      }
    }

    return paths;
  }, [buffers]);

  const hasUnsavedChanges = dirtyPaths.size > 0;

  const activeBuffer = activePath === null ? undefined : buffers[activePath];
  const isActiveDirty =
    activeBuffer !== undefined && activeBuffer.content !== activeBuffer.savedContent;

  /** Guarda un archivo. Devuelve null si se guardo o el mensaje de error. */
  const saveBuffer = useCallback(
    async (path: string): Promise<string | null> => {
      const current = projectRef.current;
      const buffer = buffersRef.current[path];

      if (current === null || buffer === undefined || buffer.content === buffer.savedContent) {
        return null;
      }

      try {
        await saveProjectFile(path, buffer.content, current.path);
      } catch (cause) {
        const message = messageOf(cause, "No se pudo guardar el archivo.");
        reportError(message);
        return message;
      }

      setBuffers((buffersNow) => {
        const saved = buffersNow[path];
        return saved === undefined
          ? buffersNow
          : { ...buffersNow, [path]: { ...saved, savedContent: saved.content } };
      });

      return null;
    },
    [reportError],
  );

  const saveActiveFile = useCallback(async () => {
    const path = activePathRef.current;

    if (path === null) {
      return;
    }

    setIsBusy(true);
    try {
      await saveBuffer(path);
    } finally {
      setIsBusy(false);
    }
  }, [saveBuffer]);

  /** Guarda todos los archivos pendientes. Devuelve null o el error que lo detuvo. */
  const saveAll = useCallback(async (): Promise<string | null> => {
    setIsBusy(true);

    try {
      for (const path of [...dirtyPaths]) {
        const failure = await saveBuffer(path);

        if (failure !== null) {
          return failure;
        }
      }

      return null;
    } finally {
      setIsBusy(false);
    }
  }, [dirtyPaths, saveBuffer]);

  const runMutation = useCallback(
    async (
      action: () => Promise<ProjectNode>,
      fallbackError: string,
    ): Promise<{ tree: ProjectNode | null; error: string | null }> => {
      setIsBusy(true);

      try {
        const tree = await action();
        clearError();
        applyTree(tree);
        return { tree, error: null };
      } catch (cause) {
        const message = messageOf(cause, fallbackError);
        reportError(message);
        return { tree: null, error: message };
      } finally {
        setIsBusy(false);
      }
    },
    [applyTree, clearError, reportError],
  );

  /** Crea un archivo o una carpeta. Devuelve null si funciono o el error. */
  const createEntry = useCallback(
    async (kind: "file" | "folder", parentPath: string, name: string): Promise<string | null> => {
      const current = projectRef.current;

      if (current === null) {
        return null;
      }

      const { tree, error } = await runMutation(
        () =>
          kind === "file"
            ? createFileRequest(current.path, parentPath, name)
            : createFolderRequest(current.path, parentPath, name),
        kind === "file" ? "No se pudo crear el archivo." : "No se pudo crear la carpeta.",
      );

      if (tree === null) {
        return error;
      }

      // Un archivo nuevo compatible se abre directamente en el editor.
      if (kind === "file") {
        const created = findNodeByPath(tree, parentPath)?.children.find(
          (child) => child.name === name,
        );

        if (created !== undefined && created.language !== null) {
          await selectFile(created.path);
        }
      }

      return null;
    },
    [runMutation, selectFile],
  );

  const renameEntry = useCallback(
    async (path: string, newName: string): Promise<string | null> => {
      const current = projectRef.current;

      if (current === null) {
        return null;
      }

      const { tree, error } = await runMutation(
        () => renameEntryRequest(current.path, path, newName),
        "No se pudo renombrar el elemento.",
      );

      if (tree === null) {
        return error;
      }

      // La nueva ruta se localiza en el arbol devuelto, sin reconstruirla a mano.
      const renamedNode = findNodeByPath(tree, parentOf(path))?.children.find(
        (child) => child.name === newName,
      );

      if (renamedNode === undefined) {
        return null;
      }

      const renamedPath = renamedNode.path;

      setBuffers((buffersNow) => {
        const next = rekey(buffersNow, path, renamedPath, newName);
        buffersRef.current = next;
        return next;
      });

      // El archivo abierto sigue al elemento renombrado, conservando sus cambios.
      const openFile = activePathRef.current;

      if (openFile !== null && isSamePathOrInside(openFile, path)) {
        setActivePath(renamedPath + openFile.slice(path.length));
      }

      return null;
    },
    [runMutation],
  );

  const deleteEntry = useCallback(
    async (path: string): Promise<string | null> => {
      const current = projectRef.current;

      if (current === null) {
        return null;
      }

      const { error } = await runMutation(
        () => deleteEntryRequest(current.path, path),
        "No se pudo eliminar el elemento.",
      );

      if (error !== null) {
        return error;
      }

      setBuffers((buffersNow) => {
        const next = removeKey(buffersNow, path);
        buffersRef.current = next;
        return next;
      });

      if (activePathRef.current !== null && isSamePathOrInside(activePathRef.current, path)) {
        setActivePath(null);
      }

      return null;
    },
    [runMutation],
  );

  const resetWorkspace = useCallback(() => {
    setBuffers({});
    setActivePath(null);
    setReveal(null);
    setQuery("");
    setResults([]);
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (project === null) {
      resetWorkspace();
    }
  }, [project, resetWorkspace]);

  useEffect(() => {
    const trimmed = query.trim();

    if (project === null || trimmed.length === 0) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const timer = setTimeout(() => {
      searchProjectFiles(project.path, trimmed)
        .then(setResults)
        .catch((cause: unknown) => {
          reportError(messageOf(cause, "No se pudo buscar en el proyecto."));
          setResults([]);
        })
        .finally(() => setIsSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, project, reportError]);

  return {
    buffers,
    activePath,
    activeBuffer,
    isActiveDirty,
    dirtyPaths,
    hasUnsavedChanges,
    error,
    isBusy,
    isLoadingFile,
    reveal,
    query,
    results,
    isSearching,
    selectFile,
    updateContent,
    saveActiveFile,
    saveAll,
    createEntry,
    renameEntry,
    deleteEntry,
    setQuery,
    clearReveal: () => setReveal(null),
    reportError,
    clearError,
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspace>;
