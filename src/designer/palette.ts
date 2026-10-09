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
  { tag: "div", label: "Div", group: "Contenedores" },
  { tag: "section", label: "Section", group: "Contenedores" },
  { tag: "header", label: "Header", group: "Contenedores" },
  { tag: "footer", label: "Footer", group: "Contenedores" },
  { tag: "main", label: "Main", group: "Contenedores" },
  { tag: "nav", label: "Nav", group: "Contenedores" },
  { tag: "article", label: "Article", group: "Contenedores" },
  { tag: "aside", label: "Aside", group: "Contenedores" },
  { tag: "p", label: "P", group: "Texto" },
  { tag: "h1", label: "H1", group: "Texto" },
  { tag: "h2", label: "H2", group: "Texto" },
  { tag: "h3", label: "H3", group: "Texto" },
  { tag: "h4", label: "H4", group: "Texto" },
  { tag: "h5", label: "H5", group: "Texto" },
  { tag: "h6", label: "H6", group: "Texto" },
  { tag: "span", label: "Span", group: "Texto" },
  { tag: "button", label: "Button", group: "Interacción" },
  { tag: "input", label: "Input", group: "Interacción" },
  { tag: "textarea", label: "Textarea", group: "Interacción" },
  { tag: "select", label: "Select", group: "Interacción" },
  { tag: "label", label: "Label", group: "Interacción" },
  { tag: "form", label: "Form", group: "Interacción" },
  { tag: "img", label: "Image", group: "Media" },
  { tag: "a", label: "Link", group: "Enlaces" },
  { tag: "ul", label: "UL", group: "Listas" },
  { tag: "ol", label: "OL", group: "Listas" },
  { tag: "li", label: "LI", group: "Listas" },
];

/** Etiquetas del proyecto que Prisma suele pintar con aspecto protegido. */
export const PROTECTED_TAGS: readonly string[] = ["script", "style", "iframe"];
