import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appendClassName, setAttribute } from "./attributes.ts";
import { parseMarkup } from "./parse.ts";
import { serialize } from "./tree.ts";

const { equal, ok } = assert;

function roots(html: string) {
  return parseMarkup(html).roots;
}

describe("M2.2.0 atributos", () => {
  it("appendClassName añade una clase sin borrar las existentes", () => {
    const doc = roots('<div class="card">x</div>');
    const el = doc[0];
    ok(el !== undefined);
    ok(appendClassName(el!, "div-1"));
    equal(serialize(doc), '<div class="card div-1">x</div>');
  });

  it("setAttribute sobrescribe un atributo existente", () => {
    const doc = roots('<div id="old">x</div>');
    const el = doc[0];
    ok(el !== undefined);
    ok(setAttribute(el!, "id", "new"));
    equal(serialize(doc), '<div id="new">x</div>');
  });

  it("setAttribute añade un atributo nuevo", () => {
    const doc = roots("<div>x</div>");
    const el = doc[0];
    ok(el !== undefined);
    ok(setAttribute(el!, "title", "hello"));
    equal(serialize(doc), '<div title="hello">x</div>');
  });

  it("setAttribute no toca las etiquetas de contenido plano", () => {
    const doc = roots("<style>.a{}</style>");
    const el = doc[0];
    ok(el !== undefined);
    equal(setAttribute(el!, "class", "x"), false);
    equal(serialize(doc), "<style>.a{}</style>");
  });
});
