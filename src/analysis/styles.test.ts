import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseStylesheet } from "../designer/css.ts";
import { flatten } from "../designer/tree.ts";
import type { PrismaNode } from "../designer/types.ts";
import { buildDocument } from "./document.ts";
import {
  associateStyles,
  buildStyleIndex,
  describeElement,
  emptyStyleIndex,
  linkedStyleModels,
  stylesFor,
} from "./styles.ts";
import type { FileType, FileModel, StylesheetModel } from "./types.ts";

const { deepEqual, equal } = assert;

const HTML = [
  "<html>",
  "  <body>",
  '    <a class="enlace" href="#arriba">Arriba</a>',
  '    <header class="hero" id="top">',
  '      <h1 class="titulo">Titulo</h1>',
  "    </header>",
  '    <p style="color: red; font-weight: bold">Texto</p>',
  "  </body>",
  "</html>",
  "",
].join("\n");

const CSS = [
  "body {",
  "  margin: 0;",
  "}",
  "",
  "h1 {",
  "  font-size: 3rem;",
  "}",
  "",
  ".hero {",
  "  padding: 2rem;",
  "}",
  "",
  ".hero h1 {",
  "  letter-spacing: -0.02em;",
  "}",
  "",
  ".titulo {",
  "  color: #111827;",
  "}",
  "",
  "a:hover {",
  "  text-decoration: underline;",
  "}",
  "",
  ".nada {",
  "  color: green;",
  "}",
  "",
].join("\n");

function file(relativePath: string, type: FileType): FileModel {
  const name = relativePath.slice(relativePath.lastIndexOf("/") + 1);

  return {
    path: `demo/${relativePath}`,
    relativePath,
    name,
    extension: name.split(".").pop() ?? "",
    type,
    size: 0,
  };
}

function setup() {
  const source = HTML.replace(
    "<body>",
    '<link rel="stylesheet" href="css/base.css" />\n  <body>',
  );
  const document = buildDocument(file("index.html", "html"), source);
  const stylesheet = parseStylesheet(CSS, "css/base.css");
  const stylesheets: StylesheetModel[] = [
    { file: file("css/base.css", "css"), stylesheet, ruleCount: stylesheet.rules.length },
  ];
  const index = buildStyleIndex(stylesheets);

  return { document, stylesheets, index };
}

function tag(document: ReturnType<typeof buildDocument>, name: string): PrismaNode {
  const node = flatten(document.root).find((item) => item.tag === name);

  if (node === undefined) {
    throw new Error(`Se esperaba un <${name}>`);
  }

  return node;
}

describe("M2.1.0 estilos de un elemento", () => {
  it("cuenta las reglas del conjunto y les pone peso", () => {
    const { index } = setup();

    equal(index.ruleCount, 7);
    equal(index.sheets.length, 1);

    const pesos = index.sheets[0]?.rules.map((rule) => index.order.get(rule));

    deepEqual(pesos, [0, 1, 2, 3, 4, 5, 6]);
  });

  it("solo mira las hojas que el documento enlaza", () => {
    const { document, stylesheets } = setup();
    const enlazadas = linkedStyleModels(document, stylesheets);

    equal(enlazadas.length, 1);
    equal(enlazadas[0]?.file.relativePath, "css/base.css");
  });

  it("no sigue hojas externas ni las que se repiten", () => {
    const source = [
      "<html>",
      '  <link rel="stylesheet" href="css/base.css" />',
      '  <link rel="stylesheet" href="css/base.css" />',
      '  <link rel="stylesheet" href="https://cdn.example.com/x.css" />',
      "  <body></body>",
      "</html>",
    ].join("\n");
    const document = buildDocument(file("index.html", "html"), source);
    const { stylesheets } = setup();

    equal(linkedStyleModels(document, stylesheets).length, 1);
  });

  it("devuelve las reglas de menor a mayor peso", () => {
    const { document, index } = setup();
    const h1 = stylesFor(index, document.root, tag(document, "h1"));

    deepEqual(
      h1.map((rule) => rule.selector),
      ["h1", ".titulo", ".hero h1"],
    );
    deepEqual(h1.map((rule) => rule.specificity), [
      { a: 0, b: 0, c: 1 },
      { a: 0, b: 1, c: 0 },
      { a: 0, b: 1, c: 1 },
    ]);
    deepEqual(h1.map((rule) => rule.order), [1, 4, 3]);
    equal(h1[0]?.sourceFile, "css/base.css");
    equal(h1[0]?.line, 5);
  });

  it("un elemento sin reglas no se rellena de nada", () => {
    const { document, index } = setup();

    deepEqual(stylesFor(index, document.root, tag(document, "p")), []);
  });

  it("marca como dinamica una regla con pseudo-clases", () => {
    const { document, index } = setup();
    const enlace = stylesFor(index, document.root, tag(document, "a"));

    equal(enlace.length, 1);
    equal(enlace[0]?.dynamic, true);
    equal(enlace[0]?.selector, "a:hover");
  });

  it("sin hojas enlazadas no hay estilos que aplicar", () => {
    const { document } = setup();
    const vacio = emptyStyleIndex();

    deepEqual(stylesFor(vacio, document.root, tag(document, "h1")), []);
    equal(vacio.ruleCount, 0);
  });

  it("describe un elemento con lo que trae el archivo", () => {
    const { document, index } = setup();
    const details = describeElement(document, tag(document, "h1"), index);

    equal(details.kind, "element");
    equal(details.tagName, "h1");
    equal(details.known, true);
    equal(details.elementId, null);
    deepEqual(details.classes, ["titulo"]);
    equal(details.textContent, "Titulo");
    deepEqual(details.attributes, [{ name: "class", value: "titulo" }]);
    equal(details.childCount, 1);
    equal(details.origin.path, "index.html");
    equal(details.source, '<h1 class="titulo">');
    deepEqual(details.inlineStyle, []);
    equal(details.styles.length, 3);
    deepEqual(details.warnings, []);
  });

  it("lee el atributo style del elemento", () => {
    const { document, index } = setup();
    const parrafo = describeElement(document, tag(document, "p"), index);

    deepEqual(
      parrafo.inlineStyle.map((declaration) => declaration.property),
      ["color", "font-weight"],
    );
    equal(parrafo.inlineStyle[0]?.value, "red");
  });

  it("recoge las advertencias que el documento asocio al elemento", () => {
    const source = "<html><body><mi-etiqueta>hola</mi-etiqueta></body></html>";
    const document = buildDocument(file("index.html", "html"), source);
    const details = describeElement(document, tag(document, "mi-etiqueta"), emptyStyleIndex());

    equal(details.known, false);
    equal(details.warnings.length, 1);
    equal(details.warnings[0]?.type, "unknown-element");
  });

  it("construye la vista inversa: de la regla a sus elementos", () => {
    const { document, stylesheets } = setup();
    const associations = associateStyles([document], stylesheets);

    // El orden es el de primera aparicion: cada regla se anota una sola vez.
    deepEqual(
      associations.map((item) => item.selector),
      ["body", "a:hover", ".hero", "h1", ".titulo", ".hero h1"],
    );

    const titulo = associations.find((item) => item.selector === ".titulo");
    equal(titulo?.sourceFile, "css/base.css");
    equal(titulo?.elementIds.length, 1);
    equal(titulo?.elementIds[0], tag(document, "h1").id);

    // Una regla que no alcanza a nadie no aparece inventada.
    equal(associations.some((item) => item.selector === ".nada"), false);
  });

  it("una misma regla que toca varios elementos los acumula", () => {
    const source = [
      "<html>",
      '  <link rel="stylesheet" href="css/base.css" />',
      "  <body>",
      "    <h1>Uno</h1>",
      "    <h1>Dos</h1>",
      "  </body>",
      "</html>",
    ].join("\n");
    const document = buildDocument(file("index.html", "html"), source);
    const stylesheet = parseStylesheet(CSS, "css/base.css");
    const stylesheets: StylesheetModel[] = [
      { file: file("css/base.css", "css"), stylesheet, ruleCount: stylesheet.rules.length },
    ];

    const associations = associateStyles([document], stylesheets);
    const h1 = associations.find((item) => item.selector === "h1");

    equal(h1?.elementIds.length, 2);
  });
});
