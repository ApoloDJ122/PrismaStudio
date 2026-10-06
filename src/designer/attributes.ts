import { attributeValue, classList } from "./tree.ts";
import { isRawTextTag } from "./html.ts";
import type { Attribute, PrismaNode } from "./types.ts";

/**
 * M2.2.0 - Escritura de atributos sobre el modelo.
 *
 * Un nodo guarda dos veces su etiqueta: la lista `attributes`, para leerla, y
 * el texto exacto `source`, para reconstruir el archivo. Si se cambia una cosa
 * sin la otra, `serialize` devuelve un HTML que no coincide con lo que el
 * usuario ve en el lienzo. Aqui se cambian siempre las dos.
 *
 * El texto original de cada atributo (`raw`) se conserva tal cual esta escrito:
 * comillas, mayusculas y espacios. Solo se reescribe el atributo que cambia,
 * y su posicion se busca recorriendo la etiqueta, para no confundir un `class`
 * escrito dentro de un `title` con el atributo real.
 */

/** Escapa el valor de un atributo para poder escribirlo entre comillas dobles. */
function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Posicion del `>` que cierra la etiqueta de apertura, ignorando comillas. */
function tagEndIndex(source: string): number {
  let cursor = 0;

  while (cursor < source.length) {
    const char = source[cursor];

    if (char === '"' || char === "'") {
      const quote = char;
      cursor += 1;

      while (cursor < source.length && source[cursor] !== quote) {
        cursor += 1;
      }
    } else if (char === ">") {
      return cursor;
    }

    cursor += 1;
  }

  return -1;
}

/** Busca un atributo por nombre, sin importar mayusculas. */
export function findAttribute(node: PrismaNode, name: string): Attribute | null {
  const wanted = name.toLowerCase();
  return node.attributes.find((item) => item.name.toLowerCase() === wanted) ?? null;
}

/**
 * Escribe un atributo en el modelo y en el texto de la etiqueta.
 *
 * Devuelve `false` y no toca nada si el elemento no admite atributos: las
 * etiquetas de texto plano (`<style>`, `<script>`, `<textarea>`, `<title>`)
 * guardan su contenido dentro de `source`, de modo que insertar una `>` a ciegas
 * romperia el bloque.
 */
export function setAttribute(node: PrismaNode, name: string, value: string): boolean {
  if (node.kind !== "element" || node.tag === null) {
    return false;
  }

  if (isRawTextTag(node.tag)) {
    return false;
  }

  const existing = findAttribute(node, name);
  const raw = `${existing?.name ?? name}="${escapeAttributeValue(value)}"`;

  if (existing === null) {
    const close = tagEndIndex(node.source);

    if (close < 0) {
      return false;
    }

    node.source = `${node.source.slice(0, close)} ${raw}${node.source.slice(close)}`;
    node.attributes.push({ name, value, raw });
    return true;
  }

  let cursor = 0;
  let position = -1;
  let length = existing.raw.length;

  for (const attribute of node.attributes) {
    const found = node.source.indexOf(attribute.raw, cursor);

    if (found < 0) {
      break;
    }

    if (attribute === existing) {
      position = found;
      length = attribute.raw.length;
      break;
    }

    cursor = found + attribute.raw.length;
  }

  if (position < 0) {
    return false;
  }

  node.source = `${node.source.slice(0, position)}${raw}${node.source.slice(position + length)}`;
  existing.value = value;
  existing.raw = raw;
  return true;
}

/**
 * Anade una clase al elemento conservando las que ya tiene.
 *
 * Es la operacion que cumple la regla de no destruir clases existentes: un
 * `<button class="btn-primary">` pasa a `<button class="btn-primary button-1">`,
 * nunca a `<button class="button-1">`.
 */
export function appendClassName(node: PrismaNode, className: string): boolean {
  const current = classList(node);

  if (current.includes(className)) {
    return false;
  }

  return setAttribute(node, "class", [...current, className].join(" "));
}

/** Valor de un atributo del modelo, o `null`. Atajo para no importar de arriba. */
export function readAttribute(node: PrismaNode, name: string): string | null {
  return attributeValue(node, name);
}

/**
 * Texto interior de una etiqueta de contenido plano (`<style>`, `<script>`).
 *
 * En estos nodos el contenido no son hijos: esta dentro de `source`, despues de
 * la etiqueta de apertura. Leerlo y escribirlo es como tocar un fichero de texto
 * normal, y es lo que permite editar el `<style>` interno sin montar un arbol
 * de nodos de texto que el parser no habia creado.
 */
export function rawTextContent(node: PrismaNode): string {
  const end = tagEndIndex(node.source);
  return end < 0 ? node.source : node.source.slice(end + 1);
}

/** Cambia el interior de una etiqueta de contenido plano, conservando su cierre. */
export function setRawTextContent(node: PrismaNode, text: string): boolean {
  if (node.kind !== "element" || node.tag === null || !isRawTextTag(node.tag)) {
    return false;
  }

  const end = tagEndIndex(node.source);

  if (end < 0) {
    return false;
  }

  node.source = `${node.source.slice(0, end + 1)}${text}`;
  return true;
}
