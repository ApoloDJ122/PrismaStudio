import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { flatten, serialize } from "../designer/tree.ts";
import { buildDocument, emptyDocument } from "./document.ts";
import type { FileType } from "./types.ts";

const { equal, match, ok } = assert;

/** Devuelve el valor o falla con una frase que se entienda. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`No se encontro ${what}`);
  }

  return value;
}

function file(relativePath: string, type: FileType) {
  const name = relativePath.slice(relativePath.lastIndexOf("/") + 1);

  return {
    path: `demo/${relativePath}`,
    relativePath,
    name,
    extension: name.includes(".") ? (name.split(".").pop() ?? "") : "",
    type,
    size: 0,
  };
}

describe("M2.1.0 documento analizado", () => {
  it("lee el titulo, los estilos, los scripts y los elementos", () => {
    const source = [
      "<!doctype html>",
      "<html>",
      "  <head>",
      "    <title>Prueba</title>",
      '    <link rel="stylesheet" href="css/app.css" />',
      '    <link rel="stylesheet" href="https://cdn.example.com/x.css" />',
      '    <script src="js/app.js"></script>',
      "  </head>",
      "  <body>",
      '    <p style="color: red">Hola</p>',
      "    <mi-etiqueta>etiqueta rara</mi-etiqueta>",
      "    <script>var a = 1;</script>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");

    const document = buildDocument(file("index.html", "html"), source);

    equal(document.title, "Prueba");
    equal(document.type, "html");
    equal(document.elementCount, 10);
    equal(document.inlineStyleCount, 1);
    equal(document.linkedStylesheets.length, 2);
    equal(document.linkedScripts.length, 2);
  });

  it("guarda las referencias tal como estan escritas", () => {
    const source = [
      "<html>",
      '  <link rel="stylesheet" href="css/app.css" />',
      '  <link rel="stylesheet" href="https://cdn.example.com/x.css" />',
      '  <link rel="stylesheet" href="../fuera/app.css" />',
      '  <script src="js/app.js"></script>',
      "  <body></body>",
      "</html>",
    ].join("\n");

    const document = buildDocument(file("index.html", "html"), source);
    const [local, externa, fuera] = document.linkedStylesheets;

    equal(local?.href, "css/app.css");
    equal(local?.resolvedPath, "css/app.css");
    equal(local?.external, false);
    equal(local?.found, false);

    equal(externa?.external, true);
    equal(externa?.resolvedPath, null);

    equal(fuera?.resolvedPath, null);
    equal(fuera?.external, false);

    equal(document.linkedScripts[0]?.src, "js/app.js");
    equal(document.linkedScripts[0]?.inline, false);
  });

  it("no pierde nada del archivo al construir el documento", () => {
    const source = [
      "<!doctype html>",
      "<html>",
      "  <body>",
      "    <p>Hola <strong>mundo</strong></p>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");

    const document = buildDocument(file("index.html", "html"), source);

    equal(serialize(document.root), source);
  });

  it("anota la etiqueta desconocida y la asocia a su elemento", () => {
    const source = "<html><body><mi-etiqueta>hola</mi-etiqueta></body></html>";
    const document = buildDocument(file("index.html", "html"), source);

    const etiqueta = must(
      flatten(document.root).find((node) => node.tag === "mi-etiqueta"),
      "la etiqueta desconocida",
    );

    const avisos = document.elementWarnings[etiqueta.id] ?? [];
    equal(avisos.length, 1);
    equal(avisos[0]?.type, "unknown-element");
    match(avisos[0]?.message ?? "", /mi-etiqueta/);
    equal(avisos[0]?.file, "index.html");
  });

  it("no confunde un doctype con un problema de lectura", () => {
    const document = buildDocument(
      file("index.html", "html"),
      "<!doctype html>\n<html><body></body></html>\n",
    );

    equal(document.warnings.length, 0);
  });

  it("distingue un script incrustado de uno referenciado", () => {
    const source = [
      "<html>",
      "  <body>",
      '    <script src="js/app.js"></script>',
      "    <script>var a = 1;</script>",
      "  </body>",
      "</html>",
    ].join("\n");

    const document = buildDocument(file("index.html", "html"), source);
    const avisos = document.warnings.filter((warning) => warning.type === "dynamic-content");

    equal(avisos.length, 1);
    equal(document.linkedScripts[1]?.inline, true);
    equal(document.linkedScripts[1]?.found, true);
  });

  it("avisa si un <link> no dice a donde apunta", () => {
    const document = buildDocument(
      file("index.html", "html"),
      '<html><head><link rel="stylesheet" /></head><body></body></html>',
    );

    const [aviso] = document.warnings;

    equal(aviso?.type, "unresolved-reference");
    match(aviso?.message ?? "", /stylesheet/);
  });

  it("una hoja de estilo incrustada se cuenta y se avisa una sola vez", () => {
    const source = [
      "<html>",
      "  <head>",
      "    <style>body { color: red; }</style>",
      "    <style>.otra { color: blue; }</style>",
      "  </head>",
      "  <body></body>",
      "</html>",
    ].join("\n");

    const document = buildDocument(file("index.html", "html"), source);

    equal(document.inlineStylesheets, 2);
    equal(document.warnings.filter((warning) => warning.type === "inline-styles").length, 2);
  });

  it("resume una plantilla Blade en un unico aviso", () => {
    const source = [
      "@extends('layouts.app')",
      "",
      "<h1 class=\"titulo\">{{ $titulo }}</h1>",
      "",
      "@if ($ok)",
      "  <p>Si</p>",
      "@endif",
      "",
    ].join("\n");

    const document = buildDocument(file("views/home.blade.php", "blade"), source);

    equal(document.type, "blade");
    equal(document.warnings.filter((warning) => warning.type === "dynamic-content").length, 1);

    const clases = flatten(document.root).map((node) => node.kind);
    ok(clases.includes("directive"));
    ok(clases.includes("dynamic"));
  });

  it("marca un componente Blade como tal, no como etiqueta rara", () => {
    const source = '<html><body><x-alerta tipo="info">Hola</x-alerta></body></html>';
    const document = buildDocument(file("views/home.blade.php", "blade"), source);
    const [componente] = flatten(document.root).filter((node) => node.tag === "x-alerta");

    equal(componente?.known, false);

    const [aviso] = document.warnings.filter((warning) => warning.type === "unknown-element");
    match(aviso?.message ?? "", /Componente Blade/);
  });

  it("limita las advertencias de un documento llenas de ruido", () => {
    const etiquetas = Array.from({ length: 50 }, (_, index) => `<zz>${index}</zz>`).join("");
    const document = buildDocument(
      file("index.html", "html"),
      `<html><body>${etiquetas}</body></html>`,
    );

    equal(document.warnings.length, 41);
    match(document.warnings[40]?.message ?? "", /10 advertencias/);
    equal(document.warnings[40]?.severity, "info");
  });

  it("un archivo que no se pudo leer deja un documento vacio", () => {
    const document = emptyDocument(file("views/roto.blade.php", "blade"));

    equal(document.root.length, 0);
    equal(document.elementCount, 0);
    equal(document.warnings.length, 0);
    equal(document.type, "blade");
    equal(document.id, "views/roto.blade.php");
  });
});
