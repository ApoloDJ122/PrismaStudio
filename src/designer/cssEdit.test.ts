import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ensurePositionRelative, hasRule, readBox, readDeclaration, scopeCss, stripAtRules, writeBox, writeDeclaration } from "./cssEdit.ts";

const { deepEqual, equal, ok } = assert;

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("M2.2.0 ediciones de texto CSS", () => {
  it("crea la regla cuando no existe y se puede leer de vuelta", () => {
    const css = writeBox("", ".button-1", { x: 10, y: 20 });

    ok(css.includes(".button-1 {"));
    ok(css.includes("position: absolute;"));
    ok(css.includes("left: 10px;"));
    ok(css.includes("top: 20px;"));
    deepEqual(readBox(css, ".button-1"), { x: 10, y: 20 });
    ok(hasRule(css, ".button-1"));
  });

  it("anade la regla al final sin tocar las demas", () => {
    const base = "/* Prisma */\n.card { color: red; }\n";
    const css = writeBox(base, ".card-1", { x: 4, y: 8 });

    ok(css.startsWith("/* Prisma */\n.card { color: red; }"));
    ok(css.includes(".card-1 {"));
    deepEqual(readBox(css, ".card-1"), { x: 4, y: 8 });
  });

  it("actualiza la regla existente sin duplicarla ni borrar sus declaraciones", () => {
    const base = ".card-1 {\n  color: red;\n  background: blue;\n}\n";
    const css = writeBox(base, ".card-1", { x: 40, y: 50 });

    equal(count(css, ".card-1 {"), 1);
    ok(css.includes("color: red;"));
    ok(css.includes("background: blue;"));
    deepEqual(readBox(css, ".card-1"), { x: 40, y: 50 });
  });

  it("la segunda escritura no duplica la regla", () => {
    let css = writeBox("", ".div-1", { x: 1, y: 2 });
    css = writeBox(css, ".div-1", { x: 300, y: 40 });

    equal(count(css, ".div-1 {"), 1);
    deepEqual(readBox(css, ".div-1"), { x: 300, y: 40 });
    equal(count(css, "position: absolute;"), 1);
    equal(count(css, "left:"), 1);
    equal(count(css, "top:"), 1);
  });

  it("reescribe solo la propiedad indicada", () => {
    const base = ".a {\n  left: 1px;\n  top: 2px;\n  color: red;\n}";
    const css = writeBox(base, ".a", { x: 33, y: 44 });

    ok(css.includes("color: red;"));
    deepEqual(readBox(css, ".a"), { x: 33, y: 44 });
    equal(readDeclaration(css, ".a", "color"), "red");
    equal(readDeclaration(css, ".a", "position"), "absolute");
  });

  it("conserva un !important que ya traía la declaración", () => {
    const base = ".a { left: 1px !important; }";
    const css = writeBox(base, ".a", { x: 9, y: 9 });

    equal(readDeclaration(css, ".a", "left"), "9px !important");
    equal(count(css, ".a {"), 1);
  });

  it("no edita una regla con varios selectores compartidos", () => {
    const base = ".uno, .dos { color: red; }";
    const css = writeBox(base, ".uno", { x: 5, y: 6 });

    ok(css.includes(".uno, .dos { color: red; }"));
    equal(count(css, ".uno, .dos"), 1);
    equal(count(css, ".uno {"), 1);
    deepEqual(readBox(css, ".uno"), { x: 5, y: 6 });
  });

  it("aguantan comentarios con llaves dentro", () => {
    const base = "/* { tambien } */\n.a { color: red; }";
    const css = writeBox(base, ".a", { x: 7, y: 8 });

    ok(css.startsWith("/* { tambien } */"));
    deepEqual(readBox(css, ".a"), { x: 7, y: 8 });
    equal(count(css, ".a {"), 1);
  });

  it("lee una regla que esta despues de un @media sin tocarlo", () => {
    const base = "@media (max-width: 600px) { .a { color: blue; } }\n";
    const css = writeBox(base, ".a", { x: 1, y: 2 });

    ok(css.startsWith("@media (max-width: 600px) { .a { color: blue; } }"));
    equal(count(css, "color: blue;"), 1);
    deepEqual(readBox(css, ".a"), { x: 1, y: 2 });
  });

  it("acepta posiciones negativas y con decimales", () => {
    const css = writeBox("", ".a", { x: -12.5, y: 0.25 });

    deepEqual(readBox(css, ".a"), { x: -12.5, y: 0.25 });
  });

  it("devuelve null cuando no hay posicion legible", () => {
    equal(readBox("", ".a"), null);
    equal(readBox(".a { left: auto; top: 10px; }", ".a"), null);
    equal(readBox(".a { left: 10px; }", ".a"), null);
    equal(readDeclaration(".a { color: red; }", ".a", "left"), null);
  });

  it("anade position: relative cuando el padre no tiene regla", () => {
    const css = ensurePositionRelative("", ".padre-1");

    ok(css.includes(".padre-1 {"));
    ok(css.includes("position: relative;"));
    equal(count(css, ".padre-1 {"), 1);
  });

  it("anade position: relative a una regla que ya existia", () => {
    const base = ".padre-1 {\n  color: red;\n}";
    const css = ensurePositionRelative(base, ".padre-1");

    ok(css.includes("color: red;"));
    equal(readDeclaration(css, ".padre-1", "position"), "relative");
    equal(count(css, ".padre-1 {"), 1);
  });

  it("no cambia un padre que ya es contexto de posicionamiento", () => {
    const base = ".padre-1 { position: absolute; left: 0; top: 0; }";
    const css = ensurePositionRelative(base, ".padre-1");

    equal(css, base);
    equal(readDeclaration(css, ".padre-1", "position"), "absolute");
  });

  it("cambia un position: static escrito a mano", () => {
    const css = ensurePositionRelative(".padre-1 { position: static; }", ".padre-1");

    equal(readDeclaration(css, ".padre-1", "position"), "relative");
    equal(count(css, ".padre-1 {"), 1);
  });

  it("lee el cuerpo de una regla con dos puntos en valores", () => {
    const base = '.a { background: url("https://x/y.png"); color: red; }';
    const css = writeBox(base, ".a", { x: 3, y: 4 });

    ok(css.includes('background: url("https://x/y.png");'));
    deepEqual(readBox(css, ".a"), { x: 3, y: 4 });
  });
});

describe("M2.2.1 declaración genérica de CSS", () => {
  it("crea la regla cuando no existe", () => {
    const css = writeDeclaration("", ".div-1", "display", "flex");

    ok(css.includes(".div-1 {"));
    equal(readDeclaration(css, ".div-1", "display"), "flex");
  });

  it("actualiza sin tocar las demás declaraciones", () => {
    const base = ".a { color: red; margin: 0; }";
    const css = writeDeclaration(base, ".a", "color", "blue");

    equal(readDeclaration(css, ".a", "color"), "blue");
    equal(readDeclaration(css, ".a", "margin"), "0");
    equal(count(css, ".a {"), 1);
  });

  it("no toca una regla compartida: añade una propia", () => {
    const base = ".a, .b { color: red; }";
    const css = writeDeclaration(base, ".a", "color", "blue");

    ok(css.includes(".a, .b { color: red; }"));
    equal(readDeclaration(css, ".a", "color"), "blue");
  });
});

describe("M2.2.1 ámbito del CSS en el lienzo", () => {
  it("prefija los selectores con el ámbito del lienzo", () => {
    const css = scopeCss(".card { color: red; }\nbutton { margin: 0; }", ".ds-page");

    ok(css.includes(".ds-page .card {"));
    ok(css.includes(".ds-page button {"));
    ok(!css.includes("\nbutton {"));
  });

  it("absorbe body y html en el ámbito", () => {
    const css = scopeCss("body { color: red; }\nhtml body .x { margin: 0; }", ".ds-page");

    ok(css.includes(".ds-page {"));
    ok(css.includes(".ds-page .x {"));
  });

  it("reparte las listas de selectores", () => {
    const css = scopeCss(".a, .b { color: red; }", ".ds-page");

    ok(css.includes(".ds-page .a, .ds-page .b {"));
  });

  it("elimina los bloques @ sin tocar el resto", () => {
    const base = ".a { color: red; }\n@media (max-width: 600px) {\n  .a { color: blue; }\n}\n.b { margin: 0; }";
    const stripped = stripAtRules(base);

    ok(stripped.includes(".a { color: red; }"));
    ok(stripped.includes(".b { margin: 0; }"));
    ok(!stripped.includes("@media"));
    ok(!stripped.includes("color: blue"));
  });

  it("scopeCss no deja rastro de @media", () => {
    const base = ".a { color: red; }\n@media x {\n .a { color: blue; }\n}";
    const css = scopeCss(base, ".ds-page");

    ok(!css.includes("@media"));
    ok(css.includes(".ds-page .a {"));
  });
});
