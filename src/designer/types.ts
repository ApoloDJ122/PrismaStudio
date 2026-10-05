/**
 * M2.0.0 - Tipos del modelo interno del diseñador visual.
 *
 * Este archivo solo define la forma de los datos. No contiene lógica ni depende de
 * React, de Rust o del sistema de archivos, y se puede probar por separado.
 *
 * Idea central: el modelo es una representacion intermedia entre los archivos
 * reales y el futuro diseñador. Los archivos siguen siendo la fuente de verdad;
 * aqui no se escribe nada.
 *
 * Tres separaciones sostienen todo el modelo:
 *
 *   - Identidad: `PrismaId` es interno y no tiene nada que ver con el atributo
 *     `id` de HTML. Un `<button id="loginButton">` puede tener `id` interno
 *     `element-001`.
 *   - Estructura y apariencia: un nodo guarda lo que es HTML o Blade
 *     (`tag`, `attributes`, `content`) por un lado, y la relacion con el CSS por
 *     otro (`StyleMatch`). No se mezclan.
 *   - Comportamiento: JavaScript no existe en este modelo. Un `<script>` se
 *     conserva como texto y se marca como no visual, pero nunca se convierte en
 *     elementos.
 */

/**
 * Identificador interno de Prisma, con la forma `element-001`.
 *
 * Deliberadamente NO es el atributo `id` de HTML: un proyecto externo puede no
 * tener ningun `id`, tenerlo repetido o no ser valido como identificador de
 * Prisma. El identificador interno lo genera Prisma y no depende del archivo.
 */
export type PrismaId = string;

/**
 * Naturaleza de un nodo.
 *
 * - `element`     etiqueta HTML, incluida una etiqueta de componente Blade.
 * - `text`        texto literal entre etiquetas.
 * - `comment`     `<!-- ... -->` o el comentario de Blade `{{-- ... --}}`.
 * - `dynamic`     contenido dinamico: `{{ $usuario->nombre }}`.
 * - `directive`   estructura Blade: `@if`, `@foreach`, `@section`, `@endif`...
 * - `unknown`     algo que Prisma no sabe interpretar. Se conserva tal cual.
 */
export type NodeKind = "element" | "text" | "comment" | "dynamic" | "directive" | "unknown";

/** De qué tipo de sintaxis Blade proviene un nodo, si viene de Blade. */
export type BladeForm = "component" | "directive" | "echo" | "comment";

/**
 * Si una directiva Blade abre un bloque, lo cierra, o hace las dos cosas.
 *
 * `@if(...)` y `@foreach(...)` abren; `@endif` y `@endforeach` cierran;
 * `@include(...)` y `@csrf` no son ninguno de los dos.
 */
export type BladeBlock = "open" | "close" | "self";

/**
 * Un atributo tal como aparece escrito en el archivo.
 *
 * `value` es `null` para los atributos sin valor, como `disabled`. `raw` guarda
 * el texto original para no perder comillas, mayusculas ni espacios: es lo que
 * permite reconstruir el archivo sin modificarlo.
 */
export interface Attribute {
  /** Nombre tal cual aparece, con su capitalizacion original. */
  name: string;
  /** Valor sin comillas, o `null` si el atributo no tiene. */
  value: string | null;
  /** Texto original completo del atributo. */
  raw: string;
}

/** Informacion Blade de un nodo. `null` si el nodo no viene de Blade. */
export interface BladeInfo {
  form: BladeForm;
  /**
   * Nombre de la directiva (`if`), nombre del componente (`x-alerta`) o
   * expresion sin las llaves (`$usuario->nombre`).
   */
  value: string;
  /** Solo en `directive`: si la directiva abre, cierra o no es de bloque. */
  block: BladeBlock | null;
}

/** De donde procede un nodo en el archivo real. */
export interface NodeOrigin {
  /** Ruta del archivo real. `null` en nodos creados a mano. */
  path: string | null;
  /** Linea 1based en el archivo de origen. `0` si se desconoce. */
  line: number;
}

/**
 * Un nodo del modelo interno.
 *
 * Un solo tipo para todos los casos, con `kind` como discriminante. No hace falta
 * una clase por etiqueta: `<div>` y `<section>` son el mismo tipo con distinto
 * `tag`, que es lo que permite añadirlos a medida que haga falta.
 */
export interface PrismaNode {
  /** Identificador interno de Prisma. Unico dentro del documento. */
  id: PrismaId;
  kind: NodeKind;

  /**
   * Nombre de la etiqueta en minusculas, solo en `kind: "element"`.
   * Para un componente Blade es el nombre real, por ejemplo `x-alerta`.
   */
  tag: string | null;

  /**
   * `false` si Prisma no reconoce la etiqueta.
   *
   * Un `<mi-componente>` o un `<x-alerta>` siguen siendo elementos: se conservan
   * con sus hijos y sus atributos, pero marcados como no conocidos para que las
   * capas superiores puedan decidir como tratarlos.
   */
  known: boolean;

  /** Atributos en el orden en que aparecen. Vacio si el nodo no tiene. */
  attributes: Attribute[];

  /** Texto de un nodo `text`. `null` en el resto. */
  content: string | null;

  /** Informacion Blade, o `null` si el nodo es HTML normal. */
  blade: BladeInfo | null;

  /** Nodo actual. Vacio si el archivo se creo vacio. */
  children: PrismaNode[];

  /**
   * Identificador del padre, o `null` si es una raiz.
   *
   * Se guarda la referencia y no el objeto para no crear ciclos: asi el modelo
   * se puede serializar, comparar y enviar entre capas sin problemas.
   */
  parentId: PrismaId | null;

  origin: NodeOrigin;

  /**
   * Texto exacto del archivo que abre este nodo: la etiqueta con sus atributos,
   * el texto, o el comentario.
   *
   * Es la garantia de que Prisma no pierde nada: aunque no entienda un elemento,
   * conserva su texto original.
   */
  source: string;

  /**
   * Texto exacto de la etiqueta o directiva que cierra este nodo, o `null` si no
   * tiene cierre: un `<img>`, un texto, un comentario o `<x-alerta />`.
   *
   * Va aparte del `source` porque los hijos van en medio. Guardar aqui el cierre
   * es lo que permite recorrer el modelo y reconstruir el archivo sin cambios.
   */
  closingSource: string | null;
}

/**
 * Un documento del modelo: la representacion interna de un archivo real.
 *
 * Un documento por archivo, no por proyecto. Las relaciones entre el HTML y el
 * CSS se resuelven despues, con `matchElement`.
 */
export interface DesignDocument {
  /** Ruta del archivo real que representa. `null` si se creo a mano. */
  path: string | null;
  /** Nodos de primer nivel, en orden. */
  roots: PrismaNode[];
}
