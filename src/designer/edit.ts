import { ensureDesignClass, designClassOf, isMovableNode } from "./class.ts";
import { isContainerTag } from "./html.ts";
import {
  appendChild,
  createElement,
  detach,
  findById,
  flatten,
  insertAt,
  type IdFactory,
} from "./tree.ts";
import { setRawTextContent, setAttribute, rawTextContent } from "./attributes.ts";
import { ensurePositionRelative, writeBox, type Box } from "./cssEdit.ts";
import type { Attribute, PrismaId, PrismaNode } from "./types.ts";

/**
 * M2.2.0 - Ediciones estructurales del documento.
 *
 * Todas las operaciones que cambian la forma del HTML viven aqui: anadir un
 * elemento, cambiarle de padre, reordenarlo, anadir el `<link>` de una hoja CSS
 * o crear el `<style>` interno. Son funciones puras sobre el modelo: no leen
 * archivos, no hablan con React y no escriben CSS ellos solos.
 *
 * La combinación HTML + CSS que usa el lienzo es `applyMove`: mueve el nodo y
 * deja escrito su `position/absolute/left/top` y el `position: relative` del
 * padre en el texto CSS que se le pase, y devuelve el nuevo texto. Asi una
 * misma funcion se puede probar sin interfaz y serve igual para hoja externa y
 * para `<style>` interno.
 *
 * Todo fallo se devuelve como mensaje en castellano y no como excepcion: la
 * interfaz lo muestra tal cual y el modelo queda intacto.
 */

export type EditResult<T> = { ok: true; value: T } | { ok: false; message: string };
export type SimpleResult = { ok: true } | { ok: false; message: string };

const TAG_NAME = /^[a-z][a-z0-9:-]*$/i;

function fail<T>(message: string): EditResult<T> {
  return { ok: false, message };
}

function okay<T>(value: T): EditResult<T> {
  return { ok: true, value };
}

/**
 * Elemento sobre el que se dibuja el lienzo: el `<body>` si existe, o `null`.
 *
 * Con `null` el lienzo es un documento de fragmentos (varias etiquetas de
 * primer nivel sin `body`) y las raices se pintan directamente sobre la pagina.
 * `head` no se pinta nunca: su contenido no se ve en el navegador.
 */
export function designRootOf(roots: PrismaNode[]): PrismaNode | null {
  return flatten(roots).find((node) => node.kind === "element" && node.tag === "body") ?? null;
}

/** `true` si `ancestorId` es `node` o está por encima de él. */
export function isDescendantOf(node: PrismaNode, ancestorId: PrismaId): boolean {
  if (node.id === ancestorId) {
    return true;
  }

  return node.children.some((child) => isDescendantOf(child, ancestorId));
}

/** `true` si otro nodo puede alojar a `node` sin crear un ciclo. */
export function canContain(parent: PrismaNode, node: PrismaNode): boolean {
  if (parent.kind !== "element" || parent.tag === null) {
    return false;
  }

  if (!isContainerTag(parent.tag)) {
    return false;
  }

  return !isDescendantOf(parent, node.id);
}

/** Todas las hojas CSS enlazadas, en orden de lectura. */
export function linkedStylesheets(roots: PrismaNode[]): string[] {
  const hrefs: string[] = [];

  for (const node of flatten(roots)) {
    if (node.kind !== "element" || node.tag !== "link") {
      continue;
    }

    const rel = node.attributes.find((item) => item.name.toLowerCase() === "rel")?.value ?? "";
    const href = node.attributes.find((item) => item.name.toLowerCase() === "href")?.value ?? null;

    if (href !== null && rel.toLowerCase().split(/\s+/).includes("stylesheet")) {
      hrefs.push(href);
    }
  }

  return hrefs;
}

/** Primer `<style>` del documento, o `null`. */
export function findStyleNode(roots: PrismaNode[]): PrismaNode | null {
  return flatten(roots).find((node) => node.kind === "element" && node.tag === "style") ?? null;
}

/**
 * Selector CSS con el que escribir reglas de posicionamiento para `node`.
 *
 * Orden de preferencia: una clase que ya sea unica en el documento, luego la
 * etiqueta cuando es `body` o `html` (asi el HTML de la raiz no se toca), y si
 * no, una clase automatica nueva. Nunca se elige una clase compartida: mover un
 * elemento no puede mover a los demas que la usan.
 */
export function positionSelector(roots: PrismaNode[], node: PrismaNode): string | null {
  const existing = designClassOf(roots, node);

  if (existing !== null) {
    return `.${existing}`;
  }

  if (node.kind === "element" && (node.tag === "body" || node.tag === "html")) {
    return node.tag;
  }

  if (!isMovableNode(node)) {
    return null;
  }

  return `.${ensureDesignClass(roots, node)}`;
}

function siblingsOf(roots: PrismaNode[], node: PrismaNode): PrismaNode[] {
  if (node.parentId === null) {
    return roots;
  }

  return findById(roots, node.parentId)?.children ?? [];
}

function insertInto(roots: PrismaNode[], parent: PrismaNode | null, child: PrismaNode, index: number | undefined): void {
  if (parent === null) {
    const position = Math.max(0, Math.min(index ?? roots.length, roots.length));
    roots.splice(position, 0, child);
    child.parentId = null;
    return;
  }

  const position = Math.max(0, Math.min(index ?? parent.children.length, parent.children.length));
  insertAt(parent, child, position);
}

/**
 * Anade un elemento nuevo al documento.
 *
 * La clase automatica se anade aqui mismo (regla del diseñador): desde el
 * primer momento el elemento tiene un nombre con el que escribir su CSS, y dos
 * inserciones seguidas de `div` no pueden acabar con la misma clase.
 */
export function insertElement(
  roots: PrismaNode[],
  factory: IdFactory,
  tag: string,
  parentId: PrismaId | null,
  index?: number,
): EditResult<PrismaNode> {
  const normalized = tag.trim().toLowerCase();

  if (!TAG_NAME.test(normalized)) {
    return fail("El nombre de la etiqueta no es válido.");
  }

  let parent: PrismaNode | null = null;

  if (parentId !== null) {
    const found = findById(roots, parentId);

    if (found === null) {
      return fail("El contenedor de destino ya no existe.");
    }

    if (found.kind !== "element" || found.tag === null || !isContainerTag(found.tag)) {
      return fail(`No se puede insertar dentro de <${found.tag ?? "este elemento"}>.`);
    }

    parent = found;
  }

  const node = createElement(factory, normalized);
  ensureDesignClass(roots, node);
  insertInto(roots, parent, node, index);
  return okay(node);
}

/**
 * Cambia el padre de un elemento y, si hace falta, su posición entre los
 * hermanos. Rechaza ciclos: un hijo no puede terminar dentro de su propio
 * descendiente.
 */
export function reparentNode(
  roots: PrismaNode[],
  nodeId: PrismaId,
  newParentId: PrismaId | null,
  index?: number,
): EditResult<PrismaNode> {
  const node = findById(roots, nodeId);

  if (node === null || !isMovableNode(node)) {
    return fail("El elemento que quieres mover ya no está en el documento.");
  }

  const root = designRootOf(roots);

  if (root !== null && node.id === root.id) {
    return fail("La raíz del documento no se puede mover.");
  }

  let parent: PrismaNode | null = null;

  if (newParentId !== null) {
    const found = findById(roots, newParentId);

    if (found === null) {
      return fail("El contenedor de destino ya no existe.");
    }

    if (!canContain(found, node)) {
      return fail("No se puede colocar un elemento dentro de sí mismo.");
    }

    parent = found;
  }

  const sameParent = node.parentId === newParentId;

  if (sameParent && index === undefined) {
    return okay(node);
  }

  if (!detach(roots, node)) {
    return fail("El elemento no se pudo despegar de su sitio actual.");
  }

  insertInto(roots, parent, node, index);
  return okay(node);
}

/**
 * Sube o baja un elemento entre sus hermanos.
 *
 * Es la forma de reordenar sin arrastrar dentro del árbol: el orden del array
 * de hijos ES el orden del HTML, asi que no puede quedar en dos sitios a la vez.
 */
export function reorderNode(
  roots: PrismaNode[],
  nodeId: PrismaId,
  direction: "up" | "down",
): SimpleResult {
  const node = findById(roots, nodeId);

  if (node === null) {
    return { ok: false, message: "El elemento ya no está en el documento." };
  }

  const siblings = siblingsOf(roots, node);
  const position = siblings.indexOf(node);

  if (position < 0) {
    return { ok: false, message: "El elemento no está donde debería." };
  }

  const target = direction === "up" ? position - 1 : position + 1;

  if (target < 0 || target >= siblings.length) {
    return { ok: false, message: "El elemento ya está en el extremo." };
  }

  siblings.splice(position, 1);
  siblings.splice(target, 0, node);
  return { ok: true };
}

/**
 * Garantiza que el documento enlace `href` como hoja CSS.
 *
 * Idempotente: si el `<link>` ya está, no anade otro. Si no hay `head`, el
 * enlace va al principio del documento, que es donde un `<link>` sigue siendo
 * válido.
 */
export function ensureStylesheetLink(
  roots: PrismaNode[],
  factory: IdFactory,
  href: string,
): EditResult<PrismaNode> {
  const existing = flatten(roots).find(
    (node) =>
      node.kind === "element" &&
      node.tag === "link" &&
      node.attributes.some(
        (item) =>
          item.name.toLowerCase() === "href" &&
          item.value === href &&
          (node.attributes.find((other) => other.name.toLowerCase() === "rel")?.value ?? "")
            .toLowerCase()
            .split(/\s+/)
            .includes("stylesheet"),
      ),
  );

  if (existing !== null) {
    return okay(existing);
  }

  const attributes: Attribute[] = [
    { name: "rel", value: "stylesheet", raw: 'rel="stylesheet"' },
    { name: "href", value: href, raw: `href="${href}"` },
  ];

  const link: PrismaNode = {
    id: factory.next(),
    kind: "element",
    tag: "link",
    known: true,
    attributes,
    content: null,
    blade: null,
    children: [],
    parentId: null,
    origin: { path: null, line: 0 },
    source: `<link rel="stylesheet" href="${href}">`,
    closingSource: null,
  };

  const head = flatten(roots).find((node) => node.kind === "element" && node.tag === "head");

  if (head !== null) {
    appendChild(head, link);
    return okay(link);
  }

  roots.splice(0, 0, link);
  link.parentId = null;
  return okay(link);
}

/**
 * Garantiza un `<style>` con `text` por dentro.
 *
 * Si el documento ya tiene uno, se usa ese y se reescribe su contenido. Si no,
 * se crea dentro de `head`, o como primera raiz cuando no hay `head` ni
 * `html`.
 */
export function ensureStyleNode(
  roots: PrismaNode[],
  factory: IdFactory,
  text: string = "",
): EditResult<PrismaNode> {
  const existing = findStyleNode(roots);

  if (existing !== null) {
    setRawTextContent(existing, text);
    return okay(existing);
  }

  const style: PrismaNode = {
    id: factory.next(),
    kind: "element",
    tag: "style",
    known: true,
    attributes: [],
    content: null,
    blade: null,
    children: [],
    parentId: null,
    origin: { path: null, line: 0 },
    source: "<style>",
    closingSource: "</style>",
  };

  const head = flatten(roots).find((node) => node.kind === "element" && node.tag === "head");

  if (head !== null) {
    appendChild(head, style);
  } else {
    roots.splice(0, 0, style);
    style.parentId = null;
  }

  setRawTextContent(style, text);
  return okay(style);
}

/** Texto del `<style>` interno del documento, o `null` si no hay. */
export function readInternalStyle(roots: PrismaNode[]): string | null {
  const style = findStyleNode(roots);
  return style === null ? null : rawTextContent(style);
}

/** Escribe el CSS interno del documento, creando el `<style>` si no existe. */
export function writeInternalStyle(roots: PrismaNode[], factory: IdFactory, text: string): SimpleResult {
  const result = ensureStyleNode(roots, factory, text);
  return result.ok ? { ok: true } : result;
}

export interface MoveRequest {
  nodeId: PrismaId;
  /** Padre deseado; `null` significa primer nivel del documento. */
  parentId: PrismaId | null;
  /** Coordenadas relativas al contenedor de posicionamiento. */
  box: Box;
}

export interface MoveOutcome {
  /** Texto CSS resultante, con la regla del elemento escrita. */
  cssText: string;
  /** `true` si el elemento cambió de sitio en el HTML. */
  reparented: boolean;
}

/**
 * Mueve un elemento y deja escrito su CSS en el texto indicado.
 *
 * Un solo paso para tres cambios coordinados: el nodo cambia de padre en el
 * modelo, su clase recibe `position: absolute` con `left/top`, y el nuevo padre
 * recibe `position: relative` (salvo que ya sea un contexto de posicionamiento,
 * como un elemento `absolute` que se mueve a su vez). Devuelve el CSS nuevo; el
 * HTML se refleja al serializar el modelo.
 */
export function applyMove(
  roots: PrismaNode[],
  cssText: string,
  request: MoveRequest,
): EditResult<MoveOutcome> {
  const node = findById(roots, request.nodeId);

  if (node === null || !isMovableNode(node)) {
    return fail("El elemento que quieres mover ya no está en el documento.");
  }

  const root = designRootOf(roots);

  if (root !== null && node.id === root.id) {
    return fail("La raíz del documento no se puede mover.");
  }

  const reparented = node.parentId !== request.parentId;
  let nextCss = cssText;

  if (reparented) {
    const moved = reparentNode(roots, request.nodeId, request.parentId);

    if (!moved.ok) {
      return moved;
    }
  }

  const selector = positionSelector(roots, node);

  if (selector === null) {
    return fail("Este nodo no se puede posicionar con CSS.");
  }

  nextCss = writeBox(nextCss, selector, request.box);

  if (request.parentId !== null) {
    const parent = findById(roots, request.parentId);

    if (parent !== null) {
      const parentSelector = positionSelector(roots, parent);

      if (parentSelector !== null) {
        nextCss = ensurePositionRelative(nextCss, parentSelector);
      }
    }
  }

  return okay({ cssText: nextCss, reparented });
}

/** Anade un atributo a un nodo concreto, por ejemplo el `class` del árbol. */
export function setNodeAttribute(roots: PrismaNode[], nodeId: PrismaId, name: string, value: string): SimpleResult {
  const node = findById(roots, nodeId);

  if (node === null) {
    return { ok: false, message: "El elemento ya no está en el documento." };
  }

  return setAttribute(node, name, value) ? { ok: true } : { ok: false, message: "Este nodo no admite ese atributo." };
}
