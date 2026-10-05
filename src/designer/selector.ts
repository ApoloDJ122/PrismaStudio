import { classList, findById, htmlId } from "./tree.ts";
import type { PrismaNode } from "./types.ts";
import type { Selector, SimpleSelector, Specificity, StyleMatch, Stylesheet } from "./styles.ts";

/**
 * M2.0.0 - Relacion entre un elemento y las reglas CSS que lo alcanzan.
 *
 * Es la unica pieza que une los dos lados del modelo. HTML y CSS se guardan
 * separados; aqui se cruzan solo para senalar que reglas afectan a cada elemento,
 * ordenadas por especificidad.
 *
 * No se resuelve la cascada final ni se edita nada. Devolver las reglas en orden
 * es justo lo que necesita el futuro inspector, y deja la decision de cual gana
 * en sus manos, que es donde importa.
 */

/** Nodos por los que se puede caminar: las raices de un documento. */
export type Roots = PrismaNode[];

/** Combinador que une dos pasos de un selector. */
type Combinator = "descendant" | "child" | "adjacent" | "sibling";

/** Compara dos especificidades. Negativo si `left` es menor. */
export function compareSpecificity(left: Specificity, right: Specificity): number {
  return left.a - right.a || left.b - right.b || left.c - right.c;
}

/** Serializa una especificidad como `1,2,1`, para mostrarla o probarla. */
export function formatSpecificity(specificity: Specificity): string {
  return `${specificity.a},${specificity.b},${specificity.c}`;
}

/**
 * Divide un selector escrito en la lista de selectores que contiene.
 *
 * `a, b > .c` son dos selectores. La coma solo cuenta como separador si no esta
 * dentro de parentesis, como en `:not(a, b)`.
 */
export function splitSelectorList(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const character of text) {
    if (character === "(" || character === "[") {
      depth += 1;
    } else if (character === ")" || character === "]") {
      depth -= 1;
    }

    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  parts.push(current);

  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/** Selector simple vacio: no restringe nada, asi que coincide con todo. */
function emptySimple(): SimpleSelector {
  return { tag: null, id: null, classes: [], attributes: [], pseudo: [] };
}

/** Lee un token hasta uno de los caracteres de corte, sin pasar del final. */
function readToken(text: string, start: number, stops: string): string {
  let end = start;

  while (end < text.length && !stops.includes(text[end] ?? "") && !/\s/.test(text[end] ?? "")) {
    end += 1;
  }

  return text.slice(start, end);
}

/** Lee un atributo `[...]` respetando las comillas. */
function readAttribute(text: string, start: number): { value: string; end: number } {
  let index = start + 1;
  let quote: string | null = null;

  while (index < text.length) {
    const character = text[index] ?? "";

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "]") {
      return { value: text.slice(start + 1, index), end: index + 1 };
    }

    index += 1;
  }

  return { value: text.slice(start + 1), end: text.length };
}

/** Lee un pseudo con sus parentesis, como `:not(.a, .b)`. */
function readPseudo(text: string, start: number): { value: string; end: number } {
  let index = start + 1;

  // `::before` lleva dos puntos, pero cuenta igual que `::after`.
  if (text[index] === ":") {
    index += 1;
  }

  while (index < text.length && /[a-zA-Z0-9-]/.test(text[index] ?? "")) {
    index += 1;
  }

  if (text[index] === "(") {
    let depth = 0;

    while (index < text.length) {
      if (text[index] === "(") {
        depth += 1;
      } else if (text[index] === ")") {
        depth -= 1;

        if (depth === 0) {
          index += 1;
          break;
        }
      }

      index += 1;
    }
  }

  return { value: text.slice(start, index), end: index };
}

/** Lee un selector simple: `button.btn#entrar[disabled]:hover`. */
export function parseSimple(text: string): SimpleSelector {
  const simple = emptySimple();
  let index = 0;

  while (index < text.length) {
    const character = text[index] ?? "";

    if (character === "*") {
      // El universal no restringe, asi que se ignora a proposito.
      index += 1;
      continue;
    }

    if (character === "#") {
      const value = readToken(text, index + 1, ".#:[*");
      simple.id = value === "" ? null : value;
      index += 1 + value.length;
      continue;
    }

    if (character === ".") {
      const value = readToken(text, index + 1, ".#:[*");
      if (value !== "") {
        simple.classes.push(value);
      }
      index += 1 + value.length;
      continue;
    }

    if (character === "[") {
      const read = readAttribute(text, index);
      simple.attributes.push(read.value.trim());
      index = read.end;
      continue;
    }

    if (character === ":") {
      const read = readPseudo(text, index);
      simple.pseudo.push(read.value);
      index = read.end;
      continue;
    }

    const tag = readToken(text, index, ".#:[*");
    simple.tag = tag === "" ? null : tag.toLowerCase();
    index += tag.length;
  }

  return simple;
}

/** Convierte un selector escrito en pasos, cada uno con su combinador. */
function parseSteps(text: string): Selector["steps"] {
  const steps: Selector["steps"] = [];
  let index = 0;
  let combinator: Combinator = "descendant";

  while (index < text.length) {
    const character = text[index] ?? "";

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (character === ">" || character === "+" || character === "~") {
      combinator = character === ">" ? "child" : character === "+" ? "adjacent" : "sibling";
      index += 1;
      continue;
    }

    const start = index;

    while (index < text.length && !/[\s>+~]/.test(text[index] ?? "")) {
      index += 1;
    }

    steps.push({ combinator, simple: parseSimple(text.slice(start, index)) });
    combinator = "descendant";
  }

  return steps;
}

/** Cuenta la especificidad de un selector ya separado en pasos. */
export function specificityOf(steps: Selector["steps"]): Specificity {
  const total: Specificity = { a: 0, b: 0, c: 0 };

  for (const step of steps) {
    if (step.simple.id !== null) {
      total.a += 1;
    }

    total.b += step.simple.classes.length + step.simple.attributes.length;

    for (const pseudo of step.simple.pseudo) {
      // Un pseudo-elemento (`::before`) cuenta como etiqueta; una pseudo-clase
      // (`:hover`, `:not(...)`) cuenta como clase.
      if (pseudo.startsWith("::")) {
        total.c += 1;
      } else {
        total.b += 1;
      }
    }

    if (step.simple.tag !== null) {
      total.c += 1;
    }
  }

  return total;
}

/** Analiza un selector escrito. Devuelve `null` si no se puede interpretar. */
export function parseSelector(text: string): Selector | null {
  const trimmed = text.trim();

  if (trimmed === "") {
    return null;
  }

  const steps = parseSteps(trimmed);

  if (steps.length === 0) {
    return null;
  }

  return {
    text: trimmed,
    steps,
    specificity: specificityOf(steps),
    dynamic: steps.some((step) => step.simple.pseudo.length > 0),
  };
}

/** Analiza una lista de selectores y descarta los que no se entiendan. */
export function parseSelectorList(text: string): Selector[] {
  return splitSelectorList(text)
    .map(parseSelector)
    .filter((selector): selector is Selector => selector !== null);
}

/** `true` si un nodo cumple un selector simple. */
function matchesSimple(node: PrismaNode, simple: SimpleSelector): boolean {
  if (node.kind !== "element" || node.tag === null) {
    return false;
  }

  if (simple.tag !== null && simple.tag !== node.tag) {
    return false;
  }

  if (simple.id !== null && htmlId(node) !== simple.id) {
    return false;
  }

  for (const required of simple.classes) {
    if (!classList(node).includes(required)) {
      return false;
    }
  }

  for (const required of simple.attributes) {
    // Solo se exige que el atributo exista; `[type="text"]` con su valor exacto
    // es un refinamiento de M2.1.0.
    const name = (required.split(/[~|^$*]?=/)[0] ?? required).trim();

    if (!node.attributes.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      return false;
    }
  }

  return true;
}

/** Explicacion legible de que parte del selector produjo la coincidencia. */
function describeMatch(simple: SimpleSelector): string {
  const parts: string[] = [];

  if (simple.tag !== null && simple.tag !== "*") {
    parts.push(simple.tag);
  }

  if (simple.id !== null) {
    parts.push(`#${simple.id}`);
  }

  for (const name of simple.classes) {
    parts.push(`.${name}`);
  }

  for (const name of simple.attributes) {
    parts.push(`[${name}]`);
  }

  return parts.length > 0 ? parts.join("") : "*";
}

/** Los hijos del padre del nodo, o las raices si el nodo no tiene padre. */
function siblingsOf(roots: Roots, node: PrismaNode): PrismaNode[] {
  if (node.parentId === null) {
    return roots;
  }

  return findById(roots, node.parentId)?.children ?? [];
}

/** El padre del nodo, o `null` si es una raiz. */
function parentOf(roots: Roots, node: PrismaNode): PrismaNode | null {
  return node.parentId === null ? null : findById(roots, node.parentId);
}

/**
 * `true` si un selector completo alcanza al elemento.
 *
 * El ultimo paso es el elemento y los anteriores se buscan hacia arriba, que es
 * como funciona CSS de verdad. Por eso necesita el arbol, no solo el elemento.
 */
export function selectorMatches(roots: Roots, node: PrismaNode, selector: Selector): boolean {
  const steps = selector.steps;
  const last = steps[steps.length - 1];

  if (last === undefined || !matchesSimple(node, last.simple)) {
    return false;
  }

  return matchesRest(roots, node, steps, steps.length - 1);
}

function matchesRest(
  roots: Roots,
  node: PrismaNode,
  steps: Selector["steps"],
  index: number,
): boolean {
  if (index === 0) {
    return true;
  }

  const step = steps[index];
  const siblings = siblingsOf(roots, node);
  const position = siblings.indexOf(node);

  if (step === undefined) {
    return false;
  }

  // `>` exige un padre inmediato, asi que no hay nada que buscar antes.
  if (step.combinator === "child") {
    const parent = parentOf(roots, node);

    return (
      parent !== null &&
      matchesSimple(parent, step.simple) &&
      matchesRest(roots, parent, steps, index - 1)
    );
  }

  if (step.combinator === "descendant") {
    for (const sibling of siblings.slice(0, position)) {
      if (matchesSimple(sibling, step.simple) && matchesRest(roots, sibling, steps, index - 1)) {
        return true;
      }
    }

    const parent = parentOf(roots, node);
    return parent !== null && matchesRest(roots, parent, steps, index - 1);
  }

  // `+` y `~` se quedan con los hermanos anteriores. `~` salta al mas cercano que
  // cumpla; `+` solo mira el inmediato.
  const candidates =
    step.combinator === "adjacent"
      ? position > 0
        ? [siblings[position - 1]]
        : []
      : siblings.slice(0, Math.max(0, position)).reverse();

  for (const candidate of candidates) {
    if (candidate === undefined) {
      continue;
    }

    if (matchesSimple(candidate, step.simple) && matchesRest(roots, candidate, steps, index - 1)) {
      return true;
    }
  }

  return false;
}

/**
 * Reglas que alcanzan a un elemento, de menos a mas especifica.
 *
 * Las dinamicas tambien se devuelven, pero marcadas: un lienzo estatico no puede
 * representar `:hover`, y prefiero que esa informacion exista y se marque a que
 * se pierda.
 */
export function matchElement(
  roots: Roots,
  node: PrismaNode,
  stylesheets: Stylesheet[],
): StyleMatch[] {
  if (node.kind !== "element") {
    return [];
  }

  const matches: StyleMatch[] = [];

  for (const stylesheet of stylesheets) {
    for (const rule of stylesheet.rules) {
      for (const selector of parseSelectorList(rule.selector)) {
        if (!selectorMatches(roots, node, selector)) {
          continue;
        }

        const last = selector.steps[selector.steps.length - 1];

        matches.push({
          stylesheetPath: stylesheet.path,
          rule,
          selector,
          matchedBy: last === undefined ? selector.text : describeMatch(last.simple),
          dynamic: selector.dynamic,
        });
      }
    }
  }

  return matches.sort((left, right) =>
    compareSpecificity(left.selector.specificity, right.selector.specificity),
  );
}
