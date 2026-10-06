/**
 * M2.1.0 - De un archivo HTML o Blade a su documento analizado.
 *
 * Este es el corazon del analisis: coge el texto de un archivo, lo pasa por el
 * lector de M2.0.0 y devuelve el documento con su arbol, sus hojas de estilo,
 * sus scripts y sus advertencias.
 *
 * Tres ideas gobiernan aqui el codigo:
 *
 *   - El arbol es el de M2.0.0, sin tocar. Los elementos que Prisma no conoce
 *     se conservan con su etiqueta original, sus atributos y su linea: nada de
 *     lo que hay en el archivo se pierde por no estar catalogado.
 *   - Cada referencia se comprueba contra lo que el proyecto tiene de verdad.
 *     Si no se puede resolver, se anota y se sigue.
 *   - Un problema de este archivo no corta el analisis. Todo lo raro se vuelve
 *     una `AnalysisWarning` y el documento se termina igualmente.
 *
 * No se ejecuta nada de lo que se lee: ni PHP, ni JavaScript, ni directivas de
 * plantilla. Lo dinamico se conserva como texto y se dice que es dinamico.
 */

import { isExternalReference, resolveReference } from "./refs.ts";
import { attributeValue, flatten } from "../designer/tree.ts";
import { parseMarkup } from "../designer/parse.ts";
import type { PrismaNode } from "../designer/types.ts";
import { createWarningList } from "./warnings.ts";
import type {
  AnalysisWarning,
  DocumentModel,
  FileModel,
  ScriptReference,
  StyleSheetReference,
} from "./types.ts";

/** Crea un documento vacio para un archivo que no se pudo leer ni analizar. */
export function emptyDocument(file: FileModel, warning?: AnalysisWarning): DocumentModel {
  if (warning !== undefined) {
    warning.file = file.relativePath;
  }

  return {
    id: file.relativePath,
    filePath: file.path,
    relativePath: file.relativePath,
    type: file.type === "blade" ? "blade" : "html",
    title: null,
    root: [],
    linkedStylesheets: [],
    linkedScripts: [],
    inlineStylesheets: 0,
    elementCount: 0,
    inlineStyleCount: 0,
    warnings: warning === undefined ? [] : [warning],
    elementWarnings: {},
  };
}

/** `true` si el `<link>` pide una hoja de estilo. */
function requestsStyleSheet(node: PrismaNode): boolean {
  const rel = (attributeValue(node, "rel") ?? "").toLowerCase();
  return rel.split(/\s+/).includes("stylesheet");
}

/** Lee un atributo sin importar como este escrito en el archivo. */
function attribute(node: PrismaNode, name: string): string | null {
  return attributeValue(node, name);
}

/** `true` si el nodo es un `<!DOCTYPE ...>`, que no es un problema de lectura. */
function isDoctype(node: PrismaNode): boolean {
  return /^<!doctype/i.test(node.source.trim());
}

/**
 * Fina donde acaba la etiqueta de apertura, sin confundirse con un `>` que este
 * dentro de una comilla.
 */
function openingTagEnd(source: string): number {
  let quote = "";

  for (let index = 1; index < source.length; index += 1) {
    const character = source[index] ?? "";

    if (quote !== "") {
      if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") {
      return index;
    }
  }

  return -1;
}

/**
 * Texto de un elemento de texto sin interpretar, como `<title>`.
 *
 * En estos elementos el lector no crea hijos: guarda la etiqueta y su contenido
 * enteros en `source`, que es la unica manera de reconstruir el archivo sin
 * cambiar nada. El texto se recupera de ahi.
 */
function rawTextOf(node: PrismaNode): string {
  const end = openingTagEnd(node.source);

  if (end < 0) {
    return "";
  }

  return node.source.slice(end + 1);
}

/**
 * Analiza un documento HTML o Blade.
 *
 * Lanza si el lector no puede con el texto; quien llama decide que hacer con el
 * archivo que falla. El resto del proyecto sigue analizandose igual.
 */
export function buildDocument(file: FileModel, source: string): DocumentModel {
  const design = parseMarkup(source, file.relativePath);
  const list = createWarningList(file.relativePath);
  const elementWarnings: Record<string, AnalysisWarning[]> = {};
  const linkedStylesheets: StyleSheetReference[] = [];
  const linkedScripts: ScriptReference[] = [];

  let title: string | null = null;
  let elementCount = 0;
  let inlineStyleCount = 0;
  let inlineStylesheets = 0;
  let dynamicLine = 0;

  function warn(
    type: Parameters<typeof list.add>[0]["type"],
    severity: Parameters<typeof list.add>[0]["severity"],
    message: string,
    line: number,
    elementId?: string,
  ): void {
    const created = list.add({
      type,
      severity,
      message,
      file: file.relativePath,
      line,
    });

    if (created !== null && elementId !== undefined) {
      const bucket = elementWarnings[elementId];
      if (bucket === undefined) {
        elementWarnings[elementId] = [created];
      } else {
        bucket.push(created);
      }
    }
  }

  for (const node of flatten(design.roots)) {
    if (node.kind === "element") {
      elementCount += 1;

      if (node.tag === "title" && title === null) {
        const text = rawTextOf(node).trim();
        if (text !== "") {
          title = text;
        }
      }

      if (node.tag === "link" && requestsStyleSheet(node)) {
        const href = attribute(node, "href");

        if (href === null || href.trim() === "") {
          warn(
            "unresolved-reference",
            "warning",
            "Un <link rel=\"stylesheet\"> no tiene atributo href: no se sabe que estilo debe cargar.",
            node.origin.line,
            node.id,
          );
        } else {
          const external = isExternalReference(href);
          const resolvedPath = external ? null : resolveReference(file.relativePath, href);

          linkedStylesheets.push({
            href,
            resolvedPath,
            external,
            found: false,
            line: node.origin.line,
          });

          if (resolvedPath === null && !external) {
            warn(
              "unresolved-reference",
              "warning",
              `La hoja de estilo "${href}" queda fuera del proyecto y no se puede cargar.`,
              node.origin.line,
              node.id,
            );
          }
        }
      }

      if (node.tag === "script") {
        const src = attribute(node, "src");

        if (src === null || src.trim() === "") {
          linkedScripts.push({
            src: null,
            resolvedPath: null,
            external: false,
            inline: true,
            found: true,
            line: node.origin.line,
          });

          warn(
            "dynamic-content",
            "info",
            "Este documento lleva JavaScript incrustado: se conserva tal cual, pero no se ejecuta ni se analiza.",
            node.origin.line,
            node.id,
          );
        } else {
          const external = isExternalReference(src);

          linkedScripts.push({
            src,
            resolvedPath: external ? null : resolveReference(file.relativePath, src),
            external,
            inline: false,
            found: false,
            line: node.origin.line,
          });
        }
      }

      if (node.tag === "style") {
        inlineStylesheets += 1;

        warn(
          "inline-styles",
          "info",
          "Este documento lleva una hoja de estilo dentro de <style>: se conserva como texto y todavia no se analiza.",
          node.origin.line,
          node.id,
        );
      }

      if (attribute(node, "style") !== null) {
        inlineStyleCount += 1;
      }

      if (!node.known) {
        const component = node.blade !== null && node.blade.form === "component";
        const tag = node.tag;

        warn(
          "unknown-element",
          "info",
          component
            ? `Componente Blade <${tag}>: se conserva con su origen, pero su plantilla no se resuelve todavia.`
            : `La etiqueta <${tag}> no es HTML conocido; se conserva tal cual, con sus atributos y sus hijos.`,
          node.origin.line,
          node.id,
        );
      }

      continue;
    }

    if (node.kind === "unknown") {
      // El `<!DOCTYPE>` tambien llega como algo no catalogado, pero no es un
      // problema: es parte normal del HTML y ya se conserva tal cual.
      if (!isDoctype(node)) {
        warn(
          "unsupported-markup",
          "warning",
          "Hay una parte del archivo que Prisma no sabe interpretar: se conserva sin cambios.",
          node.origin.line,
          node.id,
        );
      }

      continue;
    }

    if (
      node.kind === "directive" ||
      node.kind === "dynamic" ||
      (node.kind === "comment" && node.blade !== null)
    ) {
      if (dynamicLine === 0) {
        dynamicLine = node.origin.line;
      }
    }
  }

  if (dynamicLine > 0) {
    warn(
      "dynamic-content",
      "info",
      file.type === "blade"
        ? "Documento Blade: las directivas y las salidas dinamicas se conservan tal cual, pero Prisma no las ejecuta."
        : "Este documento HTML contiene sintaxis de plantilla: se conserva tal cual, pero no se interpreta.",
      dynamicLine,
    );
  }

  list.finish();

  return {
    id: file.relativePath,
    filePath: file.path,
    relativePath: file.relativePath,
    type: file.type === "blade" ? "blade" : "html",
    title,
    root: design.roots,
    linkedStylesheets,
    linkedScripts,
    inlineStylesheets,
    elementCount,
    inlineStyleCount,
    warnings: list.warnings,
    elementWarnings,
  };
}
