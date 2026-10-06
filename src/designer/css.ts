import type { CssDeclaration, CssRule, Stylesheet } from "./styles.ts";

/**
 * M2.0.0 - Lectura de hojas de estilo CSS.
 *
 * Se queda con la estructura: que reglas hay, que selector tiene cada una, que
 * declaraciones contiene y en que archivo y linea esta. No resuelve la cascada
 * ni escribe nada.
 *
 * Es un lector de estructura, no un validador: lo que no se entiende se conserva
 * como texto en lugar de fallar, con la misma idea que en el HTML.
 */

/** Una regla tal como sale del archivo, todavia sin partir en declaraciones. */
interface RawRule {
  selector: string;
  body: string;
  line: number;
  source: string;
}

/** Quita los comentarios `/* ... *\/`, que no aportan estructura. */
function stripComments(text: string): string {
  let result = "";

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 1;
      continue;
    }

    result += text[index];
  }

  return result;
}

/**
 * Posiciones de inicio de cada linea, para devolver numeros de linea reales.
 *
 * Se calcula una vez por archivo y se busca con biseccion, asi que el coste no
 * crece con cada regla.
 */
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

/**
 * Parte el texto en reglas contando llaves.
 *
 * Contar llaves es lo que evita que un `@media` se parta por la mitad: sus reglas
 * interiores son reglas de la hoja y salen con su `@media` como selector, que es
 * exactamente lo que hay en el archivo.
 */
function splitRules(text: string): RawRule[] {
  const rules: RawRule[] = [];
  const lines = buildLineIndex(text);
  let index = 0;
  let ruleStart = -1;

  while (index < text.length) {
    if (text[index] === "{") {
      const from = ruleStart < 0 ? index : ruleStart;
      const selector = text.slice(from, index).trim();

      // Se busca la llave que cierra la que se acaba de abrir.
      let depth = 0;
      let cursor = index;

      while (cursor < text.length) {
        if (text[cursor] === "{") {
          depth += 1;
        } else if (text[cursor] === "}") {
          depth -= 1;

          if (depth === 0) {
            break;
          }
        }

        cursor += 1;
      }

      const closed = cursor < text.length;
      const body = text.slice(index + 1, closed ? cursor : text.length);
      const source = text.slice(from, closed ? cursor + 1 : text.length);

      if (selector !== "") {
        rules.push({ selector, body, line: lineAt(lines, from), source: source.trim() });
      }

      index = closed ? cursor + 1 : text.length;

      // Se vuelve a `-1` para que la regla siguiente empiece en su selector, no
      // en el salto de linea que deja la anterior: si no, su linea seria la del
      // cierre de la anterior y saltaria a un sitio equivocado.
      ruleStart = -1;
      continue;
    }

    if (ruleStart < 0 && text[index] !== "}" && !/\s/.test(text[index] ?? "")) {
      ruleStart = index;
    }

    index += 1;
  }

  return rules;
}

/** Primer `character` que no este dentro de parentesis, corchetes o comillas. */
function findTopLevel(text: string, character: string): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index] ?? "";

    if (quote !== null) {
      if (current === quote) {
        quote = null;
      }

      continue;
    }

    if (current === '"' || current === "'") {
      quote = current;
    } else if (current === "(" || current === "[") {
      depth += 1;
    } else if (current === ")" || current === "]") {
      depth -= 1;
    } else if (current === character && depth === 0) {
      return index;
    }
  }

  return -1;
}

/**
 * Parte por un separador que no este anidado.
 *
 * `;` no parte dentro de `url(a;b)` ni dentro de una cadena, y `:` no parte en
 * `background: url(https://...)`.
 */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;

  for (;;) {
    const position = findTopLevel(text.slice(start), separator);

    if (position < 0) {
      parts.push(text.slice(start));
      return parts;
    }

    parts.push(text.slice(start, start + position));
    start += position + 1;
  }
}

/** Reparte el cuerpo de una regla en declaraciones como `color: white`. */
export function parseDeclarations(body: string): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];

  for (const piece of splitTopLevel(body, ";")) {
    const text = piece.trim();

    if (text === "") {
      continue;
    }

    const colon = findTopLevel(text, ":");

    if (colon < 0) {
      continue;
    }

    const property = text.slice(0, colon).trim();
    let value = text.slice(colon + 1).trim();
    let important = false;

    if (/!important$/i.test(value)) {
      important = true;
      value = value.replace(/!important$/i, "").trim();
    }

    if (property === "") {
      continue;
    }

    declarations.push({ property, value, important, raw: text });
  }

  return declarations;
}

/**
 * Lee una hoja de estilo.
 *
 * `path` es la ruta del archivo, que se guarda en cada relacion posterior para
 * poder localizar la regla dentro del proyecto.
 */
export function parseStylesheet(text: string, path: string | null = null): Stylesheet {
  const rules: CssRule[] = [];

  for (const raw of splitRules(stripComments(text))) {
    const selector = raw.selector.trim().replace(/\s+/g, " ");

    if (selector === "") {
      continue;
    }

    rules.push({
      selector,
      declarations: parseDeclarations(raw.body),
      line: raw.line,
      source: raw.source,
    });
  }

  return { path, rules };
}
