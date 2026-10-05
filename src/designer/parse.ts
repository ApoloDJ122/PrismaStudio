import { isComponentName, isNonVisualTag, isRawTextTag, isVoidTag } from "./html.ts";
import { createIdFactory } from "./identity.ts";
import {
  createComment,
  createDirective,
  createDynamic,
  createElement,
  createText,
  createUnknown,
} from "./tree.ts";
import type { BladeBlock, DesignDocument, PrismaNode } from "./types.ts";

/**
 * M2.0.0 - Lector de HTML y Blade para rellenar el modelo interno.
 *
 * Recorre el archivo una vez y construye el arbol. Es un lector de estructura
 * rapido, no un analizador completo de Blade: no resuelve includes, no evalua
 * expresiones y no inventa el contenido de un componente. Lo que no entiende lo
 * conserva, que es la regla que manda en todo M2.0.0.
 *
 * Lo que si hace, porque sin ello el arbol no seria de fiar:
 *
 *   - Distingue elemento HTML, elemento Blade (`<x-alerta>`), contenido
 *     dinamico (`{{ ... }}`) y estructura Blade (`@if`, `@foreach`).
 *   - Empareja `@if` con su `@endif`, de modo que lo que hay entre medias quede
 *     dentro del bloque y no suelto en el padre.
 *   - No inventa hijos en las etiquetas que no los tienen (`<img>`, `<input>`).
 *   - Conserva el texto original de cada nodo, incluidas las etiquetas de cierre,
 *     para que el archivo se pueda reconstruir sin cambios.
 *   - No interpreta el contenido de `<script>` ni de `<style>`.
 */

/**
 * Directivas Blade que abren un bloque y con cual se cierran.
 *
 * Es una tabla, no un analizador: cubre las directivas de bloque habituales. Una
 * directiva que no este aqui se conserva como nodo propio, sin suponer que cierra
 * nada.
 */
const BLOCK_DIRECTIVES: ReadonlyMap<string, string> = new Map([
  ["if", "endif"],
  ["unless", "endunless"],
  ["isset", "endisset"],
  ["empty", "endempty"],
  ["foreach", "endforeach"],
  ["for", "endfor"],
  ["forelse", "endforelse"],
  ["while", "endwhile"],
  ["php", "endphp"],
  ["push", "endpush"],
  ["once", "endonce"],
  ["section", "endsection"],
  ["auth", "endauth"],
  ["guest", "endguest"],
  ["can", "endcan"],
  ["cannot", "endcannot"],
  ["canany", "endcanany"],
  ["env", "endenv"],
  ["error", "enderror"],
  ["verbatim", "endverbatim"],
]);

/** A que elemento abierto pertenece una directiva de cierre. */
function openerOf(directive: string): string | null {
  for (const [opener, closer] of BLOCK_DIRECTIVES) {
    if (closer === directive) {
      return opener;
    }
  }

  return null;
}

/** Un nodo abierto, pendiente de cerrar. */
interface Frame {
  node: PrismaNode;
  /** Nombre que lo cierra, o `null` si se cierra con una etiqueta. */
  closer: string | null;
  /** `true` si es un bloque Blade (`@if`) y no una etiqueta. */
  blade: boolean;
}

/** Posiciones de inicio de linea, para devolver la linea real de cada nodo. */
function buildLineIndex(text: string): number[] {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }

  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if ((starts[middle] ?? 0) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low + 1;
}

/** Caracteres con los que puede empezar un nombre de etiqueta o directiva. */
const NAME_START = /[a-zA-Z]/;

/** Un atributo tal como aparece escrito. */
interface RawAttribute {
  name: string;
  value: string | null;
  raw: string;
}

/** Una etiqueta leida tal cual. */
interface RawTag {
  name: string;
  attributes: RawAttribute[];
  closing: boolean;
  selfClosing: boolean;
  end: number;
  source: string;
}

/**
 * Lee una etiqueta: `<div class="a">`, `</div>`, `<x-alerta />`, `<br>`.
 *
 * Devuelve `null` si en esa posicion no hay etiqueta, que es el caso de un `<`
 * suelto como el de "5 < 6" o de un `<?php` de apertura.
 */
function readTag(text: string, start: number): RawTag | null {
  if (text[start] !== "<") {
    return null;
  }

  const closing = text[start + 1] === "/";
  let index = start + (closing ? 2 : 1);

  if (!NAME_START.test(text[index] ?? "")) {
    return null;
  }

  const nameStart = index;

  while (index < text.length && /[a-zA-Z0-9:_.-]/.test(text[index] ?? "")) {
    index += 1;
  }

  const name = text.slice(nameStart, index);
  const attributes: RawAttribute[] = [];

  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index] ?? "")) {
      index += 1;
    }

    if (text[index] === ">" || (text[index] === "/" && text[index + 1] === ">")) {
      break;
    }

    const attributeStart = index;
    const nameStartAttribute = index;

    while (index < text.length && !/[\s=>/]/.test(text[index] ?? "")) {
      index += 1;
    }

    const attributeName = text.slice(nameStartAttribute, index);

    if (attributeName === "") {
      // Caracter inesperado: se avanza para no quedarse atascado.
      index += 1;
      continue;
    }

    while (index < text.length && /\s/.test(text[index] ?? "")) {
      index += 1;
    }

    if (text[index] !== "=") {
      // Atributo sin valor, como `disabled` o `checked`.
      attributes.push({
        name: attributeName,
        value: null,
        raw: text.slice(attributeStart, index).trimEnd(),
      });
      continue;
    }

    index += 1;

    while (index < text.length && /\s/.test(text[index] ?? "")) {
      index += 1;
    }

    const quote = text[index];

    if (quote === '"' || quote === "'") {
      const end = text.indexOf(quote, index + 1);
      const stop = end < 0 ? text.length : end;

      attributes.push({
        name: attributeName,
        value: text.slice(index + 1, stop),
        raw: text.slice(attributeStart, end < 0 ? text.length : end + 1),
      });

      index = end < 0 ? text.length : end + 1;
      continue;
    }

    // Valor sin comillas, que HTML permite.
    const valueStart = index;

    while (index < text.length && !/[\s>]/.test(text[index] ?? "")) {
      index += 1;
    }

    attributes.push({
      name: attributeName,
      value: text.slice(valueStart, index),
      raw: text.slice(attributeStart, index),
    });
  }

  const selfClosing = text[index] === "/";
  const end = text[index] === ">" ? index + 1 : index;

  return { name, attributes, closing, selfClosing, end, source: text.slice(start, end) };
}

/** Contenido de `{{ ... }}`, `{{{ ... }}}` o `{{-- ... --}}`. */
function readEcho(
  text: string,
  start: number,
): { content: string; end: number; comment: boolean } | null {
  if (!text.startsWith("{{", start)) {
    return null;
  }

  if (text.startsWith("{{--", start)) {
    const end = text.indexOf("--}}", start + 4);
    const stop = end < 0 ? text.length : end;

    return { content: text.slice(start + 4, stop), end: end < 0 ? text.length : end + 4, comment: true };
  }

  const triple = text.startsWith("{{{", start);
  const open = triple ? 3 : 2;
  const closer = triple ? "}}}" : "}}";
  const end = text.indexOf(closer, start + open);
  const stop = end < 0 ? text.length : end;

  return {
    content: text.slice(start + open, stop),
    end: end < 0 ? text.length : end + closer.length,
    comment: false,
  };
}

/**
 * Lee una directiva Blade: `@if(...)`, `@endif`, `@include('x')`, `@csrf`.
 *
 * Devuelve `null` si no hay directiva, que es el caso de un `@` que forma parte de
 * un texto, como una direccion de correo.
 */
function readDirective(
  text: string,
  start: number,
): { name: string; expression: string; source: string; end: number } | null {
  if (text[start] !== "@" || !NAME_START.test(text[start + 1] ?? "")) {
    return null;
  }

  let index = start + 1;

  while (index < text.length && /[a-zA-Z0-9_]/.test(text[index] ?? "")) {
    index += 1;
  }

  const name = text.slice(start + 1, index);
  let expression = "";
  let cursor = index;

  while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
    cursor += 1;
  }

  if (text[cursor] === "(") {
    const open = cursor;
    let depth = 0;

    // Se cuentan los parentesis para no cortar en el primero: `@if($a[0] > 1)`.
    while (cursor < text.length) {
      if (text[cursor] === "(") {
        depth += 1;
      } else if (text[cursor] === ")") {
        depth -= 1;

        if (depth === 0) {
          cursor += 1;
          break;
        }
      }

      cursor += 1;
    }

    expression = text.slice(open + 1, cursor - 1).trim();
    index = cursor;
  }

  return { name, expression, source: text.slice(start, index), end: index };
}

/**
 * Lee un archivo HTML o Blade y devuelve su modelo interno.
 *
 * `path` solo se guarda: este lector no toca el disco. Leer los archivos de un
 * proyecto es trabajo de M2.1.0, que llamara a esta funcion con el texto ya traido
 * de Rust.
 */
export function parseMarkup(text: string, path: string | null = null): DesignDocument {
  const factory = createIdFactory();
  const lines = buildLineIndex(text);
  const roots: PrismaNode[] = [];
  const stack: Frame[] = [];
  const originAt = (offset: number) => ({ path, line: lineAt(lines, offset) });

  const parentNode = (): PrismaNode | null => stack[stack.length - 1]?.node ?? null;

  const place = (node: PrismaNode) => {
    const parent = parentNode();

    if (parent === null) {
      node.parentId = null;
      roots.push(node);
      return;
    }

    node.parentId = parent.id;
    parent.children.push(node);
  };

  let index = 0;

  while (index < text.length) {
    const start = index;
    const echo = readEcho(text, index);

    if (echo !== null) {
      if (echo.comment) {
        place(
          createComment(factory, echo.content, "blade", {
            origin: originAt(start),
            source: text.slice(start, echo.end),
          }),
        );
      } else {
        place(
          createDynamic(factory, echo.content.trim(), {
            origin: originAt(start),
            source: text.slice(start, echo.end),
          }),
        );
      }

      index = echo.end;
      continue;
    }

    const directive = readDirective(text, index);

    if (directive !== null) {
      const closer = BLOCK_DIRECTIVES.get(directive.name);
      const opener = openerOf(directive.name);
      const block: BladeBlock = closer !== undefined ? "open" : opener !== null ? "close" : "self";

      const node = createDirective(factory, directive.name, block, directive.expression, {
        origin: originAt(start),
        source: directive.source,
        closingSource: null,
      });

      if (block === "open") {
        // Lo que va hasta el cierre queda dentro del bloque, no en el padre.
        place(node);
        /*
         * Se guarda el nombre del cierre (`endif`), no el de la apertura (`if`).
         * En HTML coinciden, pero en Blade no, y es por ese nombre por el que se
         * busca cuando llega el cierre.
         */
        stack.push({ node, closer: closer ?? directive.name, blade: true });
      } else if (block === "close") {
        const openIndex = findFrameToClose(stack, directive.name, true);

        if (openIndex < 0) {
          // Un cierre sin apertura no se inventa: se conserva tal cual.
          place(node);
        } else {
          // `@endif` cierra su bloque igual que `</div>` cierra su elemento, y
          // por eso se guarda en el bloque y no entre sus hijos.
          const frame = stack[openIndex];

          if (frame !== undefined) {
            frame.node.closingSource = directive.source;
          }

          stack.length = openIndex;
        }
      } else {
        place(node);
      }

      index = directive.end;
      continue;
    }

    const tag = readTag(text, index);

    if (tag !== null) {
      const name = tag.name.toLowerCase();

      if (tag.closing) {
        const openIndex = findFrameToClose(stack, name, false);

        if (openIndex < 0) {
          place(createUnknown(factory, tag.source, { origin: originAt(start) }));
        } else {
          // La etiqueta de cierre se guarda en su elemento: es lo que permite
          // reconstruir el archivo sin cambios.
          const frame = stack[openIndex];

          if (frame !== undefined) {
            frame.node.closingSource = tag.source;
          }

          // Un elemento abierto sin cerrar se cierra solo, como en un navegador.
          stack.length = openIndex;
        }

        index = tag.end;
        continue;
      }

      const element = createElement(factory, name, {
        attributes: tag.attributes,
        origin: originAt(start),
        source: tag.source,
        /*
         * Siempre `null` aqui. Si se deja sin definir, `createElement` pone un
         * `</etiqueta>` por su cuenta y el lector acabaria inventando cierres que
         * no estaban en el archivo. El cierre real se guarda al llegar a el.
         */
        closingSource: null,
        blade: isComponentName(name) ? { form: "component", value: name, block: null } : null,
      });

      if (isNonVisualTag(name) || isRawTextTag(name)) {
        /*
         * `<script>`, `<style>`, `<textarea>` y `<title>`: el contenido no se
         * interpreta, se conserva entero. Para `<script>` es tambien la via por la
         * que JavaScript no llega nunca al modelo visual: no se convierte en
         * elementos ni se busca en el nada.
         */
        const raw = readRawBlock(text, tag.end, name);
        element.source = tag.source + raw.content;
        element.closingSource = raw.closeSource;
        place(element);
        index = raw.end;
        continue;
      }

      place(element);
      index = tag.end;

      if (tag.selfClosing || isVoidTag(name)) {
        continue;
      }

      stack.push({ node: element, closer: name, blade: false });
      continue;
    }

    if (text.startsWith("<!--", index)) {
      const end = text.indexOf("-->", index + 4);
      const stop = end < 0 ? text.length : end;
      const source = text.slice(index, end < 0 ? text.length : end + 3);

      place(
        createComment(factory, text.slice(index + 4, stop), "html", {
          origin: originAt(start),
          source,
        }),
      );

      index = end < 0 ? text.length : end + 3;
      continue;
    }

    if (text[index] === "<" && text[index + 1] === "!") {
      // `<!DOCTYPE html>` y cualquier otra declaracion: se conserva sin interpretar.
      const end = text.indexOf(">", index);
      const stop = end < 0 ? text.length : end + 1;
      place(createUnknown(factory, text.slice(index, stop), { origin: originAt(start) }));
      index = stop;
      continue;
    }

    if (text.startsWith("<?", index)) {
      // `<?php ... ?>` no es HTML ni Blade. No se interpreta, pero tampoco se
      // pierde: se conserva entero como nodo desconocido.
      const end = text.indexOf("?>", index);
      const stop = end < 0 ? text.length : end + 2;
      place(createUnknown(factory, text.slice(index, stop), { origin: originAt(start) }));
      index = stop;
      continue;
    }

    /*
     * Texto normal. El `Math.max` garantiza que se avanza: si `findTextEnd` no
     * encontrara nada aqui, el bucle no podria salir y la aplicacion se quedaria
     * colgada. Es una red de seguridad, no la via normal.
     */
    const next = Math.max(findTextEnd(text, index), index + 1);
    const source = text.slice(index, next);

    if (source !== "") {
      place(createText(factory, source, { origin: originAt(start), source }));
    }

    index = next;
  }

  return { path, roots };
}

/**
 * Posicion del marco que cierra este nombre, o `-1` si no hay ninguno.
 *
 * Se busca desde arriba del todo, como haria un navegador. Si el cierre esta mas
 * abajo que una apertura sin cerrar, esa apertura se cierra sola.
 */
function findFrameToClose(stack: Frame[], name: string, blade: boolean): number {
  for (let position = stack.length - 1; position >= 0; position -= 1) {
    const frame = stack[position];

    if (frame !== undefined && frame.blade === blade && frame.closer === name) {
      return position;
    }
  }

  return -1;
}

/**
 * Contenido de una etiqueta de texto plano y su cierre.
 *
 * `<script>` y `<style>` guardan codigo que no es HTML, asi que se busca su
 * `</script>` o `</style>` en vez de interpretar lo que hay dentro.
 */
function readRawBlock(
  text: string,
  start: number,
  tag: string,
): { content: string; closeSource: string | null; end: number } {
  const lower = text.toLowerCase();
  const position = lower.indexOf(`</${tag}`, start);

  if (position < 0) {
    return { content: text.slice(start), closeSource: null, end: text.length };
  }

  const end = text.indexOf(">", position);

  if (end < 0) {
    return { content: text.slice(start, position), closeSource: null, end: text.length };
  }

  return {
    content: text.slice(start, position),
    closeSource: text.slice(position, end + 1),
    end: end + 1,
  };
}

/**
 * `true` si en esta posicion empieza algo de marcado.
 *
 * Distingue una etiqueta de un `<` que es solo el signo de menor, como en
 * "5 < 6" o en un "$a < $b" de un `@if`. Sin esta comprobacion, un `<` suelto
 * haria que el texto no avanzara y el lector se quedaria parado.
 */
function startsMarkup(text: string, index: number): boolean {
  if (text[index] !== "<") {
    return false;
  }

  const next = text[index + 1];

  if (next === "!" || next === "?") {
    // `<!DOCTYPE html>` y `<?php ... ?>` no son HTML, pero hay que reconocerlos
    // para conservarlos.
    return true;
  }

  if (next === "/") {
    return NAME_START.test(text[index + 2] ?? "");
  }

  return NAME_START.test(next ?? "");
}

/**
 * Fin del texto plano: donde empieza lo siguiente.
 *
 * Se para antes de una etiqueta, de `{{` y de cualquier `@` que pueda ser una
 * directiva. Un `<` de comparacion y un `@` de correo se quedan dentro del texto,
 * que es lo que haria un navegador.
 */
function findTextEnd(text: string, start: number): number {
  let index = start;

  while (index < text.length) {
    if (startsMarkup(text, index) || text.startsWith("{{", index)) {
      return index;
    }

    if (text[index] === "@" && NAME_START.test(text[index + 1] ?? "")) {
      const previous = text[index - 1];

      // Una directiva solo lo es si va precedida de inicio, espacio o puntuacion.
      if (previous === undefined || /[\s(,;[{]/.test(previous)) {
        return index;
      }
    }

    index += 1;
  }

  return text.length;
}
