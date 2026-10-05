import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyPath, isBladeFile, planProject } from "./classify.ts";

const { deepEqual, equal } = assert;

describe("M2.0.0 clasificacion de archivos", () => {
  it("reconoce el marcado por su extension", () => {
    equal(classifyPath("resources/views/index.html"), "markup");
    equal(classifyPath("resources/views/welcome.blade.php"), "markup");
  });

  it("reconoce las hojas de estilo", () => {
    equal(classifyPath("resources/css/app.css"), "style");
  });

  it("deja JavaScript fuera del modelo visual", () => {
    // Un `.js` no se dibuja: se clasifica aparte para no mezclarlo con el HTML.
    equal(classifyPath("resources/js/app.js"), "script");
    equal(classifyPath("app.ts"), "script");
    equal(classifyPath("app.jsx"), "script");
  });

  it("una extension desconocida no se inventa", () => {
    equal(classifyPath("notas.txt"), "other");
    equal(classifyPath("datos.json"), "other");
    equal(classifyPath("imagen.png"), "other");
  });

  it("el nombre de la carpeta no cambia el criterio", () => {
    // Lo que decide es la extension, no donde este el archivo.
    equal(classifyPath("app/javascript/main.html"), "markup");
  });

  it("distingue un archivo Blade de uno HTML normal", () => {
    equal(isBladeFile("welcome.blade.php"), true);
    equal(isBladeFile("index.html"), false);
  });
});

describe("M2.0.0 plan de un proyecto", () => {
  it("reparte los archivos de una vista entre marcado y estilo", () => {
    const plan = planProject([
      "resources/views/layout.blade.php",
      "resources/views/partials/nav.blade.php",
      "resources/css/app.css",
    ]);

    equal(plan.markup.length, 2);
    equal(plan.style.length, 1);
    // Nada de JavaScript entra en el modelo visual.
    deepEqual(plan.markup, [
      "resources/views/layout.blade.php",
      "resources/views/partials/nav.blade.php",
    ]);
  });

  it("un proyecto vacio no da error", () => {
    const plan = planProject([]);

    equal(plan.markup.length, 0);
    equal(plan.style.length, 0);
  });
});
