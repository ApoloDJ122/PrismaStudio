import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createIdFactory, createIdFactoryFrom, isPrismaId } from "./identity.ts";
import { isComponentName, isKnownTag, isVoidTag } from "./html.ts";
import {
  ancestorsOf,
  appendChild,
  attributeValue,
  classList,
  createComment,
  createDirective,
  createDocument,
  createDynamic,
  createElement,
  createText,
  createUnknown,
  detach,
  findByHtmlId,
  findById,
  findByTag,
  flatten,
  htmlId,
  insertAt,
  orderOf,
  serialize,
  textContent,
  walk,
} from "./tree.ts";
import type { Attribute, PrismaNode } from "./types.ts";

const { deepEqual, equal, ok } = assert;

/** Atributo de prueba con el texto original ya escrito. */
function attr(name: string, value: string | null): Attribute {
  return { name, value, raw: value === null ? name : `${name}="${value}"` };
}

describe("M2.0.0 identidad interna", () => {
  it("genera identificadores con el formato element-001", () => {
    const factory = createIdFactory();

    equal(factory.next(), "element-001");
    equal(factory.next(), "element-002");
    equal(factory.next(), "element-003");
  });

  it("rellena con ceros y no se repite al pasar de 999", () => {
    const factory = createIdFactoryFrom(999);

    equal(factory.next(), "element-1000");
    equal(factory.next(), "element-1001");
  });

  it("distingue el identificador interno del id de HTML", () => {
    const factory = createIdFactory();
    const button = createElement(factory, "button", { attributes: [attr("id", "loginButton")] });

    // Son dos identificadores distintos y no se confunden.
    equal(button.id, "element-001");
    equal(htmlId(button), "loginButton");
    ok(button.id !== htmlId(button));
  });

  it("no toma el id de HTML como identificador interno", () => {
    // Un proyecto externo puede no tener ningun id, y aun asi cada elemento
    // necesita un identificador propio.
    const factory = createIdFactory();
    const first = createElement(factory, "div");
    const second = createElement(factory, "div");

    equal(first.id, "element-001");
    equal(second.id, "element-002");
    equal(htmlId(first), null);
  });

  it("reconoce la forma de un identificador propio", () => {
    equal(isPrismaId("element-001"), true);
    equal(isPrismaId("element-1000"), true);
    equal(isPrismaId("loginButton"), false);
    equal(isPrismaId("element-1"), false);
    equal(isPrismaId("element-abc"), false);
  });
});

describe("M2.0.0 creacion de elementos", () => {
  it("crea un elemento generico con su etiqueta", () => {
    const node = createElement(createIdFactory(), "div");

    equal(node.kind, "element");
    equal(node.tag, "div");
    equal(node.known, true);
    deepEqual(node.children, []);
    equal(node.parentId, null);
  });

  it("usa un mismo tipo para cualquier etiqueta HTML", () => {
    // No hay una clase por etiqueta: es lo que hace el sistema generico.
    const factory = createIdFactory();

    for (const tag of ["div", "section", "header", "footer", "main", "article", "h1", "h2", "h3"]) {
      const node = createElement(factory, tag);
      equal(node.tag, tag);
      equal(node.kind, "element");
    }
  });

  it("acepta las etiquetas de formulario y de lista", () => {
    const factory = createIdFactory();

    for (const tag of ["p", "span", "button", "input", "img", "a", "ul", "li"]) {
      equal(createElement(factory, tag).tag, tag);
    }
  });

  it("normaliza el nombre de la etiqueta a minusculas", () => {
    // `<DIV>` y `<div>` son la misma etiqueta para el modelo.
    equal(createElement(createIdFactory(), "DIV").tag, "div");
  });

  it("marca como no conocida una etiqueta que Prisma no reconoce", () => {
    const custom = createElement(createIdFactory(), "mi-componente");

    equal(custom.known, false);
    equal(custom.tag, "mi-componente");
  });

  it("sabe que etiquetas son conocidas y cuales no", () => {
    equal(isKnownTag("div"), true);
    equal(isKnownTag("h3"), true);
    equal(isKnownTag("mi-componente"), false);
    equal(isKnownTag("x-alerta"), false);
  });

  it("sabe que etiquetas no tienen contenido", () => {
    equal(isVoidTag("img"), true);
    equal(isVoidTag("input"), true);
    equal(isVoidTag("br"), true);
    equal(isVoidTag("div"), false);
  });

  it("reconoce el nombre de un componente Blade", () => {
    equal(isComponentName("x-alerta"), true);
    equal(isComponentName("x-panel:azul"), true);
    equal(isComponentName("div"), false);
    equal(isComponentName("mi-componente"), false);
  });
});

describe("M2.0.0 relaciones padre e hijo", () => {
  it("guarda la referencia al padre y guarda al hijo en su lista", () => {
    const factory = createIdFactory();
    const section = createElement(factory, "section");
    const div = appendChild(section, createElement(factory, "div"));

    equal(div.parentId, section.id);
    equal(section.children.length, 1);
    equal(section.children[0]?.id, div.id);
  });

  it("representa la jerarquia section > div > h1, p, button", () => {
    const factory = createIdFactory();
    const section = createElement(factory, "section");
    const div = appendChild(section, createElement(factory, "div"));
    const h1 = appendChild(div, createElement(factory, "h1"));
    const p = appendChild(div, createElement(factory, "p"));
    const button = appendChild(div, createElement(factory, "button"));

    // section > div > h1, p, button
    equal(section.children.length, 1);
    equal(div.children.length, 3);
    deepEqual(div.children.map((child) => child.tag), ["h1", "p", "button"]);
    equal(h1.parentId, div.id);
    equal(p.parentId, div.id);
    equal(button.parentId, div.id);
  });

  it("admite varios hijos en el mismo padre sin confusion", () => {
    const factory = createIdFactory();
    const ul = createElement(factory, "ul");
    const items = [1, 2, 3, 4].map(() => appendChild(ul, createElement(factory, "li")));

    equal(ul.children.length, 4);

    for (const item of items) {
      equal(item.parentId, ul.id);
    }

    deepEqual(new Set(ul.children.map((child) => child.id)).size, 4);
  });

  it("mantiene el orden de los hijos tal como se anaden", () => {
    const factory = createIdFactory();
    const nav = createElement(factory, "nav");

    for (const tag of ["ul", "ol", "form"]) {
      appendChild(nav, createElement(factory, tag));
    }

    deepEqual(nav.children.map((child) => child.tag), ["ul", "ol", "form"]);
  });

  it("inserta en una posicion concreta sin perder el orden del resto", () => {
    const factory = createIdFactory();
    const main = createElement(factory, "main");
    const first = appendChild(main, createElement(factory, "h1"));
    const last = appendChild(main, createElement(factory, "footer"));
    const middle = insertAt(main, createElement(factory, "p"), 1);

    deepEqual(main.children, [first, middle, last]);
  });

  it("encuentra un nodo por su identificador interno", () => {
    const factory = createIdFactory();
    const section = createElement(factory, "section");
    const button = appendChild(section, createElement(factory, "button"));
    const roots = [section];

    equal(findById(roots, button.id)?.id, button.id);
    equal(findById(roots, "element-999"), null);
  });

  it("devuelve los ancestros del mas lejano al mas cercano", () => {
    const factory = createIdFactory();
    const section = createElement(factory, "section");
    const div = appendChild(section, createElement(factory, "div"));
    const button = appendChild(div, createElement(factory, "button"));
    const roots = [section];

    deepEqual(ancestorsOf(roots, button).map((node) => node.tag), ["section", "div"]);
    deepEqual(ancestorsOf(roots, section), []);
  });

  it("sigue siendo utilizable con un elemento creado a mano y sin Archivos", () => {
    const document = createDocument(null);

    deepEqual(document.roots, []);
    equal(document.path, null);
  });

  it("recorre el arbol en profundidad y en orden de lectura", () => {
    const factory = createIdFactory();
    const section = createElement(factory, "section");
    const div = appendChild(section, createElement(factory, "div"));
    appendChild(section, createElement(factory, "footer"));
    appendChild(div, createElement(factory, "h1"));
    const roots = [section];
    const visited: string[] = [];

    walk(roots[0] as PrismaNode, (node) => visited.push(node.tag ?? node.kind));
    deepEqual(visited, ["section", "div", "h1", "footer"]);
  });

  it("devuelve una lista plana de todos los nodos", () => {
    const factory = createIdFactory();
    const section = createElement(factory, "section");
    appendChild(section, createElement(factory, "div"));
    appendChild(section, createElement(factory, "footer"));

    equal(flatten([section]).length, 3);
  });
});

describe("M2.0.0 orden dentro del padre", () => {
  it("el orden es la posicion entre los hermanos", () => {
    const factory = createIdFactory();
    const main = createElement(factory, "main");
    const a = appendChild(main, createElement(factory, "h1"));
    const b = appendChild(main, createElement(factory, "p"));
    const c = appendChild(main, createElement(factory, "footer"));
    const roots = [main];

    equal(orderOf(roots, a), 0);
    equal(orderOf(roots, b), 1);
    equal(orderOf(roots, c), 2);
  });

  it("las raices son hermanas entre si y tambien tienen orden", () => {
    const factory = createIdFactory();
    const first = createElement(factory, "div");
    const second = createElement(factory, "section");
    const roots = [first, second];

    equal(orderOf(roots, first), 0);
    equal(orderOf(roots, second), 1);
  });

  it("un nodo que no esta en el arbol no tiene orden", () => {
    const factory = createIdFactory();
    const roots = [createElement(factory, "div")];

    equal(orderOf(roots, createElement(factory, "p")), -1);
  });

  it("el orden se recalcula al quitar un hermano", () => {
    const factory = createIdFactory();
    const main = createElement(factory, "main");
    const a = appendChild(main, createElement(factory, "h1"));
    const b = appendChild(main, createElement(factory, "p"));
    const roots = [main];

    equal(orderOf(roots, b), 1);
    equal(detach(roots, a), true);
    // No queda un hueco: el hermano pasa a ser el primero.
    equal(orderOf(roots, b), 0);
    equal(main.children.length, 1);
  });

  it("indica cuando un nodo no estaba en el arbol", () => {
    const factory = createIdFactory();
    const main = createElement(factory, "main");
    const roots = [main];

    equal(detach(roots, createElement(factory, "p")), false);
  });

  it("quita un nodo de verdad, sin dejar referencias muertas", () => {
    const factory = createIdFactory();
    const main = createElement(factory, "main");
    const p = appendChild(main, createElement(factory, "p"));
    const roots = [main];

    detach(roots, p);
    equal(findById(roots, p.id), null);
    deepEqual(main.children, []);
  });

  it("quita una raiz del documento", () => {
    const factory = createIdFactory();
    const roots = [createElement(factory, "div"), createElement(factory, "section")];

    equal(detach(roots, roots[0] as PrismaNode), true);
    equal(roots.length, 1);
    equal(roots[0]?.tag, "section");
  });
});

describe("M2.0.0 atributos, clases y contenido", () => {
  it("guarda los atributos en el orden en que aparecen", () => {
    const node = createElement(createIdFactory(), "input", {
      attributes: [attr("type", "email"), attr("id", "correo"), attr("required", null)],
    });

    deepEqual(node.attributes.map((item) => item.name), ["type", "id", "required"]);
  });

  it("distingue un atributo con valor de uno sin valor", () => {
    const node = createElement(createIdFactory(), "input", {
      attributes: [attr("type", "email"), attr("required", null)],
    });

    equal(attributeValue(node, "type"), "email");
    equal(attributeValue(node, "required"), null);
    equal(attributeValue(node, "placeholder"), null);
  });

  it("busca los atributos sin distinguir mayusculas", () => {
    // HTML no distingue `CLASS` de `class`.
    const node = createElement(createIdFactory(), "div", {
      attributes: [{ name: "CLASS", value: "btn activo", raw: 'CLASS="btn activo"' }],
    });

    deepEqual(classList(node), ["btn", "activo"]);
  });

  it("separa las clases por espacios y descarta los sobrantes", () => {
    const node = createElement(createIdFactory(), "div", {
      attributes: [attr("class", "  btn   activo  ")],
    });

    deepEqual(classList(node), ["btn", "activo"]);
  });

  it("un elemento sin atributo class no tiene clases", () => {
    deepEqual(classList(createElement(createIdFactory(), "div")), []);
  });

  it("conserva el texto original de cada atributo", () => {
    // El texto original es lo que permite reconstruir el archivo sin reformatear
    // los atributos de un proyecto externo.
    const node = createElement(createIdFactory(), "div", {
      attributes: [{ name: "class", value: "btn", raw: "class = 'btn'" }],
    });

    equal(node.attributes[0]?.raw, "class = 'btn'");
    equal(node.attributes[0]?.value, "btn");
  });

  it("guarda el contenido de un nodo de texto", () => {
    equal(createText(createIdFactory(), "Hola").content, "Hola");
  });

  it("lee el texto de un elemento con sus hijos", () => {
    const factory = createIdFactory();
    const p = createElement(factory, "p");
    appendChild(p, createText(factory, "Hola "));
    appendChild(p, createDynamic(factory, "$usuario->nombre"));

    // El contenido dinamico cuenta como texto visible.
    equal(textContent(p), "Hola $usuario->nombre");
  });

  it("busca elementos por etiqueta y por id de HTML", () => {
    const factory = createIdFactory();
    const section = createElement(factory, "section");
    const button = appendChild(section, createElement(factory, "button", {
      attributes: [attr("id", "loginButton"), attr("class", "btn")],
    }));
    appendChild(section, createElement(factory, "button"));
    appendChild(section, createElement(factory, "p"));
    const roots = [section];

    equal(findByTag(roots, "button").length, 2);
    equal(findByTag(roots, "BUTTON").length, 2);
    equal(findByHtmlId(roots, "loginButton")?.id, button.id);
    equal(findByHtmlId(roots, "noExiste"), null);
  });
});

describe("M2.0.0 origen en el archivo", () => {
  it("un nodo creado a mano sabe que no tiene archivo de origen", () => {
    const node = createElement(createIdFactory(), "div");

    equal(node.origin.path, null);
    equal(node.origin.line, 0);
  });

  it("el lector anota el archivo y la linea de origen", () => {
    // La linea se rellena en parse.ts; aqui se comprueba que el modelo la admite.
    const node = createElement(createIdFactory(), "div", {
      origin: { path: "index.html", line: 12 },
    });

    equal(node.origin.path, "index.html");
    equal(node.origin.line, 12);
  });
});

describe("M2.0.0 Blade en el modelo", () => {
  it("guarda el contenido dinamico con su expresion", () => {
    const node = createDynamic(createIdFactory(), "$usuario->nombre");

    equal(node.kind, "dynamic");
    equal(node.content, "$usuario->nombre");
    equal(node.blade?.form, "echo");
    equal(node.blade?.value, "$usuario->nombre");
  });

  it("guarda una estructura Blade con su nombre y su tipo de bloque", () => {
    const open = createDirective(createIdFactory(), "if", "open", "$usuario->activo");
    const close = createDirective(createIdFactory(), "endif", "close");
    const alone = createDirective(createIdFactory(), "csrf", "self");

    equal(open.kind, "directive");
    equal(open.blade?.form, "directive");
    equal(open.blade?.value, "if");
    equal(open.blade?.block, "open");
    equal(open.content, "$usuario->activo");
    equal(close.blade?.block, "close");
    equal(alone.blade?.block, "self");
  });

  it("no pone el texto de la expresion si la directiva no lleva", () => {
    equal(createDirective(createIdFactory(), "endif", "close").content, "");
  });

  it("distingue un comentario de HTML de uno de Blade", () => {
    const html = createComment(createIdFactory(), " seccion ");
    const blade = createComment(createIdFactory(), " seccion ", "blade");

    equal(html.kind, "comment");
    equal(html.blade, null);
    equal(html.content, " seccion ");
    equal(blade.blade?.form, "comment");
  });

  it("un elemento de HTML normal no lleva informacion Blade", () => {
    equal(createElement(createIdFactory(), "div").blade, null);
  });
});

describe("M2.0.0 elementos desconocidos", () => {
  it("un nodo desconocido conserva su texto y no se pierde", () => {
    const node = createUnknown(createIdFactory(), "<<raro>>");

    equal(node.kind, "unknown");
    equal(node.known, false);
    equal(node.source, "<<raro>>");
  });

  it("un elemento desconocido conserva su contenido y se puede anidar", () => {
    const factory = createIdFactory();
    const custom = createElement(factory, "mi-componente");
    const inside = appendChild(custom, createElement(factory, "p"));

    // No se conoce la etiqueta, pero sus hijos se conservan igual.
    equal(custom.known, false);
    equal(custom.children.length, 1);
    equal(inside.parentId, custom.id);
  });

  it("un elemento desconocido no inventa un cierre", () => {
    // Cerrarlo automaticamente seria inventar contenido que no existe.
    equal(createElement(createIdFactory(), "mi-componente", { closingSource: null }).closingSource, null);
  });
});

describe("M2.0.0 reconstruccion del archivo", () => {
  it("reconstruye un arbol creado a mano", () => {
    const factory = createIdFactory();
    const div = createElement(factory, "div", { source: "<div>" });
    appendChild(div, createText(factory, "Hola", { source: "Hola" }));

    equal(serialize([div]), "<div>Hola</div>");
  });

  it("respeta un cierre explicito distinto del habitual", () => {
    const node = createElement(createIdFactory(), "div", {
      source: "<div>",
      closingSource: "</DIV >",
    });

    equal(serialize([node]), "<div></DIV >");
  });
});
