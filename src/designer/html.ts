/**
 * M2.0.0 - Etiquetas HTML que Prisma reconoce.
 *
 * Esta lista no decide como se dibuja nada: solo responde a "conozco esta
 * etiqueta?". Un elemento con etiqueta desconocida se conserva igualmente, con
 * sus hijos y sus atributos, y aparece con `known: false`.
 *
 * Que la lista sea una tabla y no una clase por etiqueta es lo que permite que
 * el modelo sea generico: `<div>` y `<section>` no son tipos distintos.
 */

/** Etiquetas HTML estandar que Prisma reconoce. */
export const KNOWN_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo",
  "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col",
  "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt",
  "em", "embed", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4",
  "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins",
  "kbd", "label", "legend", "li", "link", "main", "map", "mark", "menu", "meta", "meter", "nav",
  "noscript", "object", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress",
  "q", "rp", "rt", "ruby", "s", "samp", "script", "search", "section", "select", "slot", "small",
  "source", "span", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td",
  "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul",
  "var", "video", "wbr",
]);

/**
 * Etiquetas que no tienen contenido ni etiqueta de cierre.
 *
 * Un `<img>` no abre nada: no puede tener hijos y no debe emparejarce con un
 * `</img>` posterior. Confundirlas es la causa clasica de que un arbol se desmonte
 * solo a partir de la mitad del archivo.
 */
export const VOID_TAGS: ReadonlySet<string> = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track",
  "wbr",
]);

/**
 * Etiquetas cuyo contenido es texto y no HTML.
 *
 * `<script>` y `<style>` se conservan enteros y sin interpretar. Para `<script>`
 * es tambien la forma de que JavaScript se quede fuera del modelo visual: su
 * contenido nunca se convierte en elementos.
 */
export const RAW_TEXT_TAGS: ReadonlySet<string> = new Set([
  "script", "style", "textarea", "title",
]);

/** Etiquetas cuyo modelo visual no tiene sentido aunque se parsen. */
export const NON_VISUAL_TAGS: ReadonlySet<string> = new Set(["script"]);

/** `true` si Prisma reconoce la etiqueta. */
export function isKnownTag(tag: string): boolean {
  return KNOWN_TAGS.has(tag.toLowerCase());
}

/** `true` si la etiqueta no tiene cierre. */
export function isVoidTag(tag: string): boolean {
  return VOID_TAGS.has(tag.toLowerCase());
}

/** `true` si el contenido de la etiqueta es texto plano. */
export function isRawTextTag(tag: string): boolean {
  return RAW_TEXT_TAGS.has(tag.toLowerCase());
}

/** `true` si la etiqueta no aporta nada visual, como `<script>`. */
export function isNonVisualTag(tag: string): boolean {
  return NON_VISUAL_TAGS.has(tag.toLowerCase());
}

/**
 * `true` si por dentro puede alojar otros elementos del diseño.
 *
 * Lo usan el lienzo y el árbol para decidir donde se puede soltar algo: un
 * `<img>` no tiene interior, un `<style>` solo admite texto, y `head` o `html`
 * no son superficies de diseño aunque tecnicamente contengan nodos. Las
 * etiquetas propias del proyecto (desconocidas o componentes Blade) cuentan
 * como contenedores: se ven y se puede trabajar dentro de ellas.
 */
export function isContainerTag(tag: string): boolean {
  const name = tag.toLowerCase();

  if (isVoidTag(name) || isRawTextTag(name) || isNonVisualTag(name)) {
    return false;
  }

  if (name === "head" || name === "html") {
    return false;
  }

  return true;
}

/**
 * `true` si el nombre parece el de un componente Blade, como `x-alerta`.
 *
 * No se descarta: se conserva como elemento con su contenido, marcado como no
 * conocido. Saber que es un componente ayuda a las capas superiores, pero no
 * autoriza a inventarse su contenido.
 */
export function isComponentName(name: string): boolean {
  return /^x-[a-z0-9.]+(?::[a-z0-9-]+)?$/.test(name);
}
