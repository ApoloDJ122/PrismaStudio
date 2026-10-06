import { classList, flatten } from "./tree.ts";
import { appendClassName } from "./attributes.ts";
import type { PrismaNode } from "./types.ts";

/**
 * M2.2.0 - Clases de diseñador.
 *
 * Reglas que cumplen estas funciones:
 *
 * 1. Nunca sustituyen una clase existente: se anaden al final del `class`.
 * 2. Un elemento nuevo sin clase recibe una clase única del documento
 *    (`button-1`, `div-1`, ...), numerada desde 1 y sin chocar con las ya
 *    usadas.
 * 3. Un elemento que ya tiene clase única la reutiliza: `ensureDesignClass`
 *    es idempotente y no cambia el HTML entre dos llamadas seguidas.
 * 4. Si todas las clases del elemento son compartidas por otros elementos
 *    (`class="card"` en diez sitios), se anade una única nueva; las originales
 *    se conservan.
 *
 * El prefijo usa el nombre de la etiqueta porque tiene que ser legible en el
 * árbol y en el CSS (`button-1` y no `element-1`).
 */

/** Nombre usado cuando la etiqueta no aporta un prefijo utilizable. */
const FALLBACK_PREFIX = "element";

/** Queda solo con letras, digitos, guiones y guiones bajos (`<h1>` -> `h1`). */
export function tagPrefix(tag: string | null): string {
  if (tag === null) {
    return FALLBACK_PREFIX;
  }

  const cleaned = tag.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return cleaned === "" ? FALLBACK_PREFIX : cleaned;
}

/** Todas las clases usadas en el documento. */
export function usedClassNames(roots: PrismaNode[]): Set<string> {
  const used = new Set<string>();

  for (const node of flatten(roots)) {
    for (const name of classList(node)) {
      used.add(name);
    }
  }

  return used;
}

/** Cuantas veces aparece cada clase en el documento. */
export function classUsage(roots: PrismaNode[]): Map<string, number> {
  const usage = new Map<string, number>();

  for (const node of flatten(roots)) {
    for (const name of classList(node)) {
      usage.set(name, (usage.get(name) ?? 0) + 1);
    }
  }

  return usage;
}

/**
 * Clase con la que identificar CSS para este elemento, o `null`.
 *
 * Solo sirve una clase unica en el documento: dos elementos con la misma clase
 * comparten sus reglas, asi que escribir `left/top` en ella moveria a los dos.
 */
export function designClassOf(roots: PrismaNode[], node: PrismaNode): string | null {
  const usage = classUsage(roots);

  for (const name of classList(node)) {
    if (usage.get(name) === 1) {
      return name;
    }
  }

  return null;
}

/**
 * Siguiente clase automatica libre para una etiqueta (`button-1`, `button-2`).
 *
 * Comprueba contra todas las clases existentes, asi que una regla `div-2`
 * escrita a mano por el usuario tampoco se pisa.
 */
export function nextClassName(roots: PrismaNode[], tag: string | null): string {
  const base = tagPrefix(tag);
  const used = usedClassNames(roots);
  let counter = 1;

  while (used.has(`${base}-${counter}`)) {
    counter += 1;
  }

  return `${base}-${counter}`;
}

/**
 * Devuelve una clase única usable para CSS, anadiendola al elemento si hace
 * falta. Es la funcion que usan las ediciones de posición: garantiza que cada
 * movimiento tenga una regla propia.
 */
export function ensureDesignClass(roots: PrismaNode[], node: PrismaNode): string {
  const existing = designClassOf(roots, node);

  if (existing !== null) {
    return existing;
  }

  const created = nextClassName(roots, node.kind === "element" ? node.tag : null);
  appendClassName(node, created);
  return created;
}

/** Los elementos del documento son candidatos a mover; texto y Blade, no. */
export function isMovableNode(node: PrismaNode): boolean {
  return node.kind === "element" && node.tag !== null;
}
