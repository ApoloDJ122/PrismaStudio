import { KNOWN_TAGS } from "./html.ts";
import type {
  Attribute,
  BladeBlock,
  BladeInfo,
  DesignDocument,
  NodeOrigin,
  PrismaId,
  PrismaNode,
} from "./types.ts";

/**
 * M2.0.0 - Construccion y consulta del arbol de elementos.
 *
 * Aqui esta el sistema generico para representar etiquetas HTML. No hay una
 * clase por etiqueta: `<div>`, `<section>` o `<button>` se crean con la misma
 * funcion y se distinguen por su `tag`. Anadir soporte para una etiqueta nueva no
 * requiere tocar nada de este archivo.
 *
 * El orden de los hijos es el orden del array `children`. No hay un campo `order`
 * que se pueda desincronizar del array, que es la razon de que el orden no pueda
 * quedar contradicho: la posicion en el array ES el orden dentro del padre.
 */

/** Opciones comunes al crear un nodo. */
export interface CreateOptions {
  /** Atributos, en el orden en que se escribiran despues. */
  attributes?: Attribute[];
  /** Texto para nodos `text`. */
  content?: string;
  /** Informacion Blade. */
  blade?: BladeInfo | null;
  /** De donde procede. */
  origin?: NodeOrigin;
  /** Texto original. Si se omite, se compone a partir del contenido. */
  source?: string;
  /**
   * Texto de la etiqueta de cierre. Si se omite en un elemento, se compone
   * `</tag>`, que es lo que quiere un arbol construido a mano.
   */
  closingSource?: string | null;
}

/** Genera un id interno sin duplicarlo dentro del documento. */
export interface IdFactory {
  next: () => PrismaId;
}

/** Crea un documento vacio. */
export function createDocument(path: string | null = null): DesignDocument {
  return { path, roots: [] };
}

/**
 * Crea un elemento de cualquier etiqueta.
 *
 * Unico punto de creacion de elementos: todos los tipos de etiqueta pasan por
 * aqui, que es lo que mantiene el modelo generico.
 */
export function createElement(
  factory: IdFactory,
  tag: string,
  options: CreateOptions = {},
): PrismaNode {
  const normalized = tag.toLowerCase();

  return {
    id: factory.next(),
    kind: "element",
    tag: normalized,
    // Una etiqueta con guion es un componente Blade o una etiqueta personalizada.
    // Se conserva igual, pero avisando de que Prisma no la conoce.
    known: KNOWN_TAGS.has(normalized),
    attributes: options.attributes ?? [],
    content: null,
    blade: options.blade ?? null,
    children: [],
    parentId: null,
    origin: options.origin ?? { path: null, line: 0 },
    source: options.source ?? `<${normalized}>`,
    closingSource: options.closingSource === undefined ? `</${normalized}>` : options.closingSource,
  };
}

/** Crea un nodo de texto literal. */
export function createText(
  factory: IdFactory,
  content: string,
  options: CreateOptions = {},
): PrismaNode {
  return {
    id: factory.next(),
    kind: "text",
    tag: null,
    known: true,
    attributes: [],
    content,
    blade: null,
    children: [],
    parentId: null,
    origin: options.origin ?? { path: null, line: 0 },
    source: options.source ?? content,
    closingSource: options.closingSource ?? null,
  };
}

/** Crea un comentario, de HTML o de Blade. */
export function createComment(
  factory: IdFactory,
  content: string,
  form: "html" | "blade" = "html",
  options: CreateOptions = {},
): PrismaNode {
  const open = form === "blade" ? "{{--" : "<!--";
  const close = form === "blade" ? "--}}" : "-->";

  return {
    id: factory.next(),
    kind: "comment",
    tag: null,
    known: true,
    attributes: [],
    content,
    blade:
      form === "blade" ? { form: "comment", value: content.trim(), block: null } : null,
    children: [],
    parentId: null,
    origin: options.origin ?? { path: null, line: 0 },
    source: options.source ?? `${open} ${content} ${close}`,
    closingSource: options.closingSource ?? null,
  };
}

/** Crea un nodo de contenido dinamico: `{{ $usuario->nombre }}`. */
export function createDynamic(
  factory: IdFactory,
  expression: string,
  options: CreateOptions = {},
): PrismaNode {
  return {
    id: factory.next(),
    kind: "dynamic",
    tag: null,
    known: true,
    attributes: [],
    content: expression,
    blade: { form: "echo", value: expression, block: null },
    children: [],
    parentId: null,
    origin: options.origin ?? { path: null, line: 0 },
    source: options.source ?? `{{ ${expression} }}`,
    closingSource: options.closingSource ?? null,
  };
}

/** Crea una estructura Blade: `@if`, `@endif`, `@foreach`... */
export function createDirective(
  factory: IdFactory,
  directive: string,
  block: BladeBlock = "self",
  expression: string = "",
  options: CreateOptions = {},
): PrismaNode {
  const name = directive.replace(/^@/, "");
  const head = expression === "" ? `@${name}` : `@${name}(${expression})`;

  return {
    id: factory.next(),
    kind: "directive",
    tag: null,
    known: false,
    attributes: [],
    content: expression,
    blade: { form: "directive", value: name, block },
    children: [],
    parentId: null,
    origin: options.origin ?? { path: null, line: 0 },
    source: options.source ?? head,
    closingSource: options.closingSource ?? null,
  };
}

/**
 * Crea un nodo que Prisma no sabe interpretar, pero conserva.
 *
 * Es la pieza que cumple la regla de que lo que no se entiende no se tira. El
 * texto original queda en `source` y el nodo mantiene su sitio en la jerarquia,
 * de modo que un proyecto con etiquetas raras se puede abrir y analizar igual.
 */
export function createUnknown(
  factory: IdFactory,
  source: string,
  options: CreateOptions = {},
): PrismaNode {
  return {
    id: factory.next(),
    kind: "unknown",
    tag: null,
    known: false,
    attributes: [],
    content: source,
    blade: null,
    children: [],
    parentId: null,
    origin: options.origin ?? { path: null, line: 0 },
    source,
    // Un nodo desconocido se queda con lo que ocupa: no se le inventa un cierre.
    closingSource: null,
  };
}

/**
 * Anade un nodo al final de los hijos de un padre.
 *
 * Devuelve el nodo anadido para poder encadenar. No comprueba que el padre sea un
 * elemento: un `text` no tiene hijos, y anadirselo a proposito tiene que seguir
 * siendo posible para no perder contenido.
 */
export function appendChild(parent: PrismaNode, child: PrismaNode): PrismaNode {
  child.parentId = parent.id;
  parent.children.push(child);
  return child;
}

/** Inserta un nodo en una posicion concreta de los hijos del padre. */
export function insertAt(parent: PrismaNode, child: PrismaNode, index: number): PrismaNode {
  child.parentId = parent.id;
  parent.children.splice(index, 0, child);
  return child;
}

/**
 * Quita un nodo del arbol.
 *
 * Se quita de verdad, no se marca: el modelo no guarda referencias muertas. Lo
 * que se ha eliminado de la interfaz no se puede guardar luego sobre el archivo.
 * Devuelve `false` si el nodo no estaba en el arbol.
 */
export function detach(roots: PrismaNode[], node: PrismaNode): boolean {
  if (node.parentId === null) {
    return removeFrom(roots, node);
  }

  const parent = findById(roots, node.parentId);
  return parent === null ? false : removeFrom(parent.children, node);
}

function removeFrom(list: PrismaNode[], node: PrismaNode): boolean {
  const index = list.indexOf(node);

  if (index < 0) {
    return false;
  }

  list.splice(index, 1);
  return true;
}

/** Recorre el arbol en orden de lectura, incluyendo el nodo indicado. */
export function walk(
  node: PrismaNode,
  visit: (node: PrismaNode, depth: number) => void,
  depth = 0,
): void {
  visit(node, depth);

  for (const child of node.children) {
    walk(child, visit, depth + 1);
  }
}

/** Todos los nodos del documento, en orden de lectura. */
export function flatten(roots: PrismaNode[]): PrismaNode[] {
  const result: PrismaNode[] = [];

  for (const root of roots) {
    walk(root, (node) => result.push(node));
  }

  return result;
}

/** Busca un nodo por su identificador interno. */
export function findById(roots: PrismaNode[], id: PrismaId): PrismaNode | null {
  for (const root of roots) {
    const found = findIn(root, id);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

function findIn(node: PrismaNode, id: PrismaId): PrismaNode | null {
  if (node.id === id) {
    return node;
  }

  for (const child of node.children) {
    const found = findIn(child, id);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

/**
 * Posicion de un nodo entre sus hermanos.
 *
 * Es el orden dentro del padre. Los nodos raiz son hermanos entre si, asi que su
 * posicion es la que ocupan en el documento; un nodo que no esta en el arbol
 * devuelve `-1`.
 */
export function orderOf(roots: PrismaNode[], node: PrismaNode): number {
  const siblings = node.parentId === null ? roots : findById(roots, node.parentId)?.children ?? [];
  return siblings.indexOf(node);
}

/** Los ancestros de un nodo, del mas lejano al mas cercano. */
export function ancestorsOf(roots: PrismaNode[], node: PrismaNode): PrismaNode[] {
  const chain: PrismaNode[] = [];
  let current = node.parentId === null ? null : findById(roots, node.parentId);

  while (current !== null) {
    chain.unshift(current);
    current = current.parentId === null ? null : findById(roots, current.parentId);
  }

  return chain;
}

/** Todos los elementos con una etiqueta dada. */
export function findByTag(roots: PrismaNode[], tag: string): PrismaNode[] {
  const normalized = tag.toLowerCase();
  return flatten(roots).filter((node) => node.kind === "element" && node.tag === normalized);
}

/** Primer elemento con un `id` de HTML dado, o `null`. */
export function findByHtmlId(roots: PrismaNode[], htmlId: string): PrismaNode | null {
  return flatten(roots).find((node) => attributeValue(node, "id") === htmlId) ?? null;
}

/** Valor de un atributo, o `null` si el nodo no lo tiene. */
export function attributeValue(node: PrismaNode, name: string): string | null {
  const wanted = name.toLowerCase();
  return node.attributes.find((item) => item.name.toLowerCase() === wanted)?.value ?? null;
}

/**
 * Clases CSS del elemento, tal como estan escritas.
 *
 * Se leen del atributo `class` y se separan por espacios. Un elemento sin
 * atributo `class` no tiene clases: no se inventa una lista vacia.
 */
export function classList(node: PrismaNode): string[] {
  const value = attributeValue(node, "class");

  if (value === null) {
    return [];
  }

  return value.split(/\s+/).filter((item) => item !== "");
}

/** `id` de HTML del elemento. Distinto del identificador interno de Prisma. */
export function htmlId(node: PrismaNode): string | null {
  return attributeValue(node, "id");
}

/** Texto de un nodo, con el de sus hijos. Solo texto y contenido dinamico. */
export function textContent(node: PrismaNode): string {
  if (node.kind === "text" || node.kind === "dynamic") {
    return node.content ?? "";
  }

  return node.children.map(textContent).join("");
}

/**
 * Reconstruye el texto del archivo a partir del modelo.
 *
 * Recorre en profundidad porque los hijos van entre la etiqueta que abre y la que
 * cierra. Sobre un documento leer con `parseMarkup` devuelve exactamente el texto
 * original, incluidos los espacios y los comentarios: es la comprobacion de que
 * el modelo no pierde nada.
 */
export function serialize(roots: PrismaNode[]): string {
  return roots.map(serializeNode).join("");
}

function serializeNode(node: PrismaNode): string {
  return node.source + node.children.map(serializeNode).join("") + (node.closingSource ?? "");
}
