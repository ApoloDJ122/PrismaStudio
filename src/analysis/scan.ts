/**
 * M2.1.0 - Del escaneo de Rust a los archivos del modelo.
 *
 * El escaneo de Tauri devuelve solo nombres y tamanos. Aqui se decide que papel
 * juega cada archivo en el proyecto: si es un documento, una hoja de estilo, un
 * script o algo que se ignora. Es pura transformacion de datos: no se leen
 * archivos ni se decide nada sobre el disco.
 *
 * La lista de carpetas ignoradas la fija la interfaz y se pasa a Rust: por
 * defecto `node_modules`, `.git`, `target`, `dist`, `build` y `vendor`, y se
 * puede ampliar sin tocar este archivo.
 */

import { extensionOf, isBladeFile } from "../designer/classify.ts";
import type { ScannedFile } from "../types/project.ts";
import type { FileModel, FileType } from "./types.ts";

/** Carpetas que no se recorren salvo que la interfaz diga lo contrario. */
export const DEFAULT_IGNORED_DIRS = ["node_modules", ".git", "target", "dist", "build", "vendor"];

const HTML_EXTENSIONS = new Set(["html", "htm"]);
const JAVASCRIPT_EXTENSIONS = new Set(["js", "mjs", "cjs"]);
const TYPESCRIPT_EXTENSIONS = new Set(["ts", "tsx", "mts", "cts"]);

/**
 * Que papel juega un archivo en el proyecto.
 *
 * Un `.blade.php` se reconoce primero, porque su extension es `php` y sin esa
 * comprobacion se meteria con el resto de plantillas del servidor.
 */
export function fileTypeOf(path: string): FileType {
  if (isBladeFile(path)) {
    return "blade";
  }

  const extension = extensionOf(path);

  if (HTML_EXTENSIONS.has(extension)) {
    return "html";
  }

  if (extension === "css") {
    return "css";
  }

  if (JAVASCRIPT_EXTENSIONS.has(extension)) {
    return "javascript";
  }

  if (TYPESCRIPT_EXTENSIONS.has(extension)) {
    return "typescript";
  }

  return "other";
}

/**
 * Convierte un archivo del escaneo en un archivo del modelo.
 *
 * La extension se queda tal como la trae el disco: el ultimo tramo del nombre,
 * que en un Blade es `php`. Para saber el papel que juega el archivo no se mira
 * la extension sino el tipo, y un Blade se reconoce por su nombre completo.
 */
export function buildFileModel(scanned: ScannedFile): FileModel {
  return {
    path: scanned.path,
    relativePath: scanned.relativePath,
    name: scanned.name,
    extension: scanned.extension,
    type: fileTypeOf(scanned.name),
    size: scanned.size,
  };
}

export function buildFileModels(scanned: ScannedFile[]): FileModel[] {
  return scanned.map(buildFileModel);
}

/** Archivos repartidos por papel. Mantiene el orden del escaneo en cada grupo. */
export interface FileGroups {
  /** HTML y Blade: los unicos que se llegan a analizar. */
  documents: FileModel[];
  /** `.css`: se leen porque son los que dan estilo a los documentos. */
  stylesheets: FileModel[];
  /** JavaScript y TypeScript: se detectan, pero no se leen. */
  scripts: FileModel[];
  /** Todo lo demas: se lista y no participa en el analisis. */
  other: FileModel[];
}

export function groupFiles(files: FileModel[]): FileGroups {
  const groups: FileGroups = { documents: [], stylesheets: [], scripts: [], other: [] };

  for (const file of files) {
    if (file.type === "html" || file.type === "blade") {
      groups.documents.push(file);
    } else if (file.type === "css") {
      groups.stylesheets.push(file);
    } else if (file.type === "javascript" || file.type === "typescript") {
      groups.scripts.push(file);
    } else {
      groups.other.push(file);
    }
  }

  return groups;
}

/**
 * Archivos cuyo contenido interesa leer.
 *
 * Solo los documentos y las hojas de estilo: de JavaScript y del resto no se
 * abre ni un byte, porque el analisis no lo necesita y leer de mas en un
 * proyecto ajeno es tiempo y memoria perdidos.
 */
export function readableFiles(groups: FileGroups): FileModel[] {
  return [...groups.documents, ...groups.stylesheets];
}
