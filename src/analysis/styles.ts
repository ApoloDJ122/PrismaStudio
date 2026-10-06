/**
 * M2.1.0 - Relacion entre documentos y hojas de estilo.
 *
 * Este modulo responde a dos preguntas distintas y conviene no confundirlas:
 *
 *   - "Que estilos llegan a este elemento" (`stylesFor`, `describeElement`).
 *     El analizador pregunta por un elemento concreto y devuelve las reglas que
 *     lo alcanzan, de menor a mayor peso, con su origen. Es lo que la ficha de
 *     un elemento necesita mostrar.
 *   - "Que elementos toca esta regla" (`associateStyles`). Es la pregunta
 *     inversa y la respuesta es la que un editor visual necesita para saber que
 *     se mueve cuando se cambia un estilo.
 *
 * Ambas respetan lo que dice el documento: solo se miran las hojas que el HTML
 * enlaza con `<link rel="stylesheet">`. No se abre una cascada completa ni se
 * supone nada que el archivo no diga.
 */

import { parseDeclarations } from "../designer/css.ts";
import { matchElement } from "../designer/selector.ts";
import { attributeValue, classList, flatten, htmlId, textContent } from "../designer/tree.ts";
import type { CssRule, Stylesheet } from "../designer/styles.ts";
import type {
  DocumentModel,
  ElementDetails,
  StyleAssociation,
  StyleRuleDetails,
  StylesheetModel,
} from "./types.ts";

/**
 * Hojas de estilo disponibles para un documento y el peso de cada una de sus
 * reglas dentro del conjunto.
 *
 * El peso (`order`) es el numero de regla contado a lo largo del conjunto en
 * el orden en que se aplicarian: hoja por hoja, regla por regla. Junto con la
 * especificidad alcanza para explicar quien gana sin montar todavia una
 * cascada, que es cosa de M2.2.0.
 */
export interface StyleRuleIndex {
  /** Hojas de estilo ya leidas, en el orden de los `<link>`. */
  sheets: Stylesheet[];
  /** Posicion de cada regla dentro de ese conjunto. */
  order: ReadonlyMap<CssRule, number>;
  /** Cantidad total de reglas del conjunto. */
  ruleCount: number;
}

const EMPTY_INDEX: StyleRuleIndex = { sheets: [], order: new Map(), ruleCount: 0 };

/** Indice vacio, para documentos sin hojas de estilo enlazadas. */
export function emptyStyleIndex(): StyleRuleIndex {
  return EMPTY_INDEX;
}

/** Construye el indice de un conjunto de hojas de estilo. */
export function buildStyleIndex(models: StylesheetModel[]): StyleRuleIndex {
  if (models.length === 0) {
    return EMPTY_INDEX;
  }

  const sheets: Stylesheet[] = [];
  const order = new Map<CssRule, number>();
  let ruleCount = 0;

  for (const model of models) {
    sheets.push(model.stylesheet);

    for (const rule of model.stylesheet.rules) {
      order.set(rule, ruleCount);
      ruleCount += 1;
    }
  }

  return { sheets, order, ruleCount };
}

/**
 * Hojas que este documento enlaza y que el proyecto tiene de verdad.
 *
 * Solo esas: un `<link>` a una URL externa no se sigue, y lo que no aparezca en
 * el proyecto no se inventa. Si el mismo archivo se enlaza dos veces, se
 * considera una sola.
 */
export function linkedStyleModels(
  document: DocumentModel,
  models: StylesheetModel[],
): StylesheetModel[] {
  const byPath = new Map(models.map((model) => [model.file.relativePath, model]));
  const linked: StylesheetModel[] = [];
  const seen = new Set<string>();

  for (const reference of document.linkedStylesheets) {
    if (reference.external || reference.resolvedPath === null) {
      continue;
    }

    if (seen.has(reference.resolvedPath)) {
      continue;
    }

    seen.add(reference.resolvedPath);

    const model = byPath.get(reference.resolvedPath);
    if (model !== undefined) {
      linked.push(model);
    }
  }

  return linked;
}

/**
 * Reglas CSS que alcanzan a un elemento, de menor a mayor peso.
 *
 * El primer elemento de la lista es el que menos manda y el ultimo el que mas,
 * que es el orden en el que la mayoria de editores las muestran.
 */
export function stylesFor(
  index: StyleRuleIndex,
  roots: DocumentModel["root"],
  node: DocumentModel["root"][number],
): StyleRuleDetails[] {
  if (index.sheets.length === 0 || node.kind !== "element") {
    return [];
  }

  return matchElement(roots, node, index.sheets).map((match) => ({
    selector: match.selector.text,
    declarations: match.rule.declarations,
    sourceFile: match.stylesheetPath,
    line: match.rule.line,
    specificity: match.selector.specificity,
    order: index.order.get(match.rule) ?? 0,
    dynamic: match.dynamic,
  }));
}

/** Declaraciones del atributo `style`, que siempre mandan mas que el CSS. */
export function inlineDeclarations(
  node: DocumentModel["root"][number],
): ReturnType<typeof parseDeclarations> {
  const style = attributeValue(node, "style");

  if (style === null || style.trim() === "") {
    return [];
  }

  return parseDeclarations(style);
}

/**
 * Todo lo que un elemento tiene, listo para mostrarlo.
 *
 * El texto, las clases y los atributos salen del arbol tal cual; los estilos
 * salen del indice de la hoja que su documento enlaza. Si el elemento no tiene
 * estilos, la lista viene vacia: no se rellena con nada por defecto.
 */
export function describeElement(
  document: DocumentModel,
  node: DocumentModel["root"][number],
  index: StyleRuleIndex,
): ElementDetails {
  const tag = node.kind === "element" ? node.tag : null;

  return {
    id: node.id,
    kind: node.kind,
    tagName: tag,
    known: node.kind === "element" ? node.known : false,
    elementId: htmlId(node),
    classes: classList(node),
    textContent: textContent(node),
    attributes: node.attributes.map((item) => ({ name: item.name, value: item.value })),
    origin: node.origin,
    source: node.source,
    styles: stylesFor(index, document.root, node),
    inlineStyle: inlineDeclarations(node),
    childCount: node.children.length,
    warnings: document.elementWarnings[node.id] ?? [],
  };
}

/**
 * Reglas CSS con la lista de elementos a los que alcanza.
 *
 * Es la vista inversa de `stylesFor`: en vez de preguntar que le pasa a un
 * elemento, se pregunta que toca cada regla. Se construye recorriendo los
 * documentos con sus hojas enlazadas y guardando cada combinacion una sola vez,
 * asi que sirve para pintar el navegador de estilos del proyecto.
 */
export function associateStyles(
  documents: DocumentModel[],
  stylesheets: StylesheetModel[],
): StyleAssociation[] {
  const associations = new Map<string, StyleAssociation>();

  for (const document of documents) {
    const models = linkedStyleModels(document, stylesheets);
    if (models.length === 0) {
      continue;
    }

    const index = buildStyleIndex(models);

    for (const node of flatten(document.root)) {
      if (node.kind !== "element") {
        continue;
      }

      for (const rule of stylesFor(index, document.root, node)) {
        const key = `${rule.sourceFile ?? ""} ${rule.selector}`;
        const existing = associations.get(key);

        if (existing === undefined) {
          associations.set(key, {
            selector: rule.selector,
            sourceFile: rule.sourceFile,
            specificity: rule.specificity,
            elementIds: [node.id],
          });
        } else if (!existing.elementIds.includes(node.id)) {
          existing.elementIds.push(node.id);
        }
      }
    }
  }

  return [...associations.values()];
}
