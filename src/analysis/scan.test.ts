import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_IGNORED_DIRS,
  buildFileModel,
  buildFileModels,
  fileTypeOf,
  groupFiles,
  readableFiles,
} from "./scan.ts";
import type { ScannedFile } from "../types/project.ts";
import type { FileModel } from "./types.ts";

const { deepEqual, equal } = assert;

function scanned(relativePath: string): ScannedFile {
  const name = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");

  return {
    path: `demo/${relativePath}`,
    relativePath,
    name,
    extension: dot < 0 ? "" : name.slice(dot + 1),
    size: relativePath.length,
  };
}

describe("M2.1.0 clasificacion de archivos del proyecto", () => {
  it("reparte cada archivo por el papel que juega", () => {
    equal(fileTypeOf("index.html"), "html");
    equal(fileTypeOf("pagina.HTM"), "html");
    equal(fileTypeOf("home.blade.php"), "blade");
    equal(fileTypeOf("css/app.css"), "css");
    equal(fileTypeOf("js/app.js"), "javascript");
    equal(fileTypeOf("js/vendor.mjs"), "javascript");
    equal(fileTypeOf("scripts/build.ts"), "typescript");
    equal(fileTypeOf("src/App.tsx"), "typescript");
    equal(fileTypeOf("README.md"), "other");
    equal(fileTypeOf("logo.png"), "other");
    equal(fileTypeOf("composer.json"), "other");
  });

  it("un Blade no se cuela con el resto de PHP", () => {
    // Su extension es `php`, pero su papel es de documento de plantilla.
    const model = buildFileModel(scanned("resources/views/home.blade.php"));

    equal(model.type, "blade");
    equal(model.extension, "php");
    equal(model.name, "home.blade.php");
  });

  it("conserva la ruta relativa y el tamano tal como los trae el escaneo", () => {
    const model = buildFileModel(scanned("resources/css/app.css"));

    deepEqual(model, {
      path: "demo/resources/css/app.css",
      relativePath: "resources/css/app.css",
      name: "app.css",
      extension: "css",
      type: "css",
      size: "resources/css/app.css".length,
    });
  });

  it("convierte la lista entera sin cambiar el orden", () => {
    const models = buildFileModels([
      scanned("zeta.html"),
      scanned("alfa.css"),
      scanned("medio.blade.php"),
    ]);

    deepEqual(
      models.map((model) => model.relativePath),
      ["zeta.html", "alfa.css", "medio.blade.php"],
    );
  });

  it("reparte los archivos en grupos", () => {
    const models = buildFileModels([
      scanned("index.html"),
      scanned("resources/views/home.blade.php"),
      scanned("resources/css/app.css"),
      scanned("public/js/app.js"),
      scanned("scripts/build.ts"),
      scanned("README.md"),
    ]);

    const groups = groupFiles(models);

    deepEqual(
      groups.documents.map((file) => file.relativePath),
      ["index.html", "resources/views/home.blade.php"],
    );
    deepEqual(
      groups.stylesheets.map((file) => file.relativePath),
      ["resources/css/app.css"],
    );
    deepEqual(
      groups.scripts.map((file) => file.relativePath),
      ["public/js/app.js", "scripts/build.ts"],
    );
    deepEqual(
      groups.other.map((file) => file.relativePath),
      ["README.md"],
    );
  });

  it("los grupos no dejan suelto ningun archivo", () => {
    const models = buildFileModels([
      scanned("index.html"),
      scanned("app.css"),
      scanned("app.js"),
      scanned("notas.txt"),
    ]);

    const groups = groupFiles(models);
    const total = groups.documents.length + groups.stylesheets.length + groups.scripts.length + groups.other.length;

    equal(total, models.length);
  });

  it("ignora por defecto las carpetas que no aportan al analisis", () => {
    deepEqual(DEFAULT_IGNORED_DIRS, ["node_modules", ".git", "target", "dist", "build", "vendor"]);
  });

  it("no se inventa informacion que el escaneo no trae", () => {
    const model = buildFileModel(scanned("index.html")) as FileModel;

    equal("content" in model, false);
    equal("tree" in model, false);
  });

  it("solo se leen los archivos que el analisis necesita", () => {
    const models = buildFileModels([
      scanned("index.html"),
      scanned("resources/views/home.blade.php"),
      scanned("resources/css/app.css"),
      scanned("public/js/app.js"),
      scanned("scripts/build.ts"),
      scanned("README.md"),
    ]);

    deepEqual(
      readableFiles(groupFiles(models)).map((file) => file.relativePath),
      ["index.html", "resources/views/home.blade.php", "resources/css/app.css"],
    );
  });
});
