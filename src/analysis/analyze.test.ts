import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { serialize } from "../designer/tree.ts";
import { analyzeProject } from "./analyze.ts";
import type { AnalyzeProjectInput, ReadFailure } from "./analyze.ts";
import { buildFileModels } from "./scan.ts";
import type { ScannedFile } from "../types/project";

const { deepEqual, equal, match } = assert;

const PROJECT = new URL("../../fixtures/demo-project/", import.meta.url);

/** Archivos que tendria el escaneo de este proyecto. */
const RELATIVE_PATHS = [
  "index.html",
  "README.md",
  "resources/views/home.blade.php",
  "resources/views/components/alerta.blade.php",
  "resources/css/app.css",
  "resources/css/base.css",
  "public/js/app.js",
  "scripts/build.ts",
];

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, PROJECT), "utf8");
}

function scannedFiles(): ScannedFile[] {
  return RELATIVE_PATHS.map((relativePath) => {
    const name = relativePath.slice(relativePath.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    const content = read(relativePath);

    return {
      path: `demo/${relativePath}`,
      relativePath,
      name,
      extension: dot < 0 ? "" : name.slice(dot + 1),
      size: content.length,
    };
  });
}

interface Options {
  /** Rutas relativas cuyo contenido no se trae, como si la lectura fallara. */
  skip?: string[];
  readFailures?: ReadFailure[];
  scanWarnings?: string[];
  truncated?: boolean;
}

function analyze(options: Options = {}) {
  const skip = new Set(options.skip ?? []);
  const files = buildFileModels(scannedFiles());
  const contents: Record<string, string> = {};

  for (const file of files) {
    if (!skip.has(file.relativePath)) {
      contents[file.path] = read(file.relativePath);
    }
  }

  const input: AnalyzeProjectInput = {
    rootPath: "demo",
    name: "demo-project",
    files,
    contents,
    readFailures: options.readFailures ?? [],
    scanWarnings: options.scanWarnings ?? [],
    truncated: options.truncated ?? false,
  };

  return analyzeProject(input);
}

function document(model: ReturnType<typeof analyze>, relativePath: string) {
  const found = model.documents.find((item) => item.relativePath === relativePath);

  if (found === undefined) {
    throw new Error(`No se encontro el documento ${relativePath}`);
  }

  return found;
}

describe("M2.1.0 analisis de un proyecto", () => {
  it("lee el proyecto entero y lo reparte por tipo", () => {
    const model = analyze();

    deepEqual(model.analysis, {
      fileCount: 8,
      documentCount: 3,
      htmlCount: 1,
      bladeCount: 2,
      stylesheetCount: 2,
      scriptCount: 2,
      otherCount: 1,
      elementCount: 27,
      ruleCount: 12,
      warningCount: 6,
      unresolvedCount: 1,
    });
  });

  it("los archivos que no se analizan siguen en el modelo", () => {
    const model = analyze();

    equal(model.files.length, 8);
    equal(
      model.scripts.map((file) => file.relativePath).join(","),
      "public/js/app.js,scripts/build.ts",
    );
    equal(model.files.some((file) => file.relativePath === "README.md"), true);
    equal(model.name, "demo-project");
    equal(model.rootPath, "demo");
  });

  it("no cambia una sola letra de los archivos que lee", () => {
    const model = analyze();

    equal(serialize(document(model, "index.html").root), read("index.html"));
    equal(
      serialize(document(model, "resources/views/home.blade.php").root),
      read("resources/views/home.blade.php"),
    );
  });

  it("cada documento guarda su titulo, sus hojas y sus scripts", () => {
    const model = analyze();
    const html = document(model, "index.html");
    const blade = document(model, "resources/views/home.blade.php");

    equal(html.title, "Prisma demo");
    equal(html.type, "html");
    equal(html.elementCount, 19);
    equal(html.linkedStylesheets.length, 3);
    equal(html.linkedScripts.length, 2);

    equal(blade.title, null);
    equal(blade.type, "blade");
    equal(blade.linkedStylesheets.length, 1);
    equal(blade.linkedScripts.length, 0);
  });

  it("cada hoja de estilo se lee con su numero de reglas", () => {
    const model = analyze();

    deepEqual(
      model.stylesheets.map((sheet) => `${sheet.file.relativePath}:${sheet.ruleCount}`).sort(),
      ["resources/css/app.css:6", "resources/css/base.css:6"],
    );
  });

  it("resuelve las referencias contra lo que el proyecto tiene", () => {
    const model = analyze();
    const html = document(model, "index.html");
    const [local, externa, rota] = html.linkedStylesheets;

    equal(local?.resolvedPath, "resources/css/base.css");
    equal(local?.found, true);

    equal(externa?.external, true);
    equal(externa?.resolvedPath, null);

    equal(rota?.href, "css/missing.css");
    equal(rota?.resolvedPath, "css/missing.css");
    equal(rota?.found, false);

    equal(html.linkedScripts[0]?.resolvedPath, "public/js/app.js");
    equal(html.linkedScripts[0]?.found, true);
    equal(model.analysis.unresolvedCount, 1);
  });

  it("avisa de lo que no puede resolver sin parar el analisis", () => {
    const model = analyze();
    const avisos = model.warnings.filter((warning) => warning.type === "unresolved-reference");

    equal(avisos.length, 1);
    equal(avisos[0]?.file, "index.html");
    match(avisos[0]?.message ?? "", /css\/missing\.css/);
  });

  it("no se inventa un problema con lo que es normal", () => {
    const model = analyze();

    equal(model.warnings.some((warning) => warning.type === "parse-error"), false);
    equal(
      model.warnings.some((warning) => (warning.message ?? "").includes("cdn.example.com")),
      false,
    );
    equal(model.warnings.some((warning) => warning.message.includes("<!DOCTYPE")), false);
  });

  it("marca lo que no conoce y lo que es dinamico", () => {
    const model = analyze();
    const desconocidas = model.warnings.filter(
      (warning) => warning.type === "unknown-element",
    );
    const dinamicas = model.warnings.filter((warning) => warning.type === "dynamic-content");

    equal(desconocidas.length, 2);
    match(
      desconocidas.map((warning) => warning.message).join(" | "),
      /boton-fantasma/,
    );
    match(desconocidas.map((warning) => warning.message).join(" | "), /Componente Blade/);

    // Dos plantillas Blade con sintaxis dinamica y un HTML con script incrustado.
    equal(dinamicas.length, 3);
  });

  it("las advertencias llevan archivo, linea e identificador unico", () => {
    const model = analyze();
    const ids = model.warnings.map((warning) => warning.id);

    equal(new Set(ids).size, model.warnings.length);
    equal(ids.some((id) => id === ""), false);
    equal(model.warnings.every((warning) => warning.line >= 0), true);
    equal(
      model.warnings.every((warning) => warning.file !== null || warning.type === "scan"),
      true,
    );
    equal(model.analysis.warningCount, model.warnings.length);
  });

  it("un archivo que no se pudo leer queda en el modelo y se avisa", () => {
    const failure: ReadFailure = {
      path: "demo/index.html",
      relativePath: "index.html",
      message: "permisos denegados",
    };
    const model = analyze({ skip: ["index.html"], readFailures: [failure] });
    const html = document(model, "index.html");

    equal(model.analysis.documentCount, 3);
    equal(html.root.length, 0);
    equal(html.elementCount, 0);

    const [aviso] = model.warnings.filter((warning) => warning.type === "unreadable");
    equal(aviso?.file, "index.html");
    match(aviso?.message ?? "", /permisos denegados/);
  });

  it("no hace falta leer un script para saber que existe", () => {
    const model = analyze({ skip: ["public/js/app.js", "scripts/build.ts"] });

    equal(model.analysis.scriptCount, 2);
    equal(model.analysis.unresolvedCount, 1);
    equal(model.warnings.some((warning) => warning.type === "unreadable"), false);
  });

  it("los avisos del escaneo entran en el modelo", () => {
    const model = analyze({
      scanWarnings: ["No se pudo abrir la carpeta vendor"],
      truncated: true,
    });

    const avisos = model.warnings.filter((warning) => warning.type === "scan");

    equal(avisos.length, 2);
    equal(avisos[0]?.file, null);
    match(avisos[0]?.message ?? "", /vendor/);
    match(avisos[1]?.message ?? "", /mas archivos/);
  });

  it("el analisis se puede repetir sin que cambie nada", () => {
    const primera = analyze();
    const segunda = analyze();

    deepEqual(primera.analysis, segunda.analysis);
    deepEqual(
      primera.warnings.map((warning) => `${warning.type}:${warning.id}`),
      segunda.warnings.map((warning) => `${warning.type}:${warning.id}`),
    );
  });

  it("el modelo se puede serializar tal cual, sin perder nada", () => {
    // M2.2.0 va a consumir estos datos, y pueden tener que pasar por JSON.
    const model = analyze();

    deepEqual(JSON.parse(JSON.stringify(model)), model);
  });
});
