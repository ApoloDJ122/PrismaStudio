import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMarkup } from "./parse.ts";
import {
  bodyOf,
  canvasContainerId,
  canvasNodes,
  displayLabel,
  isSimpleTextElement,
  isTechnicalTag,
  isVisualElement,
  isVisualNode,
  nodeText,
  visualChildren,
} from "./visual.ts";

const { deepEqual, equal, ok } = assert;

function roots(html: string) {
  return parseMarkup(html).roots;
}

describe("M2.2.1 separación visual/técnico", () => {
  it("marca como técnicas las etiquetas del documento, no las del diseño", () => {
    ok(isTechnicalTag("html"));
    ok(isTechnicalTag("head"));
    ok(isTechnicalTag("meta"));
    ok(isTechnicalTag("title"));
    ok(isTechnicalTag("link"));
    ok(isTechnicalTag("script"));
    ok(isTechnicalTag("style"));
    ok(!isTechnicalTag("div"));
    ok(!isTechnicalTag("section"));
    ok(!isTechnicalTag("button"));
    ok(!isTechnicalTag(null));
  });

  it("el lienzo de un documento completo son los hijos del body", () => {
    const doc = roots(
      "<html><head><meta><title>t</title><link></head><body><section><div></div></section></body></html>",
    );
    const nodes = canvasNodes(doc);
    equal(nodes.length, 1);
    equal(nodes[0]?.tag, "section");
    ok(nodes.every(isVisualElement));
  });

  it("el contenedor del lienzo es el body", () => {
    const doc = roots("<html><body><div></div></body></html>");
    const body = bodyOf(doc);
    ok(body !== null);
    equal(canvasContainerId(doc), body!.id);
  });

  it("un fragmento sin body se dibuja filtrado y sin contenedor", () => {
    const doc = roots("<div></div><script>x</script><p>hola</p>");
    const nodes = canvasNodes(doc);
    deepEqual(
      nodes.map((n) => n.tag),
      ["div", "p"],
    );
    equal(canvasContainerId(doc), null);
  });

  it("los textos con solo espacios no se dibujan", () => {
    const doc = roots("<body><div>\n    </div><p>hola</p></body>");
    const nodes = canvasNodes(doc);
    equal(nodes.length, 2);
    const div = nodes[0]!;
    equal(visualChildren(div).length, 0);
  });

  it("el contenido Blade se conserva como insignia", () => {
    const doc = roots("<body><div>{{ $titulo }}</div></body>");
    const div = canvasNodes(doc)[0]!;
    const badges = visualChildren(div).filter((n) => n.kind === "dynamic");
    equal(badges.length, 1);
    ok(isVisualNode(badges[0]!));
  });

  it("un documento vacío da un lienzo vacío", () => {
    deepEqual(canvasNodes([]), []);
    equal(canvasContainerId([]), null);
  });

  it("etiqueta lo técnico y lo visible para el árbol", () => {
    const doc = roots("<body><h1>Hola mundo</h1></body>");
    const h1 = canvasNodes(doc)[0]!;
    equal(displayLabel(h1), "h1");
    equal(nodeText(h1), "Hola mundo");
    ok(isSimpleTextElement(h1));
  });

  it("un elemento con hijos anidados no es texto simple", () => {
    const doc = roots("<body><div><p>x</p></div></body>");
    const div = canvasNodes(doc)[0]!;
    ok(!isSimpleTextElement(div));
  });
});
