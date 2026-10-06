/**
 * M2.1.0 - Del escaneo de un proyecto a su modelo de analisis.
 *
 * `analyzeProject` es la entrada unica del analisis. Recibe lo que ya se sabe
 * sin abrir ningun archivo mas (los nombres del escaneo), los contenidos que si
 * se han traido y los avisos de quien los trajo, y devuelve el `ProjectModel`
 * completo. No toca el disco: todo lo que llega, llega ya leido.
 *
 * El orden del proceso es el que sigue la mayoria de analizadores y el que aqui
 * se explica de un vistazo:
 *
 *   1. Los avisos del escaneo y de las lecturas fallidas.
 *   2. Cada documento HTML o Blade, por su cuenta. Si uno no se puede analizar
 *      se anota y se sigue con el siguiente.
 *   3. Cada `.css`, del mismo modo.
 *   4. Las referencias de cada documento, ahora que se conocen todos los
 *      archivos, para decir si cada `href` y cada `src` resuelve o no.
 *   5. El resumen y la lista final de advertencias.
 *
 * Un archivo no se abre aqui: quien trae los contenidos decide que abrir, y si
 * algo falla se pasa en `readFailures` y se convierte en una advertencia. Esa
 * separacion es la que permite que el analisis funcione igual sobre Tauri y
 * sobre un conjunto de textos en una prueba.
 */

import { parseStylesheet } from "../designer/css.ts";
import { buildDocument, emptyDocument } from "./document.ts";
import { groupFiles } from "./scan.ts";
import { assignWarningIds, createWarningList } from "./warnings.ts";
import type {
  AnalysisWarning,
  DocumentModel,
  FileModel,
  ProjectAnalysis,
  ProjectModel,
  StylesheetModel,
} from "./types.ts";

/** Archivo que existia pero no se pudo leer, con su motivo. */
export interface ReadFailure {
  path: string;
  /** Ruta relativa, para poder mostrarla tal cual se ve en el proyecto. */
  relativePath: string;
  message: string;
}

export interface AnalyzeProjectInput {
  /** Carpeta raiz del proyecto. */
  rootPath: string;
  name: string;
  /** Todos los archivos del escaneo, ya convertidos en modelos. */
  files: FileModel[];
  /** Contenido de los archivos que se decidio leer, por ruta completa. */
  contents: Record<string, string>;
  /** Archivos que se intentaron leer y no se pudieron. */
  readFailures: ReadFailure[];
  /** Avisos que trajo el escaneo de carpetas. */
  scanWarnings: string[];
  /** `true` si el escaneo dejo de contar archivos por llegar al tope. */
  truncated: boolean;
}

/**
 * Analiza un proyecto y devuelve su modelo.
 *
 * Nunca lanza por un archivo problematico: lo que falla se anota y se sigue.
 * Solo se lanza si el lector de M2.0.0 no sabe leer algo que no deberia poder
 * romperlo, cosa que las pruebas se encargan de cubrir.
 */
export function analyzeProject(input: AnalyzeProjectInput): ProjectModel {
  const groups = groupFiles(input.files);
  const projectList = createWarningList(null);

  for (const message of input.scanWarnings) {
    projectList.add({
      type: "scan",
      severity: "warning",
      message,
      file: null,
      line: 0,
    });
  }

  if (input.truncated) {
    projectList.add({
      type: "scan",
      severity: "warning",
      message:
        "El proyecto tiene mas archivos de los que se pueden recorrer: parte del analisis puede quedar incompleto.",
      file: null,
      line: 0,
    });
  }

  for (const failure of input.readFailures) {
    projectList.add({
      type: "unreadable",
      severity: "error",
      message: `No se pudo leer el archivo: ${failure.message}`,
      file: failure.relativePath,
      line: 0,
    });
  }

  // 2. Documentos.
  const documents: DocumentModel[] = [];

  for (const file of groups.documents) {
    const content = input.contents[file.path];

    if (content === undefined) {
      documents.push(emptyDocument(file));
      continue;
    }

    try {
      documents.push(buildDocument(file, content));
    } catch (cause) {
      documents.push(emptyDocument(file, parseWarning(file, cause)));
    }
  }

  // 3. Hojas de estilo.
  const stylesheets: StylesheetModel[] = [];

  for (const file of groups.stylesheets) {
    const content = input.contents[file.path];

    if (content === undefined) {
      stylesheets.push({ file, stylesheet: { path: file.relativePath, rules: [] }, ruleCount: 0 });
      continue;
    }

    try {
      const stylesheet = parseStylesheet(content, file.relativePath);
      stylesheets.push({ file, stylesheet, ruleCount: stylesheet.rules.length });
    } catch (cause) {
      stylesheets.push({ file, stylesheet: { path: file.relativePath, rules: [] }, ruleCount: 0 });
      projectList.add(parseWarning(file, cause));
    }
  }

  // 4. Referencias, ya conociendo todos los archivos del proyecto.
  const knownPaths = new Set(input.files.map((file) => file.relativePath));

  for (const document of documents) {
    for (const reference of document.linkedStylesheets) {
      if (reference.external || reference.resolvedPath === null) {
        continue;
      }

      reference.found = knownPaths.has(reference.resolvedPath);

      if (!reference.found) {
        document.warnings.push({
          id: "",
          type: "unresolved-reference",
          severity: "warning",
          file: document.relativePath,
          line: reference.line,
          message: `La hoja de estilo "${reference.href}" no se encuentra en el proyecto.`,
        });
      }
    }

    for (const reference of document.linkedScripts) {
      if (reference.inline || reference.external || reference.resolvedPath === null) {
        continue;
      }

      reference.found = knownPaths.has(reference.resolvedPath);

      if (!reference.found) {
        document.warnings.push({
          id: "",
          type: "unresolved-reference",
          severity: "warning",
          file: document.relativePath,
          line: reference.line,
          message: `El script "${reference.src ?? reference.resolvedPath}" no se encuentra en el proyecto.`,
        });
      }
    }
  }

  // 5. Resumen y lista final.
  projectList.finish();

  const documentWarnings = documents.flatMap((document) => document.warnings);
  const warnings = [...projectList.warnings, ...documentWarnings];

  assignWarningIds(warnings);

  const analysis = buildSummary(input, groups, documents, stylesheets, warnings.length);

  return {
    rootPath: input.rootPath,
    name: input.name,
    files: input.files,
    documents,
    stylesheets,
    scripts: groups.scripts,
    analysis,
    warnings,
  };
}

/** Aviso de un archivo que el lector no ha sabido interpretar. */
function parseWarning(file: FileModel, cause: unknown): AnalysisWarning {
  const reason = cause instanceof Error ? cause.message : String(cause);

  return {
    id: "",
    type: "parse-error",
    severity: "error",
    file: file.relativePath,
    line: 0,
    message: `No se pudo analizar este archivo: ${reason}`,
  };
}

function buildSummary(
  input: AnalyzeProjectInput,
  groups: ReturnType<typeof groupFiles>,
  documents: DocumentModel[],
  stylesheets: StylesheetModel[],
  warningCount: number,
): ProjectAnalysis {
  const elementCount = documents.reduce((total, document) => total + document.elementCount, 0);
  const ruleCount = stylesheets.reduce((total, sheet) => total + sheet.ruleCount, 0);

  const unresolvedCount = documents.reduce((total, document) => {
    const stylesheetsMissing = document.linkedStylesheets.filter(
      (reference) => !reference.external && !reference.found,
    ).length;
    const scriptsMissing = document.linkedScripts.filter(
      (reference) => !reference.inline && !reference.external && !reference.found,
    ).length;
    return total + stylesheetsMissing + scriptsMissing;
  }, 0);

  return {
    fileCount: input.files.length,
    documentCount: documents.length,
    htmlCount: documents.filter((document) => document.type === "html").length,
    bladeCount: documents.filter((document) => document.type === "blade").length,
    stylesheetCount: stylesheets.length,
    scriptCount: groups.scripts.length,
    otherCount: groups.other.length,
    elementCount,
    ruleCount,
    warningCount,
    unresolvedCount,
  };
}
