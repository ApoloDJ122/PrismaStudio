export type NodeKind = "file" | "folder";

export interface ProjectNode {
  name: string;
  path: string;
  kind: NodeKind;
  language: string | null;
  children: ProjectNode[];
}

export interface ProjectInfo {
  name: string;
  path: string;
  created: boolean;
  tree: ProjectNode;
}

export interface ProjectFile {
  name: string;
  path: string;
  language: string;
  content: string;
}

export interface FileBuffer {
  name: string;
  language: string;
  content: string;
  savedContent: string;
}

export interface SearchMatch {
  name: string;
  path: string;
  line: number;
  preview: string;
}

/**
 * Archivo encontrado por el escaneo de analisis (M2.1.0).
 *
 * Solo contiene nombre y tamanos: el escaneo no lee el contenido, porque cada
 * archivo se trae aparte y solo los que interesan.
 */
export interface ScannedFile {
  /** Ruta completa, en la misma forma que la del arbol de archivos. */
  path: string;
  /** Ruta relativa a la raiz, con `/` como separador. */
  relativePath: string;
  /** Nombre con extension. */
  name: string;
  /** Extension en minusculas sin el punto: el ultimo tramo del nombre. */
  extension: string;
  size: number;
}

/**
 * Resultado del escaneo de analisis.
 *
 * Es solo lectura: no toca ningun archivo del proyecto que se abre.
 */
export interface ProjectScan {
  files: ScannedFile[];
  /** Avisos del recorrido, por ejemplo carpetas que no se pudieron abrir. */
  warnings: string[];
  /** `true` si el proyecto tiene mas archivos de los que se pueden recorrer. */
  truncated: boolean;
}
