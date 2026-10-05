import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseStylesheet } from "./css.ts";
import { matchElement, parseSelector, compareSpecificity, specificityOf } from "./selector.ts";
import { parseMarkup } from "./parse.ts";
import { findByTag, flatten } from "./tree.ts";
import type { PrismaNode } from "./types.ts";
import type { Specificity } from "./styles.ts";

const { deepEqual, equal, ok } = assert;

function compare(left: Specificity, right: Specificity): number {
  return compareSpecificity(left, right);
}

describe("M2.0.0 hojas de estilo", () => {
  it("lee las reglas con sus selectores y declaraciones", () => {
    const sheet = parseStylesheet(".caja { color: red; margin: 0 }");

    equal(sheet.rules.length, 1);
    equal(sheet.rules[0]?.selector, ".caja");
    equal(sheet.rules[0]?.declarations.length, 2);
    equal(sheet.rules[0]?.declarations[0]?.property, "color");
    equal(sheet.rules[0]?.declarations[0]?.value, "red");
    equal(sheet.rules[0]?.declarations[0]?.important, false);
  });

  it("admite varios selectores en la misma regla", () => {
    const sheet = parseStylesheet("h1, h2 { color: red }");

    deepEqual(sheet.rules[0]?.declarations.map((item) => item.property), ["color"]);
    // La lista se conserva tal cual, para no perder como estaba escrita.
    equal(sheet.rules[0]?.selector, "h1, h2");
  });

  it("distingue una regla con !important", () => {
    const sheet = parseStylesheet(".a { color: red !important; background: blue }");
    const declarations = sheet.rules[0]?.declarations ?? [];

    equal(declarations[0]?.important, true);
    equal(declarations[0]?.value, "red");
    equal(declarations[1]?.important, false);
  });

  it("guarda el texto original de la regla", () => {
    const sheet = parseStylesheet(".a   {  color : red  }  ");

    equal(sheet.rules[0]?.source, ".a   {  color : red  }");
  });

  it("una hoja vacia o sin reglas no da error", () => {
    equal(parseStylesheet("").rules.length, 0);
    equal(parseStylesheet("   \n ").rules.length, 0);
    equal(parseStylesheet("/* solo un comentario */").rules.length, 0);
  });
});

describe("M2.0.0 selectores", () => {
  it("lee un selector simple", () => {
    const first1 = parseSelector("div.caja#principal")?.steps[0]?.simple;

    equal(first1?.tag, "div");
    deepEqual(first1?.classes, ["caja"]);
    equal(first1?.id, "principal");
  });

  it("separa el elemento de un selector universal", () => {
    equal(parseSelector("*")?.steps[0]?.simple.tag, null);
    equal(parseSelector(".sola")?.steps[0]?.simple.tag, null);
  });

  it("entiende los combinadores mas habituales", () => {
    deepEqual(
      parseSelector("main .caja > p")?.steps.map((step) => step.combinator),
      ["descendant", "descendant", "child"],
    );
    equal(parseSelector(".a + .b")?.steps[1]?.combinator, "adjacent");
    equal(parseSelector(".a ~ .b")?.steps[1]?.combinator, "sibling");
  });

  it("un pseudo se guarda aparte, sin intentar resolverlo", () => {
    // Un diseno visual es estatico: `:hover` no se puede representar.
    const dynamic = parseSelector("a:hover");

    deepEqual(dynamic?.steps[0]?.simple.pseudo, [":hover"]);
    equal(dynamic?.dynamic, true);
    equal(parseSelector("a")?.dynamic, false);
  });

  it("la especificidad distingue un id de una clase", () => {
    const of = (text: string) => specificityOf(parseSelector(text)?.steps ?? []);

    // El orden importa: es lo que decidira cual gana cuando se implemente la cascada.
    ok(compare(of("#a"), of(".a")) > 0);
    ok(compare(of(".a"), of("a")) > 0);
    ok(compare(of("#a.b.c"), of("#a")) > 0);
  });
});

describe("M2.0.0 relacion entre elemento y hoja de estilo", () => {
  it("una regla sencilla encuentra sus elementos", () => {
    const sheet = parseStylesheet(".caja { color: red }");
    const document = parseMarkup("<div class='caja'>Hola</div>");
    const matches = matchElement(document.roots, document.roots[0] as PrismaNode, [sheet]);

    equal(matches.length, 1);
    equal(matches[0]?.rule.declarations.length, 1);
    equal(matches[0]?.selector.text, ".caja");
  });

  it("descarta los elementos que no cumplen el selector", () => {
    const sheet = parseStylesheet(".caja { color: red }");
    const document = parseMarkup("<div class='otra'>Hola</div>");

    equal(matchElement(document.roots, document.roots[0] as PrismaNode, [sheet]).length, 0);
  });

  it("el selector de etiqueta alcanza a todos los elementos de su tipo", () => {
    const sheet = parseStylesheet("p { margin: 0 }");
    const document = parseMarkup("<p>Uno</p><div><p>Dos</p></div>");
    const paragraphs = flatten(document.roots).filter((node) => node.tag === "p");

    equal(paragraphs.length, 2);

    for (const paragraph of paragraphs) {
      equal(matchElement(document.roots, paragraph, [sheet]).length, 1);
    }
  });

  it("un selector de hijo no alcanza a un nieto", () => {
    const sheet = parseStylesheet("main > p { color: red }");
    const document = parseMarkup("<main><section><p>Hola</p></section></main>");
    const p = findByTag(document.roots, "p")[0];

    equal(matchElement(document.roots, p as PrismaNode, [sheet]).length, 0);
  });

  it("un selector dinamico se marca en vez de aplicarse", () => {
    // `:hover` se reconoce y se llega a guardar, pero se marca como dinamico para
    // que el lienzo estatico no lo aplique.
    const sheet = parseStylesheet("a:hover { color: red }");
    const document = parseMarkup("<a href='#'>Hola</a>");
    const matches = matchElement(
      document.roots,
      findByTag(document.roots, "a")[0] as PrismaNode,
      [sheet],
    );

    equal(matches.length, 1);
    equal(matches[0]?.dynamic, true);
  });

  it("un texto no recibe estilos de elemento", () => {
    // El selector universal alcanza a todo elemento, pero no a un texto suelto.
    const sheet = parseStylesheet("* { color: red }");
    const document = parseMarkup("<p>Hola</p>");
    const text = flatten(document.roots).find((node) => node.kind === "text");

    equal(matchElement(document.roots, text as PrismaNode, [sheet]).length, 0);
  });
});
