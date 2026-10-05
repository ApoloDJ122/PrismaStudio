import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProjectNode } from "../types/project.ts";
import { emptySession, type SessionState } from "../types/session.ts";
import {
  buildSessionState,
  externalChangeMessage,
  fixtures,
  nextActiveIndex,
  removeBuffersInside,
  rekeyBuffers,
  rekeyCursors,
  rekeyTabs,
  restoredActiveIndex,
  restorableTabs,
  tabsInside,
  withoutKey,
  type OpenTab,
} from "./state.ts";

const { buffer, tab } = fixtures;

const ROOT = "C:\\p";

function file(path: string, language: string | null = "html"): ProjectNode {
  const name = path.split("\\").pop() ?? path;
  return { name, path, kind: "file", language, children: [] };
}

function folder(path: string, children: ProjectNode[]): ProjectNode {
  return {
    name: path.split("\\").pop() ?? path,
    path,
    kind: "folder",
    language: null,
    children,
  };
}

/** Ruta que queda activa tras retirar `removed`, o `null` si no queda ninguna. */
function activePathAfter(tabs: OpenTab[], removed: string[], activeIndex: number): string | null {
  const next = nextActiveIndex(tabs, removed, activeIndex);
  const remaining = tabs.filter((item) => !removed.includes(item.path));

  return next < 0 ? null : (remaining[next]?.path ?? null);
}

describe("renombrado", () => {
  const before = {
    "C:\\p\\index.html": buffer("index.html", "<h1>a</h1>"),
    "C:\\p\\pages\\about.html": buffer("about.html", "<h1>b</h1>"),
  };

  it("renombra la carpeta y mueve los archivos que había dentro", () => {
    const after = rekeyBuffers(before, "C:\\p\\pages", "C:\\p\\paginas", "paginas");

    assert.deepEqual(Object.keys(after).sort(), ["C:\\p\\index.html", "C:\\p\\paginas\\about.html"]);
  });

  it("no cambia el nombre de los archivos que estaban dentro de la carpeta", () => {
    const after = rekeyBuffers(before, "C:\\p\\pages", "C:\\p\\paginas", "paginas");

    // about.html no se ha renombrado: sigue llamándose about.html.
    assert.equal(after["C:\\p\\paginas\\about.html"]?.name, "about.html");
  });

  it("cambia el nombre solo en el archivo renombrado", () => {
    const after = rekeyBuffers(before, "C:\\p\\index.html", "C:\\p\\inicio.html", "inicio.html");

    assert.equal(after["C:\\p\\inicio.html"]?.name, "inicio.html");
    assert.equal(after["C:\\p\\pages\\about.html"]?.name, "about.html");
  });

  it("mantiene el nombre correcto de las pestañas al renombrar una carpeta", () => {
    const tabs = [
      tab("C:\\p\\index.html", "index.html"),
      tab("C:\\p\\pages\\about.html", "about.html"),
    ];

    const after = rekeyTabs(tabs, "C:\\p\\pages", "C:\\p\\paginas", "paginas", "html");

    assert.equal(after[0]?.path, "C:\\p\\index.html");
    assert.equal(after[1]?.path, "C:\\p\\paginas\\about.html");
    // El nombre propio del archivo no cambia al renombrar su carpeta.
    assert.equal(after[1]?.name, "about.html");
  });

  it("actualiza el lenguaje de la pestaña cuando cambia la extensión", () => {
    const tabs = [tab("C:\\p\\a.html", "a.html", "html")];

    const after = rekeyTabs(tabs, "C:\\p\\a.html", "C:\\p\\a.txt", "a.txt", "plaintext");

    assert.equal(after[0]?.language, "plaintext");
  });

  it("mueve también la posición del cursor", () => {
    const after = rekeyCursors(
      { "C:\\p\\pages\\about.html": { line: 12, column: 3 } },
      "C:\\p\\pages",
      "C:\\p\\paginas",
    );

    assert.deepEqual(after["C:\\p\\paginas\\about.html"], { line: 12, column: 3 });
  });
});

describe("eliminación", () => {
  const tabs = [
    tab("C:\\p\\a.html", "a.html"),
    tab("C:\\p\\pages\\b.html", "b.html"),
    tab("C:\\p\\c.html", "c.html"),
  ];

  it("quita del búfer todo lo que había dentro de la carpeta eliminada", () => {
    const buffers = {
      "C:\\p\\a.html": buffer("a.html", "a"),
      "C:\\p\\pages\\b.html": buffer("b.html", "b"),
    };

    const after = removeBuffersInside(buffers, "C:\\p\\pages");

    assert.deepEqual(Object.keys(after), ["C:\\p\\a.html"]);
  });

  it("encuentra las pestañas que quedan dentro de una carpeta", () => {
    assert.equal(tabsInside(tabs, "C:\\p\\pages").length, 1);
    assert.equal(tabsInside(tabs, ROOT).length, 3);
    assert.equal(tabsInside(tabs, "C:\\p\\otro").length, 0);
  });

  it("conserva la pestaña activa si no es la que se elimina", () => {
    assert.equal(activePathAfter(tabs, ["C:\\p\\pages\\b.html"], 2), "C:\\p\\c.html");
  });

  it("desplaza la activa si se borra una pestaña anterior", () => {
    // Desaparece a.html, así que c.html pasa de la posición 2 a la 1.
    assert.equal(activePathAfter(tabs, ["C:\\p\\a.html"], 2), "C:\\p\\c.html");
    assert.equal(nextActiveIndex(tabs, ["C:\\p\\a.html"], 2), 1);
  });

  it("elige la pestaña siguiente si se elimina la activa", () => {
    assert.equal(activePathAfter(tabs, ["C:\\p\\pages\\b.html"], 1), "C:\\p\\c.html");
  });

  it("elige la pestaña anterior si se elimina la última activa", () => {
    assert.equal(activePathAfter(tabs, ["C:\\p\\c.html"], 2), "C:\\p\\pages\\b.html");
  });

  it("deja el editor vacío si no queda ninguna pestaña", () => {
    assert.equal(nextActiveIndex(tabs, ["C:\\p\\a.html", "C:\\p\\pages\\b.html", "C:\\p\\c.html"], 1), -1);
  });

  it("retira de una vez todas las pestañas de una carpeta con subcarpetas", () => {
    const many = [
      tab("C:\\p\\a.html", "a.html"),
      tab("C:\\p\\pages\\b.html", "b.html"),
      tab("C:\\p\\pages\\sub\\d.html", "d.html"),
      tab("C:\\p\\z.html", "z.html"),
    ];

    // a.html y z.html siguen existiendo: la activa era z.html.
    assert.equal(activePathAfter(many, ["C:\\p\\pages"], 3), "C:\\p\\z.html");
    assert.equal(activePathAfter(many, ["C:\\p\\pages"], 0), "C:\\p\\a.html");
  });
});

describe("cierre de pestaña", () => {
  it("quita el búfer y el cursor de la ruta cerrada", () => {
    const buffers = { "C:\\p\\a.html": buffer("a.html", "a") };

    assert.deepEqual(Object.keys(withoutKey(buffers, "C:\\p\\a.html")), []);
  });

  it("no crea un objeto nuevo si la ruta no estaba", () => {
    const buffers = { "C:\\p\\a.html": buffer("a.html", "a") };

    assert.equal(withoutKey(buffers, "C:\\p\\otra.html"), buffers);
  });

  it("recalcula la activa al cerrar una pestaña anterior", () => {
    const tabs = [tab("C:\\p\\a.html", "a.html"), tab("C:\\p\\b.html", "b.html")];

    assert.equal(activePathAfter(tabs, ["C:\\p\\a.html"], 1), "C:\\p\\b.html");
  });

  it("permite cerrar la última pestaña y deja el editor vacío", () => {
    const tabs = [tab("C:\\p\\a.html", "a.html")];

    assert.equal(activePathAfter(tabs, ["C:\\p\\a.html"], 0), null);
  });
});

describe("persistencia de sesión", () => {
  const tabs = [tab("C:\\p\\a.html", "a.html"), tab("C:\\p\\b.html", "b.html")];

  it("guarda proyecto, pestañas y archivo activo", () => {
    const state = buildSessionState(ROOT, tabs, "C:\\p\\b.html", {
      "C:\\p\\b.html": { line: 42, column: 7 },
    });

    assert.equal(state.lastProject, ROOT);
    assert.equal(state.activePath, "C:\\p\\b.html");
    assert.equal(state.openTabs.length, 2);
    assert.equal(state.openTabs[1]?.line, 42);
  });

  it("no guarda nunca el contenido de los archivos", () => {
    const state = buildSessionState(ROOT, tabs, null, {});

    assert.equal(JSON.stringify(state).includes("content"), false);
    assert.equal(state.openTabs[0]?.line, 0);
  });

  it("guarda la mínima información cuando no hay nada abierto", () => {
    const state = buildSessionState(ROOT, [], null, {});

    assert.deepEqual(state.openTabs, []);
    assert.equal(state.activePath, null);
    assert.equal(state.lastProject, ROOT);
  });
});

describe("recuperación de sesión", () => {
  const tree = folder(ROOT, [
    file("C:\\p\\a.html"),
    file("C:\\p\\b.css", "css"),
    file("C:\\p\\imagen.png", null),
    folder("C:\\p\\pages", [file("C:\\p\\pages\\c.html")]),
  ]);

  function sessionWith(paths: string[], activePath: string | null = null): SessionState {
    return {
      ...emptySession(),
      lastProject: ROOT,
      activePath,
      openTabs: paths.map((path) => ({ path, name: path.split("\\").pop() ?? path, line: 0 })),
    };
  }

  it("recupera las pestañas que siguen existiendo", () => {
    const tabs = restorableTabs(sessionWith(["C:\\p\\a.html", "C:\\p\\pages\\c.html"]), tree);

    assert.deepEqual(tabs.map((item) => item.path), ["C:\\p\\a.html", "C:\\p\\pages\\c.html"]);
  });

  it("descarta los archivos que ya no existen", () => {
    const tabs = restorableTabs(sessionWith(["C:\\p\\a.html", "C:\\p\\borrado.html"]), tree);

    assert.deepEqual(tabs.map((item) => item.path), ["C:\\p\\a.html"]);
  });

  it("descarta los archivos que el editor no puede abrir", () => {
    assert.deepEqual(restorableTabs(sessionWith(["C:\\p\\imagen.png"]), tree), []);
  });

  it("descarta un archivo que se convirtió en carpeta", () => {
    const ahoraEsCarpeta = folder(ROOT, [folder("C:\\p\\a.html", [])]);

    assert.deepEqual(restorableTabs(sessionWith(["C:\\p\\a.html"]), ahoraEsCarpeta), []);
  });

  it("recupera el archivo activo si sigue existiendo", () => {
    const session = sessionWith(["C:\\p\\a.html", "C:\\p\\b.css"], "C:\\p\\b.css");
    const tabs = restorableTabs(session, tree);

    assert.equal(restoredActiveIndex(tabs, session), 1);
  });

  it("activa el primero si el archivo activo ya no existe", () => {
    const session = sessionWith(["C:\\p\\a.html", "C:\\p\\b.css"], "C:\\p\\borrado.html");

    assert.equal(restoredActiveIndex(restorableTabs(session, tree), session), 0);
  });

  it("deja el editor vacío si no se recupera ninguna pestaña", () => {
    const session = sessionWith(["C:\\p\\borrado.html"]);

    assert.equal(restoredActiveIndex(restorableTabs(session, tree), session), -1);
  });

  it("no deja el editor bloqueado con una sesión vacía", () => {
    const empty = { ...emptySession(), lastProject: ROOT };

    assert.deepEqual(restorableTabs(empty, tree), []);
    assert.equal(restoredActiveIndex([], empty), -1);
  });
});

describe("cambios externos en un archivo", () => {
  const loaded = "<h1>Hola</h1>";

  it("deja guardar si el archivo sigue igual que en el disco", () => {
    // Es el caso normal, y no debe decir nada ni molestar.
    assert.equal(externalChangeMessage({ name: "index.html", loaded, onDisk: loaded }), null);
  });

  it("avisa si el archivo cambió en el disco desde que se abrió", () => {
    const message = externalChangeMessage({
      name: "index.html",
      loaded,
      onDisk: "<h1>Hola a todos</h1>",
    });

    assert.notEqual(message, null);
    // El mensaje tiene que decir qué archivo es y qué hacer al respecto.
    assert.match(message ?? "", /index\.html/);
    assert.match(message ?? "", /cambiado en el disco/);
    assert.match(message ?? "", /vuelve a abrir/);
  });

  it("avisa aunque el archivo se haya quedado vacío", () => {
    // Un archivo vaciado por fuera no es lo mismo que uno sin cambios.
    assert.notEqual(externalChangeMessage({ name: "a.js", loaded, onDisk: "" }), null);
  });

  it("avisa con archivos de contenido idéntico pero distinto relleno", () => {
    // Comparison byte a byte: un salto de línea final o un espacio bastan para
    // que lo que se guarda de verdad sea distinto de lo que había.
    assert.notEqual(externalChangeMessage({ name: "a.js", loaded: "a\n", onDisk: "a" }), null);
  });
});
