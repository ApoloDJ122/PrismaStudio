import type { PrismaId } from "./types.ts";

/**
 * M2.0.0 - Identidad interna de los elementos.
 *
 * Cada elemento del modelo recibe un identificador propio de Prisma, del tipo
 * `element-001`. No es el atributo `id` de HTML: son dos cosas distintas y
 * confundirlas rompe el diseñador en cuanto un proyecto externo viene sin ids o
 * con ids repetidos.
 *
 *   id interno de Prisma   element-001
 *   atributo id de HTML     loginButton
 *
 * El identificador se genera en orden de lectura del archivo, asi que volver a
 * analizar el mismo archivo produce los mismos identificadores. Es lo que permite
 * que mas adelante se pueda reconocer un elemento entre dos analisis sin depender
 * del texto.
 */

/** Prefijo de los identificadores internos. */
export const ID_PREFIX = "element";

/** Digitos con los que se rellena el numero: `element-001`. */
const ID_PADDING = 3;

/**
 * Genera identificadores internos correlativos.
 *
 * Se crea uno por documento. El numero crece sin limite: al pasar de 999 pasa a
 * `element-1000`, sin repetir ningun identificador.
 */
export function createIdFactory(): { next: () => PrismaId } {
  let counter = 0;

  return {
    next: () => {
      counter += 1;
      return `${ID_PREFIX}-${String(counter).padStart(ID_PADDING, "0")}`;
    },
  };
}

/** Como `createIdFactory`, pero aplaza el numero inicial. */
export function createIdFactoryFrom(start: number): { next: () => PrismaId } {
  const factory = createIdFactory();

  for (let index = 0; index < start; index += 1) {
    factory.next();
  }

  return factory;
}

/**
 * Comprueba si un identificador tiene la forma que genera esta fabrica.
 *
 * Sirve para distinguir de un vistazo un id interno de un `id` de HTML en
 * diagnosticos y pruebas.
 */
export function isPrismaId(value: string): boolean {
  if (!value.startsWith(`${ID_PREFIX}-`)) {
    return false;
  }

  const number = value.slice(ID_PREFIX.length + 1);

  return number.length >= ID_PADDING && /^[0-9]+$/.test(number);
}
