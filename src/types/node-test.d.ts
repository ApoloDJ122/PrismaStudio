/**
 * Declaraciones minimas de los modulos integrados de Node que usan las pruebas.
 *
 * El proyecto no incluye @types/node y no se quiere anadir esa dependencia solo
 * para el conjunto de pruebas, asi que se declara aqui unicamente la superficie
 * que se usa. Si alguna vez se instala @types/node, este archivo debe borrarse
 * para no duplicar las declaraciones.
 */

declare module "node:assert/strict" {
  interface AssertStrict {
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    match(value: string, pattern: RegExp, message?: string): void;
    ok(value: unknown, message?: string): void;
  }

  const assert: AssertStrict;

  export default assert;
}

declare module "node:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
}

declare module "node:fs" {
  /** Suficiente para leer los estilos y comprobar sus tokens. */
  export function readFileSync(path: URL, encoding: "utf8"): string;
}