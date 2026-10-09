import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyMove, deleteNode, ensureStylesheetLink, insertElement, linkedStylesheets, reorderNode, setNodeText } from "./edit.ts";
import { createIdFactory } from "./identity.ts";
import { parseMarkup } from "./parse.ts";
import { serialize } from "./tree.ts";

const { equal, ok } = assert;

function roots(html: string) {
  return parseMarkup(html).roots;
}

describe("M2.2.0 ediciones del diseñador", () => {
  it("inserta un elemento dentro de otro", () => {
    const doc = roots("<body><div id=\"main\"></div></body>");
    const factory = createIdFactory();
    const parent = doc[0]?.children[0];
    ok(parent !== undefined);
    const res = insertElement(doc, factory, "button", parent!.id);
    ok(res.ok);
    const html = serialize(doc);
    ok(html.includes("<button"));
    ok(html.includes("</button>"));
    ok(html.indexOf("<button") > html.indexOf("<div"));
  });

  it("inserta un elemento en la raiz cuando no hay padre", () => {
    const doc = roots("<body></body>");
    const factory = createIdFactory();
    const res = insertElement(doc, factory, "section", null);
    ok(res.ok);
    ok(serialize(doc).includes("<section"));
  });

  it("mueve un elemento de un padre a otro", () => {
    const doc = roots(
      '<body><div id="a"><span id="s">x</span></div><div id="b"></div></body>',
    );
    const span = doc[0]?.children[0]?.children[0];
    const divB = doc[0]?.children[1];
    ok(span !== undefined && divB !== undefined);
    const res = applyMove(doc, "", {
      nodeId: span!.id,
      parentId: divB!.id,
      box: { x: 10, y: 20 },
    });
    ok(res.ok);
    const html = serialize(doc);
    const spanPos = html.indexOf("<span");
    const bPos = html.indexOf('id="b"');
    ok(spanPos > bPos, "span should be inside #b");
  });

  it("reordena elementos hermanos", () => {
    const doc = roots("<body><p>1</p><p>2</p><p>3</p></body>");
    const ps = doc[0]?.children ?? [];
    const firstP = ps[0];
    ok(firstP !== undefined);
    const res = reorderNode(doc, firstP!.id, "down");
    ok(res.ok);
    const html = serialize(doc);
    ok(html.indexOf("<p>2</p>") < html.indexOf("<p>1</p>"));
  });

  it("no mueve un elemento a sí mismo", () => {
    const doc = roots("<body><div></div></body>");
    const res = applyMove(doc, "", {
      nodeId: "element-001",
      parentId: "element-001",
      box: { x: 0, y: 0 },
    });
    ok(!res.ok);
  });
});

describe("M2.2.1 eliminar y editar texto", () => {
  it("elimina un elemento con todo su contenido", () => {
    const doc = roots('<body><div><p id="x">hola</p></div><span>fuera</span></body>');
    const div = doc[0]?.children[0];
    ok(div !== undefined);
    const res = deleteNode(doc, div!.id);
    ok(res.ok);
    const html = serialize(doc);
    ok(!html.includes("<div>"));
    ok(!html.includes('id="x"'));
    ok(html.includes("<span>fuera</span>"));
  });

  it("no deja eliminar la estructura del documento", () => {
    const doc = roots("<html><body><div></div></body></html>");
    const body = doc[0]?.children.find((n) => n.tag === "body");
    ok(body !== undefined);
    ok(!deleteNode(doc, body!.id).ok);
  });

  it("cambia el texto de un elemento simple", () => {
    const doc = roots("<body><h1>Hola</h1></body>");
    const h1 = doc[0]?.children[0];
    ok(h1 !== undefined);
    const factory = createIdFactory();
    ok(setNodeText(doc, factory, h1!.id, "Adiós").ok);
    const html = serialize(doc);
    ok(html.includes("<h1>Adiós</h1>"));
  });

  it("vaciar el texto deja el elemento sin hijos", () => {
    const doc = roots("<body><button>Enviar</button></body>");
    const button = doc[0]?.children[0];
    ok(button !== undefined);
    const factory = createIdFactory();
    ok(setNodeText(doc, factory, button!.id, "").ok);
    equal(serialize(doc), "<body><button></button></body>");
  });

  it("sigue prohibiendo meter un elemento dentro de su descendiente", () => {
    const doc = roots("<body><div><button>x</button></div></body>");
    const div = doc[0]?.children[0];
    const button = div?.children[0];
    ok(div !== undefined && button !== undefined);
    const res = applyMove(doc, "", {
      nodeId: div!.id,
      parentId: button!.id,
      box: { x: 0, y: 0 },
    });
    ok(!res.ok);
    ok(serialize(doc).includes("<div><button>x</button></div>"));
  });

  it("crea el <link> una sola vez, también sin head", () => {
    const doc = roots("<body><div></div></body>");
    const factory = createIdFactory();
    ok(ensureStylesheetLink(doc, factory, "styles.css").ok);
    equal(linkedStylesheets(doc).length, 1);
    ok(ensureStylesheetLink(doc, factory, "styles.css").ok);
    equal(linkedStylesheets(doc).length, 1);
    ok(serialize(doc).includes('<link rel="stylesheet" href="styles.css">'));
  });

  it("no destruye contenido anidado al editar texto", () => {
    const doc = roots("<body><div><p>x</p></div></body>");
    const div = doc[0]?.children[0];
    ok(div !== undefined);
    const factory = createIdFactory();
    const res = setNodeText(doc, factory, div!.id, "hola");
    ok(!res.ok);
    ok(serialize(doc).includes("<p>x</p>"));
  });
});
