/**
 * M2.0.0 - Modelo de CSS: hojas de estilo, reglas y declaraciones.
 *
 * El CSS es la parte de apariencia. Se guarda aparte del HTML, pero se puede
 * relacionar con el: `matchElement` dice que reglas alcanzan a un elemento.
 *
 * Aqui no se edita nada. Se describe lo que hay en el archivo para que el futuro
 * inspector pueda mostrarlo y, mas adelante, modificarlo.
 */

/** Una declaracion CSS, como `color: white`. */
export interface CssDeclaration {
  property: string;
  value: string;
  /** `true` si la declaracion termina en `!important`. */
  important: boolean;
  /** Texto original de la declaracion. */
  raw: string;
}

/** Una regla CSS, como `.btn { color: white; }`. */
export interface CssRule {
  /** Selector tal cual esta escrito. Puede ser una lista: `a, b`. */
  selector: string;
  declarations: CssDeclaration[];
  /** Linea 1based en el archivo de estilo. `0` si se desconoce. */
  line: number;
  /** Texto original de la regla. */
  source: string;
}

/** Una hoja de estilo completa. */
export interface Stylesheet {
  /** Ruta del archivo `.css`. `null` si el CSS vino dentro del HTML. */
  path: string | null;
  rules: CssRule[];
}

/**
 * Especificidad de un selector, con la cuenta clasica de CSS.
 *
 * Se ordena comparando `a` (ids), despues `b` (clases, atributos y
 * pseudo-clases) y despues `c` (etiquetas y pseudo-elementos).
 */
export interface Specificity {
  a: number;
  b: number;
  c: number;
}

/** Un selector simple, como `button.btn#entrar` o `a:hover`. */
export interface SimpleSelector {
  /** Etiqueta, o `null` si el selector no impone etiqueta (`*` o `.btn`). */
  tag: string | null;
  /** Valor del `#id`, o `null`. */
  id: string | null;
  classes: string[];
  /** Atributos exigidos, como `[disabled]`. */
  attributes: string[];
  /** Pseudo-clases y pseudo-elementos, como `:hover`. */
  pseudo: string[];
}

/** Un paso de un selector, con el combinador que lo une al anterior. */
export interface SelectorStep {
  /** `descendant` en el primer paso o en un espacio. */
  combinator: "descendant" | "child" | "adjacent" | "sibling";
  simple: SimpleSelector;
}

/** Un selector completo, ya separada la lista de selectores. */
export interface Selector {
  text: string;
  steps: SelectorStep[];
  specificity: Specificity;
  /**
   * `true` si el selector tiene pseudo-clases o pseudo-elementos.
   *
   * Un diseñador visual es estatico: `:hover` no se puede representar, asi que
   * la relacion se guarda pero se marca como dinamica para no aplicarla.
   */
  dynamic: boolean;
}

/** Una regla CSS que alcanza a un elemento concreto. */
export interface StyleMatch {
  /** Hoja de estilo donde vive la regla. `null` si es CSS incrustado. */
  stylesheetPath: string | null;
  rule: CssRule;
  /** Selector concreto que ha coincidido, si la regla tenia varios. */
  selector: Selector;
  /** Parte del selector que produjo la coincidencia, para explicarla. */
  matchedBy: string;
  /** `true` si el selector es dinamico y no se aplica en el lienzo estatico. */
  dynamic: boolean;
}
