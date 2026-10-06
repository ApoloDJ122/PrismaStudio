/**
 * M2.1.0 - Tipos del modelo de analisis del proyecto.
 *
 * Este archivo solo define la forma de los datos. No depende de React, de Rust
 * ni del sistema de archivos, y se puede probar por separado.
 *
 * Que separa este modelo de los demas:
 *
 *   - `FileModel` describe el disco: que archivos hay y de que tipo son. Se
 *     deriva del escaneo de Rust, que solo mira nombres y tamanos.
 *   - `DocumentModel` describe un HTML o un Blade: su arbol, sus hojas de estilo
 *     y sus scripts. El arbol es el mismo `PrismaNode` de M2.0.0, no un modelo
 *     nuevo, para que M2.2.0 pueda consumirlo tal cual.
 *   - `ProjectModel` junta las dos cosas y anade el resumen y las advertencias.
 *
 * Aqui no hay ningun dato pensado solo para pintar un arbol: la idea es que el
 * futuro disenador visual consuma esta misma representacion.
 *
 * Regla de la casa: este modulo no lee ni escribe nada. Los archivos reales
 * siguen siendo la fuente de verdad y se leen desde el servicio de Tauri.
 */

import type { CssDeclaration, Specificity, Stylesheet } from "../designer/styles.ts";
import type { NodeOrigin, PrismaId, PrismaNode } from "../designer/types.ts";

/**
 * Que papel juega un archivo en el proyecto.
 *
 * Mas granular que `DesignFileKind` de M2.0.0, que solo separaba estructura,
 * apariencia y comportamiento: aqui hace falta distinguir HTML de Blade para
 * poder mostrarlo, y JavaScript de TypeScript para no meterlos en el mismo saco.
 */
export type FileType =
  /** `.html` o `.htm`: estructura estatica. */
  | "html"
  /** `.blade.php`: estructura con sintaxis de Laravel. */
  | "blade"
  /** `.css`: apariencia. */
  | "css"
  /** `.js`, `.mjs`: comportamiento. No se interpreta. */
  | "javascript"
  /** `.ts`, `.tsx`: comportamiento. Se detecta, no se analiza. */
  | "typescript"
  /** Cualquier otra cosa: se lista pero no participa. */
  | "other";

/** Un archivo del proyecto tal como lo encuentra el escaneo. */
export interface FileModel {
  /** Ruta completa, en la misma forma que la devuelve el arbol de archivos. */
  path: string;
  /** Ruta relativa a la raiz, con `/` como separador. Identifica al archivo. */
  relativePath: string;
  /** Nombre con extension, por ejemplo `home.blade.php`. */
  name: string;
  /** Extension en minusculas sin el punto: el ultimo tramo del nombre (`php` en un Blade). */
  extension: string;
  type: FileType;
  /** Tamano en bytes, tal y como lo informa el disco. */
  size: number;
}

/** Que tan grave es una advertencia de analisis. */
export type WarningSeverity = "info" | "warning" | "error";

/**
 * De que va la advertencia.
 *
 * - `scan`               el recorrido de carpetas se encontro con algo raro.
 * - `unreadable`         un archivo existia pero no se pudo leer.
 * - `parse-error`        un documento no se pudo analizar.
 * - `unresolved-reference` un `href` o `src` no apunta a ningun archivo.
 * - `unknown-element`    una etiqueta que Prisma no conoce.
 * - `unsupported-markup` una parte del archivo que no se llega a interpretar.
 * - `dynamic-content`    sintaxis Blade que se conserva pero no se ejecuta.
 * - `inline-styles`      un `<style>` incrustado que todavia no se analiza.
 */
export type AnalysisWarningType =
  | "scan"
  | "unreadable"
  | "parse-error"
  | "unresolved-reference"
  | "unknown-element"
  | "unsupported-markup"
  | "dynamic-content"
  | "inline-styles";

/**
 * Una advertencia de analisis.
 *
 * Un problema de un archivo nunca para el analisis del resto: se anota y se
 * sigue. Por eso el archivo es opcional y la linea puede ser `0` cuando se
 * desconoce.
 */
export interface AnalysisWarning {
  /** Identificador unico dentro del proyecto, para usarlo como `key`. */
  id: string;
  type: AnalysisWarningType;
  /** Frase corta y legible, escrita para la persona que mira la interfaz. */
  message: string;
  /** Ruta relativa del archivo. `null` si es un aviso del proyecto entero. */
  file: string | null;
  /** Linea 1based. `0` si se desconoce. */
  line: number;
  severity: WarningSeverity;
}

/**
 * Un `<link rel="stylesheet">` de un documento.
 *
 * Se guarda la referencia tal como esta escrita y, si se pudo resolver, la
 * carpeta que le toca. `found` dice si ademas es un archivo CSS que el proyecto
 * tiene de verdad.
 */
export interface StyleSheetReference {
  /** Atributo `href` tal como aparece en el archivo. */
  href: string;
  /** Ruta relativa al proyecto resuelta, o `null` si no se pudo resolver. */
  resolvedPath: string | null;
  /** `true` si es una URL externa (http, `//`, `data:`, `#...`). */
  external: boolean;
  /** `true` si apunta a un `.css` del propio proyecto. */
  found: boolean;
  /** Linea 1based del `<link>` dentro del documento. */
  line: number;
}

/** Un `<script>` de un documento. */
export interface ScriptReference {
  /** Atributo `src`, o `null` si el script esta escrito dentro del documento. */
  src: string | null;
  /** Ruta relativa al proyecto resuelta, o `null` si no se pudo resolver. */
  resolvedPath: string | null;
  /** `true` si es una URL externa. */
  external: boolean;
  /** `true` si el codigo esta dentro del propio documento. */
  inline: boolean;
  /** `true` si apunta a un archivo que el proyecto tiene de verdad. */
  found: boolean;
  /** Linea 1based del `<script>`. */
  line: number;
}

/**
 * Un HTML o un Blade ya analizado.
 *
 * `root` es el arbol completo con los mismos nodos de M2.0.0: no se copia ni se
 * simplifica, porque M2.2.0 necesita exactamente esa representacion para poder
 * dibujarla.
 */
export interface DocumentModel {
  /** Identificador estable: la ruta relativa del archivo. */
  id: string;
  /** Ruta completa del archivo. */
  filePath: string;
  /** Ruta relativa a la raiz, con `/`. */
  relativePath: string;
  type: "html" | "blade";
  /** Texto del `<title>`, o `null` si no tiene. */
  title: string | null;
  /** Arbol del documento, en el orden del archivo. */
  root: PrismaNode[];
  linkedStylesheets: StyleSheetReference[];
  linkedScripts: ScriptReference[];
  /** Hojas de estilo `<style>` que quedan por analizar, `0` si no tiene. */
  inlineStylesheets: number;
  /** Cantidad de elementos del documento, contando los no conocidos. */
  elementCount: number;
  /** Cantidad de elementos con `style="..."`, que tiene prioridad sobre CSS. */
  inlineStyleCount: number;
  /** Advertencias propias de este documento. */
  warnings: AnalysisWarning[];
  /** Advertencias por elemento, para poder mostrarlas al seleccionarlo. */
  elementWarnings: Record<PrismaId, AnalysisWarning[]>;
}

/** Un `.css` ya analizado. */
export interface StylesheetModel {
  /** Archivo del disco. */
  file: FileModel;
  /** Hoja de estilo leida con el lector de M2.0.0. */
  stylesheet: Stylesheet;
  /** Cantidad de reglas, que es lo que se muestra en el resumen. */
  ruleCount: number;
}

/** Resumen del analisis, que es lo primero que se muestra al usuario. */
export interface ProjectAnalysis {
  /** Archivos encontrados, de todos los tipos. */
  fileCount: number;
  /** Documentos HTML o Blade analizados. */
  documentCount: number;
  htmlCount: number;
  bladeCount: number;
  stylesheetCount: number;
  scriptCount: number;
  otherCount: number;
  /** Elementos HTML acumulados en todos los documentos. */
  elementCount: number;
  /** Reglas CSS encontradas en todos los `.css`. */
  ruleCount: number;
  /** Total de advertencias. */
  warningCount: number;
  /** Referencias a CSS o JS que no se pudieron resolver. */
  unresolvedCount: number;
}

/**
 * El proyecto completo ya analizado.
 *
 * Es el dato que M2.2.0 va a consumir: de aqui salen los documentos, sus
 * arboles, sus estilos y sus avisos. No se guarda todavia en disco, pero esta
 * pensado para poder serializarse tal cual.
 */
export interface ProjectModel {
  /** Carpeta raiz del proyecto. */
  rootPath: string;
  name: string;
  /** Todos los archivos encontrados, en orden. */
  files: FileModel[];
  /** HTML y Blade ya analizados. */
  documents: DocumentModel[];
  /** `.css` ya leidos. */
  stylesheets: StylesheetModel[];
  /** JavaScript y TypeScript detectados, sin leer. */
  scripts: FileModel[];
  analysis: ProjectAnalysis;
  /** Advertencias del proyecto y de cada documento, en orden de aparicion. */
  warnings: AnalysisWarning[];
}

/** Regla CSS como la ve el analisis, con su origen y su peso. */
export interface StyleRuleDetails {
  /** Selector tal cual esta escrito, por ejemplo `.button-primary`. */
  selector: string;
  declarations: CssDeclaration[];
  /** Ruta relativa del `.css` donde esta la regla. */
  sourceFile: string | null;
  /** Linea 1based dentro de su hoja de estilo. */
  line: number;
  /** Peso clasico del selector, para decidir despues quien gana. */
  specificity: Specificity;
  /** Posicion en el proyecto, para conservar el orden de la hoja. */
  order: number;
  /** `true` si tiene pseudo-clases y un lienzo estatico no lo puede aplicar. */
  dynamic: boolean;
}

/** Todo lo que un elemento tiene, listo para mostrarlo o guardarlo. */
export interface ElementDetails {
  /** Identificador interno de Prisma. */
  id: PrismaId;
  kind: PrismaNode["kind"];
  /** Nombre de la etiqueta en minusculas, o `null` si no es un elemento. */
  tagName: string | null;
  /** `false` si Prisma no reconoce la etiqueta. */
  known: boolean;
  /** Atributo `id` de HTML, o `null`. No es el identificador interno. */
  elementId: string | null;
  classes: string[];
  /** Texto visible que cuelga de este elemento, sin sus hijos estructurales. */
  textContent: string;
  /** Atributos en el orden del archivo. */
  attributes: { name: string; value: string | null }[];
  /** De donde procede: archivo y linea aproximada. */
  origin: NodeOrigin;
  /** Texto exacto de la etiqueta de apertura. */
  source: string;
  /** Reglas CSS que alcanzan a este elemento, de menor a mayor peso. */
  styles: StyleRuleDetails[];
  /** Declaraciones del atributo `style`, que tienen prioridad sobre el CSS. */
  inlineStyle: CssDeclaration[];
  /** Cantidad de hijos directos. */
  childCount: number;
  /** Advertencias asociadas a este elemento. */
  warnings: AnalysisWarning[];
}

/** Una regla CSS con la lista de elementos a los que alcanza. */
export interface StyleAssociation {
  /** Selector tal cual esta escrito, por ejemplo `.button-primary`. */
  selector: string;
  /** Ruta relativa del `.css` donde esta. */
  sourceFile: string | null;
  specificity: Specificity;
  /** Identificadores internos de los elementos que lo cumplen. */
  elementIds: PrismaId[];
}
