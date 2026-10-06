/**
 * M2.2.0 - Paleta de elementos del diseñador.
 *
 * Es una tabla y no una interfaz cerrada: añadir un elemento al diseño es
 * añadir una fila aqui, sin tocar el lienzo, el árbol ni la persistencia. El
 * contrato que hay que respetar al ampliarla es que el `tag` sea un nombre
 * válido para `createElement` y que la etiqueta pueda dibujarse en el lienzo
 * (no hace falta que exista en `KNOWN_TAGS`: las etiquetas propias del
 * proyecto se crean igual).
 */

export interface PaletteItem {
  /** Nombre de la etiqueta que se inserta. */
  readonly tag: string;
  /** Texto del botón en la barra de herramientas. */
  readonly label: string;
  /** Grupo para separar botones en la interfaz. */
  readonly group: string;
}

/** Elementos disponibles al pulsar Añadir elemento. */
export const ELEMENT_PALETTE: readonly PaletteItem[] = [
  { tag: "div", label: "div", group: "Estructura" },
  { tag: "section", label: "section", group: "Estructura" },
  { tag: "article", label: "article", group: "Estructura" },
  { tag: "header", label: "header", group: "Estructura" },
  { tag: "footer", label: "footer", group: "Estructura" },
  { tag: "main", label: "main", group: "Estructura" },
  { tag: "nav", label: "nav", group: "Estructura" },
  { tag: "p", label: "p", group: "Texto" },
  { tag: "h1", label: "h1", group: "Texto" },
  { tag: "h2", label: "h2", group: "Texto" },
  { tag: "h3", label: "h3", group: "Texto" },
  { tag: "span", label: "span", group: "Texto" },
  { tag: "button", label: "button", group: "Controles" },
  { tag: "input", label: "input", group: "Controles" },
  { tag: "textarea", label: "textarea", group: "Controles" },
  { tag: "img", label: "img", group: "Controles" },
  { tag: "a", label: "a", group: "Controles" },
];

/** Etiquetas del proyecto que Prisma suele pintar con aspecto protegido. */
export const PROTECTED_TAGS: readonly string[] = ["script", "style", "iframe"];
