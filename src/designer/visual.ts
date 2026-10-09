import { flatten, textContent } from "./tree.ts";
import type { PrismaId, PrismaNode } from "./types.ts";

/**
 * M2.2.1 - Separación visual/técnico para el lienzo y el árbol.
 *
 * El modelo (`parse` + `tree`) conserva TODO el documento: `head`, `meta`,
 * `link`, `script`, directivas Blade y comentarios. Esta capa decide qué parte
 * se dibuja. Es solo lectura y nunca modifica el modelo: la fidelidad del
 * roundtrip no depende de lo que aquí se oculte.
 *
 * Reglas:
 * - Si hay `<body>`, el lienzo son sus hijos (lo que un navegador muestra).
 * - Sin `<body>` (fragmento), son las raíces menos lo técnico.
 * - Lo técnico (`html`, `head`, `meta`, `title`, `link`, `base`, `script`,
 *   `style`) se conserva en el modelo y en el HTML, pero no ocupa espacio
 *   visual.
 * - Los textos con solo espacios (sangría del archivo) no se dibujan: son
 *   formato, no contenido.
 * - Lo dinámico Blade (`dynamic`, `directive`) se dibuja como insignia: existe
 *   y se conserva, pero no se intenta representar su resultado.
 */

/** Etiquetas que viven en el modelo pero no se dibujan. */
export const TECHNICAL_TAGS: ReadonlySet<string> = new Set([
  "html",
  "head",
  "base",
  "meta",
  "title",
  "link",
  "script",
  "style",
]);

/** `true` si la etiqueta es técnica y no debe ocupar espacio visual. */
export function isTechnicalTag(tag: string | null): boolean {
  return tag !== null && TECHNICAL_TAGS.has(tag.toLowerCase());
}

/** `true` si el nodo es un elemento dibujable en el lienzo. */
export function isVisualElement(node: PrismaNode): boolean {
  return node.kind === "element" && !isTechnicalTag(node.tag);
}

/** `true` si el nodo aporta algo visible (elemento, texto con contenido o Blade). */
export function isVisualNode(node: PrismaNode): boolean {
  if (node.kind === "element") {
    return isVisualElement(node);
  }

  if (node.kind === "text") {
    return (node.content ?? "").trim() !== "";
  }

  return node.kind === "dynamic" || node.kind === "directive";
}

/** El `<body>` del documento, o `null` si es un fragmento. */
export function bodyOf(roots: PrismaNode[]): PrismaNode | null {
  return (
    flatten(roots).find((node) => node.kind === "element" && node.tag === "body") ?? null
  );
}

/** Nodos que el lienzo dibuja como primer nivel. */
export function canvasNodes(roots: PrismaNode[]): PrismaNode[] {
  const body = bodyOf(roots);
  const source = body !== null ? body.children : roots;
  return source.filter(isVisualNode);
}

/** Hijos dibujables de un contenedor (para el lienzo y el árbol). */
export function visualChildren(node: PrismaNode): PrismaNode[] {
  return node.children.filter(isVisualNode);
}

/**
 * Dónde cae un elemento soltado sobre el fondo del lienzo.
 *
 * El `<body>` si existe (así el botón queda DENTRO del body, no fuera del
 * documento); `null` cuando es un fragmento y el primer nivel es la página.
 */
export function canvasContainerId(roots: PrismaNode[]): PrismaId | null {
  return bodyOf(roots)?.id ?? null;
}

/** Texto corto para mostrar un nodo en el árbol o en la etiqueta de selección. */
export function displayLabel(node: PrismaNode): string {
  if (node.kind === "element") {
    return node.tag ?? "element";
  }

  if (node.kind === "text") {
    const text = (node.content ?? "").trim().replace(/\s+/g, " ");
    return text.length > 28 ? `${text.slice(0, 28)}…` : text;
  }

  if (node.kind === "dynamic") {
    return "{{ … }}";
  }

  if (node.kind === "directive") {
    return "@…";
  }

  return node.kind;
}

/** Texto interior recortado, para el panel de propiedades. */
export function nodeText(node: PrismaNode, limit = 200): string {
  return textContent(node).trim().slice(0, limit);
}

/** `true` si el elemento solo contiene texto (editable desde propiedades). */
export function isSimpleTextElement(node: PrismaNode): boolean {
  if (node.kind !== "element" || node.tag === null) {
    return false;
  }

  return node.children.every((child) => child.kind === "text" || child.kind === "comment");
}
