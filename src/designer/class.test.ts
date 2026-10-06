import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appendClassName, setAttribute } from "./attributes.ts";
import {
  classUsage,
  designClassOf,
  ensureDesignClass,
  nextClassName,
  tagPrefix,
  usedClassNames,
} from "./class.ts";
import { parseMarkup } from "./parse.ts";
import { classList, findByTag, serialize } from "./tree.ts";
import type { PrismaNode } from "./types.ts";

const { equal, ok } = assert;

function roots(html: string) {
  return parseMarkup(html).roots;
}

describe("M2.2.0 clases de diseñador", () => {
  it("nombra la clase a partir de la etiqueta", () => {
    equal(tagPrefix("button"), "button");
    equal(tagPrefix("H1"), "h1");
    equal(tagPrefix(null), "element");
    equal(tagPrefix("???"), "element");
  });

  it("da a un elemento nuevo una clase unica numerada desde 1", () => {
    const document = roots("<body><div></div><div></div></body>");
    const [first, second] = document[0]?.children ?? [];

    ok(first !== undefined && second !== undefined);
    equal(ensureDesignClass(document, first), "div-1");
    equal(ensureDesignClass(document, second), "div-2");
  });

  it("no pisa una clase automatica que ya exista en el documento", () => {
    const document = roots('<body><div class="div-2"></div><div></div></body>');
    const [withClass, empty] = document[0]?.children ?? [];

    ok(withClass !== undefined && empty !== undefined);
    equal(nextClassName(document, "div"), "div-1");
    equal(ensureDesignClass(document, empty), "div-1");
    equal(nextClassName(document, "div"), "div-3");
  });

  it("conserva la clase que trae el elemento si es unica", () => {
    const document = roots('<button class="btn-primary">Enviar</button>');
    const button = document[0];

    ok(button !== undefined);
    equal(designClassOf(document, button), "btn-primary");
    equal(ensureDesignClass(document, button), "btn-primary");
    deepClassList(button, ["btn-primary"]);
    equal(serialize(document), '<button class="btn-primary">Enviar</button>');
  });

  it("anade una clase nueva sin sustituir las compartidas", () => {
    const document = roots('<div class="card">a</div><div class="card">b</div>');
    const card = document[0];

    ok(card !== undefined);
    equal(designClassOf(document, card), null);
    equal(ensureDesignClass(document, card), "div-1");
    deepClassList(card, ["card", "div-1"]);
    ok(serialize(document).includes('class="card div-1"'));
  });

  it("es idempotente: la segunda llamada no vuelve a anadir nada", () => {
    const document = roots("<p>hola</p>");
    const paragraph = document[0];

    ok(paragraph !== undefined);
    ensureDesignClass(document, paragraph);
    const afterFirst = serialize(document);
    equal(ensureDesignClass(document, paragraph), "p-1");
    equal(serialize(document), afterFirst);
  });

  it("cuenta las clases para saber cuales estan compartidas", () => {
    const document = roots('<div class="a"></div><span class="a b"></span>');
    const usage = classUsage(document);

    equal(usage.get("a"), 2);
    equal(usage.get("b"), 1);
    equal(usedClassNames(document).size, 2);
  });

  it("reescribe un atributo conservando su nombre original", () => {
    const document = roots('<DIV CLASS="vieja" TITLE="t">x</DIV>');
    const element = document[0];

    ok(element !== undefined);
    ok(setAttribute(element, "class", "nueva"));
    ok(serialize(document).startsWith('<DIV CLASS="nueva" TITLE="t">'));
    deepClassList(element, ["nueva"]);
  });

  it("anade un atributo nuevo sin romper uno con > dentro del valor", () => {
    const document = roots('<div title="a > b">x</div>');
    const element = document[0];

    ok(element !== undefined);
    ok(appendClassName(element, "div-1"));
    equal(serialize(document), '<div title="a > b" class="div-1">x</div>');
  });

  it("no toca las etiquetas de contenido plano", () => {
    const document = roots("<style>.a { color: red; }</style>");
    const style = document[0];

    ok(style !== undefined);
    equal(setAttribute(style, "class", "x"), false);
    equal(serialize(document), "<style>.a { color: red; }</style>");
  });

  it("funciona con el documento completo de un ejemplo", () => {
    const document = roots(
      '<html><head><title>t</title></head><body><div id="main"></div></body></html>',
    );
    const div = findByTag(document, "div")[0];

    ok(div !== undefined);
    equal(ensureDesignClass(document, div), "div-1");
    ok(serialize(document).includes('id="main" class="div-1"'));
  });
});

function deepClassList(node: PrismaNode, expected: string[]) {
  assert.deepEqual(classList(node), expected);
}
