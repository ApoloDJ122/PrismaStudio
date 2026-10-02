/** Archivo HTML que Prisma abre en el navegador al ejecutar un proyecto. */
export interface RunTarget {
  /** Ruta completa, con la misma forma que usa el árbol de archivos. */
  path: string;
  /** Ruta respecto al proyecto, siempre con `/` como separador. */
  relativePath: string;
  /** `true` si es el `index.html` de la raíz del proyecto. */
  isRootIndex: boolean;
}

/** Una pestaña abierta, recordada entre sesiones. */
export interface SessionTab {
  path: string;
  name: string;
  /** Línea del cursor. `0` significa que no se recuerda. */
  line: number;
}

/**
 * Información mínima para reconstruir el workspace al reabrir Prisma.
 * Nunca guarda el contenido de los archivos: los archivos del disco siguen
 * siendo la única fuente de verdad.
 */
export interface SessionState {
  version: number;
  lastProject: string | null;
  openTabs: SessionTab[];
  activePath: string | null;
}

/** Sesión vacía: equivalente a no haber guardado nada. */
export function emptySession(): SessionState {
  return { version: 1, lastProject: null, openTabs: [], activePath: null };
}
