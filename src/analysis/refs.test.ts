import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isExternalReference, resolveReference } from "./refs.ts";

const { equal, deepEqual } = assert;

describe("M2.1.0 referencias de documentos", () => {
  it("separa lo que es del proyecto de lo que no", () => {
    equal(isExternalReference("resources/css/app.css"), false);
    equal(isExternalReference("./app.css"), false);
    equal(isExternalReference("/app.css"), false);
    equal(isExternalReference("https://example.com/app.css"), true);
    equal(isExternalReference("//cdn.example.com/app.css"), true);
    equal(isExternalReference("data:text/css,body{}"), true);
    equal(isExternalReference("mailto:hola@example.com"), true);
    equal(isExternalReference("#contacto"), true);
    equal(isExternalReference(""), true);
    equal(isExternalReference("   "), true);
  });

  it("resuelve contra la carpeta del documento", () => {
    equal(
      resolveReference("resources/views/home.blade.php", "../../resources/css/app.css"),
      "resources/css/app.css",
    );
    equal(resolveReference("index.html", "resources/css/base.css"), "resources/css/base.css");
    equal(resolveReference("resources/views/home.blade.php", "./pagina.css"), "resources/views/pagina.css");
  });

  it("una ruta que empieza por barra es relativa a la raiz", () => {
    equal(resolveReference("resources/views/home.blade.php", "/css/app.css"), "css/app.css");
    equal(resolveReference("index.html", "/css/./app.css"), "css/app.css");
  });

  it("sube de carpeta sin salirse del proyecto", () => {
    equal(resolveReference("public/js/app.js", "../css/app.css"), "public/css/app.css");
    equal(resolveReference("a/b/c/index.html", "../../d/e.html"), "a/d/e.html");
  });

  it("devuelve null cuando la referencia se sale de la raiz", () => {
    equal(resolveReference("index.html", "../fuera.css"), null);
    equal(resolveReference("a/b.html", "../../../fuera.css"), null);
    equal(resolveReference("index.html", ""), null);
  });

  it("quita consultas y fragmentos antes de mirar el disco", () => {
    equal(resolveReference("index.html", "css/app.css?v=123#capa"), "css/app.css");
    equal(resolveReference("index.html", "#capa"), null);
    equal(resolveReference("index.html", "css/app.css#capa"), "css/app.css");
  });

  it("acepta barras invertidas como separador", () => {
    equal(resolveReference("index.html", "css\\app.css"), "css/app.css");
  });

  it("una referencia externa nunca se resuelve", () => {
    equal(resolveReference("index.html", "https://example.com/app.css"), null);
    equal(resolveReference("index.html", "  //example.com/app.css  "), null);
  });

  it("no se confunde con una unidad de disco", () => {
    equal(isExternalReference("C:\\Users\\app.css"), true);
    equal(resolveReference("index.html", "C:\\Users\\app.css"), null);
  });

  it("ordena las carpetas resueltas sin escalones de mas", () => {
    deepEqual(resolveReference("a/b/c.html", "../d/e.css")?.split("/"), ["a", "d", "e.css"]);
    deepEqual(resolveReference("a/b/c.html", "./d/../e/f.css")?.split("/"), ["a", "b", "e", "f.css"]);
  });
});
