/**
 * M2.2.0 - Edición de texto CSS.
 *
 * El analizador de `css.ts` es de solo lectura y devuelve hojas en memoria;
 * aquí hacemos lo contrario: cambiar el texto del archivo de forma quirúrgica.
 *
 * Por qué texto y no árbol: el usuario escribe CSS a mano. Comentarios,
 * orden de propiedades, sangrías, `@media` y `{ }` propios del proyecto
 * desaparecerían si serializáramos una hoja que antes solo habíamos leído.
 * Así que solo se toca lo necesario: la declaración que cambia, o una regla
 * nueva al final del archivo.
 *
 * Reglas del escáner:
 * - Solo se miran reglas de nivel superior; lo que hay dentro de un `@media`
 *   queda intacto y, si hiciera falta una regla para ese selector, se anade
 *   nueva al final (igual especificidad, gana la última).
 * - Un selector que aparece en una lista compartida (`.a, .b`) no se edita:
 *   afectaría a la otra clase. En ese caso se anade una regla propia.
 * - Los comentarios y las cadenas se saltan, para no confundir un `}` dentro
 *   de un comentario con el cierre de la regla.
 */

export interface Box {
  x: number;
  y: number;
}

interface RuleSpan {
  /** Selector completo de la regla, tal y como está escrito. */
  selector: string;
  /** Posición del primer carácter del selector. */
  start: number;
  /** Posición justo después del `{`. */
  bodyStart: number;
  /** Posición del `}` que cierra la regla. */
  bodyEnd: number;
  /** Posición justo después del `}`. */
  end: number;
}

interface Declaration {
  /** Posición de inicio, incluida la sangría que la precede. */
  start: number;
  /** Posición final, sin el `;` ni el `}` que cierra. */
  end: number;
  /** Posición del `:`. */
  colon: number;
  property: string;
  value: string;
}

function skipComment(text: string, index: number): number {
  const close = text.indexOf("*/", index + 2);
  return close < 0 ? text.length : close + 2;
}

function skipString(text: string, index: number): number {
  const quote = text[index];
  let cursor = index + 1;

  while (cursor < text.length) {
    const char = text[cursor];

    if (char === "\\") {
      cursor += 2;
      continue;
    }

    if (char === quote) {
      return cursor + 1;
    }

    cursor += 1;
  }

  return text.length;
}

/** Índice del `}` que cierra la llave abierta en `open`, o `-1`. */
function matchBrace(text: string, open: number): number {
  let depth = 1;
  let cursor = open + 1;

  while (cursor < text.length) {
    const char = text[cursor];

    if (char === "/" && text[cursor + 1] === "*") {
      cursor = skipComment(text, cursor);
      continue;
    }

    if (char === '"' || char === "'") {
      cursor = skipString(text, cursor);
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return cursor;
      }
    }

    cursor += 1;
  }

  return -1;
}

/** Reglas de nivel superior del texto, con sus posiciones. */
function scanRules(text: string): RuleSpan[] {
  const rules: RuleSpan[] = [];
  let cursor = 0;
  let selectorStart = 0;

  while (cursor < text.length) {
    const char = text[cursor];

    if (char === "/" && text[cursor + 1] === "*") {
      cursor = skipComment(text, cursor);
      continue;
    }

    if (char === '"' || char === "'") {
      cursor = skipString(text, cursor);
      continue;
    }

    if (char === "{") {
      const raw = text.slice(selectorStart, cursor);
      const close = matchBrace(text, cursor);

      if (close < 0) {
        break;
      }

      const leading = raw.length - raw.trimStart().length;
      const selector = raw.trim();

      if (selector !== "" && !selector.startsWith("@")) {
        rules.push({
          selector,
          start: selectorStart + leading,
          bodyStart: cursor + 1,
          bodyEnd: close,
          end: close + 1,
        });
      }

      cursor = close + 1;
      selectorStart = close + 1;
      continue;
    }

    cursor += 1;
  }

  return rules;
}

function normalizeSelector(selector: string): string {
  return selector.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Regla cuyo selector es exactamente `selector`, sin lista de selectores.
 *
 * `null` cuando no existe o cuando está compartida: en ese caso la edición
 * anade una regla nueva en su lugar de reescribir la ajena.
 */
function findSingleRule(text: string, selector: string): RuleSpan | null {
  const wanted = normalizeSelector(selector);

  for (const rule of scanRules(text)) {
    if (normalizeSelector(rule.selector) === wanted) {
      return rule;
    }
  }

  return null;
}

function splitDeclarations(body: string): Declaration[] {
  const declarations: Declaration[] = [];
  let cursor = 0;
  let start = 0;
  let paren = 0;

  const push = (end: number): void => {
    const raw = body.slice(start, end);

    if (raw.trim() === "") {
      return;
    }

    const colon = findColon(raw);

    if (colon < 0) {
      start = end;
      return;
    }

    const relativeColon = start + colon;
    const beforeColon = body.slice(start, relativeColon);
    const propertyMatch = /([-\w]+)\s*$/.exec(beforeColon);

    if (propertyMatch === null || propertyMatch[1] === undefined) {
      start = end;
      return;
    }

    declarations.push({
      start,
      end,
      colon: relativeColon,
      property: propertyMatch[1].toLowerCase(),
      value: body.slice(relativeColon + 1, end).trim(),
    });
    start = end;
  };

  while (cursor < body.length) {
    const char = body[cursor];

    if (char === "/" && body[cursor + 1] === "*") {
      cursor = skipComment(body, cursor);
      continue;
    }

    if (char === '"' || char === "'") {
      cursor = skipString(body, cursor);
      continue;
    }

    if (char === "(") {
      paren += 1;
    } else if (char === ")") {
      paren = Math.max(0, paren - 1);
    } else if ((char === ";" || char === "}") && paren === 0) {
      push(cursor);
      start = cursor + 1;
    }

    cursor += 1;
  }

  push(body.length);
  return declarations;
}

/** Posición del `:` que separa propiedad de valor, ignorando cadenas y paréntesis. */
function findColon(text: string): number {
  let cursor = 0;
  let paren = 0;

  while (cursor < text.length) {
    const char = text[cursor];

    if (char === "/" && text[cursor + 1] === "*") {
      cursor = skipComment(text, cursor);
      continue;
    }

    if (char === '"' || char === "'") {
      cursor = skipString(text, cursor);
      continue;
    }

    if (char === "(") {
      paren += 1;
    } else if (char === ")") {
      paren = Math.max(0, paren - 1);
    } else if (char === ":" && paren === 0) {
      return cursor;
    }

    cursor += 1;
  }

  return -1;
}

function hasImportant(value: string): boolean {
  return /!\s*important\s*$/i.test(value);
}

/**
 * Escribe `property: value` dentro del cuerpo de una regla.
 *
 * Si la propiedad ya está, se cambia solo su valor y se conservan el resto de
 * las declaraciones, la sangría y un eventual `!important` que traiga el
 * original. Si no está, se anade antes del cierre con el mismo formato.
 */
function upsertDeclaration(body: string, property: string, value: string): string {
  const wanted = property.toLowerCase();
  const declarations = splitDeclarations(body);
  const existing = declarations.find((item) => item.property === wanted);

  if (existing !== undefined) {
    const next = hasImportant(existing.value) && !hasImportant(value)
      ? `${value} !important`
      : value;
    const head = body.slice(existing.start, existing.colon + 1);
    return `${body.slice(0, existing.start)}${head} ${next}${body.slice(existing.end)}`;
  }

  const trailingMatch = body.match(/\s*$/);
  const trailing = trailingMatch?.[0] ?? "";
  const core = body.slice(0, body.length - trailing.length);
  const indentation = /(^|\n)([ \t]*)$/.exec(core);
  const indent = indentation?.[2] ?? "  ";
  const separator = core.trim() === "" || core.endsWith(";") ? "" : ";";

  if (core.trim() === "") {
    return `${core}\n${indent}${property}: ${value};${trailing}`;
  }

  return `${core}${separator}\n${indent}${property}: ${value};${trailing}`;
}

function appendRule(text: string, selector: string, declarations: [string, string][]): string {
  const body = declarations
    .map(([property, value]) => `  ${property}: ${value};`)
    .join("\n");
  const rule = `${selector} {\n${body}\n}\n`;
  const base = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  return `${base}\n${rule}`;
}

/** `left`/`top` actuales de una regla, o `null` si alguno no es un desplazamiento en px. */
export function readBox(text: string, selector: string): Box | null {
  const rule = findSingleRule(text, selector);

  if (rule === null) {
    return null;
  }

  const body = text.slice(rule.bodyStart, rule.bodyEnd);
  const declarations = splitDeclarations(body);
  const left = declarations.find((item) => item.property === "left");
  const top = declarations.find((item) => item.property === "top");

  if (left === undefined || top === undefined) {
    return null;
  }

  const leftMatch = /^(-?\d+(?:\.\d+)?)px$/.exec(left.value.trim());
  const topMatch = /^(-?\d+(?:\.\d+)?)px$/.exec(top.value.trim());

  if (leftMatch === null || topMatch === null || leftMatch[1] === undefined || topMatch[1] === undefined) {
    return null;
  }

  return { x: Number(leftMatch[1]), y: Number(topMatch[1]) };
}

/**
 * Escribe `position: absolute` con `left`/`top` para `selector`.
 *
 * Si la regla ya existe se actualiza dentro de ella; si no existe, o si solo
 * aparece dentro de una lista compartida, se anade una regla propia al final
 * del archivo. En ningún caso se duplica la regla del selector.
 */
export function writeBox(text: string, selector: string, box: Box): string {
  const rule = findSingleRule(text, selector);

  if (rule === null) {
    return appendRule(text, selector, [
      ["position", "absolute"],
      ["left", `${box.x}px`],
      ["top", `${box.y}px`],
    ]);
  }

  let body = text.slice(rule.bodyStart, rule.bodyEnd);
  body = upsertDeclaration(body, "position", "absolute");
  body = upsertDeclaration(body, "left", `${box.x}px`);
  body = upsertDeclaration(body, "top", `${box.y}px`);
  return `${text.slice(0, rule.bodyStart)}${body}${text.slice(rule.bodyEnd)}`;
}

/**
 * Garantiza que `selector` sea contexto de posicionamiento.
 *
 * No sobreescribe si la regla ya tiene una posición que sirva: un elemento
 * `absolute`, `fixed` o `sticky` ya sitúa a sus hijos, y cambiarlo a `relative`
 * rompería su propio movimiento.
 */
export function ensurePositionRelative(text: string, selector: string): string {
  const rule = findSingleRule(text, selector);

  if (rule === null) {
    return appendRule(text, selector, [["position", "relative"]]);
  }

  const body = text.slice(rule.bodyStart, rule.bodyEnd);
  const declarations = splitDeclarations(body);
  const position = declarations.find((item) => item.property === "position");

  if (position !== undefined && position.value.trim() !== "static") {
    return text;
  }

  const next = upsertDeclaration(body, "position", "relative");
  return `${text.slice(0, rule.bodyStart)}${next}${text.slice(rule.bodyEnd)}`;
}

/** Valor de una declaración concreta de la regla, o `null`. */
export function readDeclaration(text: string, selector: string, property: string): string | null {
  const rule = findSingleRule(text, selector);

  if (rule === null) {
    return null;
  }

  const body = text.slice(rule.bodyStart, rule.bodyEnd);
  const declarations = splitDeclarations(body);
  const wanted = property.toLowerCase();
  const found = declarations.find((item) => item.property === wanted);
  return found === undefined ? null : found.value;
}

/** `true` si hay una regla con ese selector exacto. */
export function hasRule(text: string, selector: string): boolean {
  return findSingleRule(text, selector) !== null;
}
