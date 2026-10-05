import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMarkup } from "./parse.ts";
import { createIdFactory } from "./identity.ts";
import {
  ancestorsOf,
  appendChild,
  classList,
  createElement,
  findByHtmlId,
  findByTag,
  flatten,
  htmlId,
  serialize,
  textContent,
} from "./tree.ts";
import type { NodeKind, PrismaNode } from "./types.ts";

const { deepEqual, equal, ok } = assert;

/** Primer nodo de un tipo dado, para las comprobaciones cortas. */
function first(document: { roots: PrismaNode[] }, kind: NodeKind): PrismaNode | null {
  return flatten(document.roots).find((node) => node.kind === kind) ?? null;
}

/** Todos los nodos de un tipo dado. */
function all(document: { roots: PrismaNode[] }, kind: NodeKind): PrismaNode[] {
  return flatten(document.roots).filter((node) => node.kind === kind);
}

/** Solo los hijos que son elementos, sin contar los espacios entre ellos. */
function elementsOf(node: PrismaNode): PrismaNode[] {
  return node.children.filter((child) => child.kind === "element");
}

describe("M2.0.0 lectura de HTML", () => {
  it("reconoce un documento completo con su jerarquia", () => {
    const document = parseMarkup(
      ["<section>", '<div class="caja">', "<h1>Titulo</h1>", "<p>Texto</p>", "</div>", "</section>"].join(
        "\n",
      ),
      "index.html",
    );

    const section = first(document, "element");
    equal(section?.tag, "section");
    equal(section?.known, true);
    equal(elementsOf(section as PrismaNode).length, 1);
    // Los saltos de linea son hijos de verdad: sin ellos el archivo no se
    // podria reconstruir igual.
    equal(section?.children.length, 3);
    equal(document.path, "index.html");
  });

  it("situa los hijos en el orden en que aparecen", () => {
    const document = parseMarkup("<main><header></header><h1></h1><footer></footer></main>");

    deepEqual(
      findByTag(document.roots, "main")[0]?.children.map((child) => child.tag),
      ["header", "h1", "footer"],
    );
  });

  it("admite varios hijos del mismo padre", () => {
    const document = parseMarkup("<ul><li>a</li><li>b</li><li>c</li></ul>");

    equal(findByTag(document.roots, "li").length, 3);
  });

  it("anida mas de un nivel", () => {
    const document = parseMarkup(
      "<section><div><article><h2></h2></article></div></section>",
    );
    const h2 = findByTag(document.roots, "h2")[0];

    deepEqual(ancestorsOf(document.roots, h2 as PrismaNode).map((node) => node.tag), [
      "section",
      "div",
      "article",
    ]);
  });

  it("lee el id de HTML y las clases de un elemento", () => {
    const document = parseMarkup('<button id="loginButton" class="btn btn-primario">Entrar</button>');
    const button = findByTag(document.roots, "button")[0];

    equal(htmlId(button as PrismaNode), "loginButton");
    deepEqual(classList(button as PrismaNode), ["btn", "btn-primario"]);
    equal(findByHtmlId(document.roots, "loginButton")?.tag, "button");
  });

  it("da un identificador interno propio a cada elemento", () => {
    const document = parseMarkup(
      '<button id="loginButton">Entrar</button><button>Salir</button>',
    );
    const [first1, second] = findByTag(document.roots, "button");

    // El id interno no se confunde con el de HTML, aunque solo uno lo tenga.
    equal(first1?.id, "element-001");
    // El texto entre los dos botones tambien es un nodo, y ocupa su identificador.
    equal(second?.id, "element-003");
    equal(htmlId(second as PrismaNode), null);
  });

  it("guarda los atributos con su valor y su texto original", () => {
    const document = parseMarkup("<input type = 'email' name=correo required>");
    const input = findByTag(document.roots, "input")[0];
    const names = input?.attributes.map((item) => item.name) ?? [];

    deepEqual(names, ["type", "name", "required"]);
    equal(input?.attributes[0]?.value, "email");
    equal(input?.attributes[0]?.raw, "type = 'email'");
    equal(input?.attributes[2]?.value, null);
  });

  it("guarda el contenido de un elemento", () => {
    const document = parseMarkup("<h1>Hola mundo</h1>");
    const h1 = findByTag(document.roots, "h1")[0];

    equal(textContent(h1 as PrismaNode), "Hola mundo");
    equal(first(document, "text")?.content, "Hola mundo");
  });

  it("no inventa hijos en las etiquetas que no los tienen", () => {
    const document = parseMarkup("<p>Hola<br><img src='a.png'><input></p>");
    const br = findByTag(document.roots, "br")[0];

    // Un `<br>` no puede tener contenido, aunque le venga un cierre despues.
    equal(br?.children.length, 0);
    equal(br?.closingSource, null);
    equal(findByTag(document.roots, "img")[0]?.children.length, 0);
    equal(findByTag(document.roots, "input")[0]?.children.length, 0);
  });

  it("no se pierde un cierre que sobra", () => {
    // No hay etiqueta abierta que cerrar: se conserva como nodo desconocido en
    // lugar de inventarse nada.
    const document = parseMarkup("<div></div></p>");
    const unknown = all(document, "unknown");

    equal(unknown.length, 1);
    equal(unknown[0]?.source, "</p>");
  });

  it("anota la linea de origen de cada elemento", () => {
    const document = parseMarkup("<div>\n  <p>Hola</p>\n</div>");
    const p = findByTag(document.roots, "p")[0];

    equal(p?.origin.line, 2);
    equal(p?.origin.path, null);
  });

  it("distingue un comentario de un elemento", () => {
    const document = parseMarkup("<div><!-- nota --><p></p></div>");
    const comment = first(document, "comment");

    equal(comment?.kind, "comment");
    equal(comment?.content, " nota ");
    equal(comment?.blade, null);
  });

  it("conserva el doctype sin intentar interpretarlo", () => {
    const document = parseMarkup("<!DOCTYPE html>\n<html><body></body></html>");
    const unknown = all(document, "unknown");

    equal(unknown[0]?.source, "<!DOCTYPE html>");
  });

  it("acepta atributos sin comillas, como hace HTML", () => {
    const document = parseMarkup("<div class=caja></div>");

    equal(findByTag(document.roots, "div")[0]?.attributes[0]?.value, "caja");
  });

  it("no confunde un menor que con una etiqueta", () => {
    const document = parseMarkup("<p>Si 5 < 6, mal</p>");
    const p = findByTag(document.roots, "p")[0];

    // El "<" sueltito se queda dentro del texto, que es lo que haria un navegador.
    equal(textContent(p as PrismaNode), "Si 5 < 6, mal");
  });
});

describe("M2.0.0 lectura de Blade", () => {
  it("distingue el contenido dinamico de un elemento HTML", () => {
    const document = parseMarkup("<h1>{{ $usuario->nombre }}</h1>");
    const dynamic = first(document, "dynamic");

    equal(dynamic?.kind, "dynamic");
    equal(dynamic?.content, "$usuario->nombre");
    equal(dynamic?.blade?.form, "echo");
    equal(dynamic?.source, "{{ $usuario->nombre }}");
  });

  it("acepta contenido dinamico con llaves triples", () => {
    const document = parseMarkup("{{{ $html }}}");

    equal(first(document, "dynamic")?.content, "$html");
  });

  it("coloca el contenido dinamico donde toca", () => {
    const document = parseMarkup("<p>Hola {{ $nombre }}</p>");

    deepEqual(findByTag(document.roots, "p")[0]?.children.map((child) => child.kind), [
      "text",
      "dynamic",
    ]);
  });

  it("distingue una estructura Blade de un elemento HTML", () => {
    const document = parseMarkup("@if ($visible)<p></p>@endif");
    const directive = first(document, "directive");

    equal(directive?.kind, "directive");
    equal(directive?.tag, null);
    equal(directive?.blade?.form, "directive");
    equal(directive?.blade?.value, "if");
    equal(directive?.content, "$visible");
  });

  it("empareja @if con su @endif y mete el contenido dentro", () => {
    // El `<p>` va dentro del bloque, no suelto en la raiz.
    const document = parseMarkup("@if ($visible)<p>Hola</p>@endif");
    const directive = first(document, "directive");

    equal(directive?.blade?.block, "open");
    equal(directive?.children.length, 1);
    equal(directive?.children[0]?.tag, "p");
    // El `@endif` cierra su bloque igual que `</div>` cierra su elemento: se
    // guarda en el bloque y no se cuela entre sus hijos.
    equal(directive?.closingSource, "@endif");
    deepEqual(document.roots.map((node) => node.id), ["element-001"]);
  });

  it("anida bloques Blade sin perderlos", () => {
    const document = parseMarkup(
      "@foreach ($u in $usuarios)@if ($u->activo)<p>{{ $u->nombre }}</p>@endif@endforeach",
    );
    const foreachNode = first(document, "directive");

    equal(foreachNode?.blade?.value, "foreach");
    equal(foreachNode?.children.length, 1);
    equal(foreachNode?.children[0]?.blade?.value, "if");
    equal(foreachNode?.children[0]?.children.length, 1);
    // Cada bloque guarda su propio cierre, del mismo modo que cada elemento.
    equal(foreachNode?.closingSource, "@endforeach");
    equal(foreachNode?.children[0]?.closingSource, "@endif");
  });

  it("reconoce una estructura Blade que no abre bloque", () => {
    const document = parseMarkup("@csrf\n@include('parcial')");
    const directives = all(document, "directive");

    equal(directives.length, 2);
    equal(directives[0]?.blade?.value, "csrf");
    equal(directives[0]?.blade?.block, "self");
    equal(directives[1]?.content, "'parcial'");
  });

  it("reconoce un componente Blade y lo separa de un elemento HTML", () => {
    const document = parseMarkup("<div><x-alerta tipo='error'>Cuidado</x-alerta></div>");
    const component = first(document, "element");

    equal(component?.tag, "div");
    equal(component?.children[0]?.tag, "x-alerta");
    // Es un elemento, no una estructura Blade, y lleva su informacion Blade.
    equal(component?.children[0]?.kind, "element");
    equal(component?.children[0]?.blade?.form, "component");
    equal(component?.children[0]?.known, false);
  });

  it("reconoce un comentario de Blade", () => {
    const document = parseMarkup("{{-- nota del servidor --}}");
    const comment = first(document, "comment");

    equal(comment?.blade?.form, "comment");
    equal(comment?.source, "{{-- nota del servidor --}}");
  });

  it("conserva un cierre Blade sin apertura", () => {
    // No se inventa el bloque que falta: se conserva el texto donde estaba.
    const document = parseMarkup("<div>@endif</div>");
    const directive = first(document, "directive");

    equal(directive?.parentId, findByTag(document.roots, "div")[0]?.id);
    equal(directive?.children.length, 0);
  });

  it("no confunde una arroba de un texto con una directiva", () => {
    // Un correo electronico no es una directiva Blade.
    const document = parseMarkup("<a href='#'>Escribe a hola@ejemplo.com</a>");
    const a = findByTag(document.roots, "a")[0];

    equal(all(document, "directive").length, 0);
    equal(textContent(a as PrismaNode), "Escribe a hola@ejemplo.com");
  });

  it("lee la expresion entera de una directiva con parentesis", () => {
    // Los parentesis se cuentan: `@if($a[0] > 1)` no se parte por el primero.
    const document = parseMarkup("@if ($a[0] > 1)<p></p>@endif");

    equal(first(document, "directive")?.content, "$a[0] > 1");
  });
});

describe("M2.0.0 elementos desconocidos se conservan", () => {
  it("conserva una etiqueta que Prisma no conoce con sus hijos", () => {
    const document = parseMarkup(
      "<mi-componente><h1>Titulo</h1><p>Texto</p></mi-componente>",
    );
    const custom = first(document, "element");

    equal(custom?.tag, "mi-componente");
    equal(custom?.known, false);
    // Sus hijos se leen igual, que es lo que permite entender la pagina.
    equal(custom?.children.length, 2);
    equal(findByTag(document.roots, "h1").length, 1);
  });

  it("conserva los atributos de una etiqueta desconocida", () => {
    const document = parseMarkup("<mi-componente data-x='1' clase='propia'></mi-componente>");
    const custom = first(document, "element");
    const names = custom?.attributes.map((item) => item.name) ?? [];

    deepEqual(names, ["data-x", "clase"]);
  });

  it("conserva un elemento mal formado sin borrarlo", () => {
    // Sin cierre: se conserva entero. No se le inventa un `</mi-componente>`.
    const document = parseMarkup("<mi-componente><p>Hola</p>");
    const custom = first(document, "element");

    equal(custom?.tag, "mi-componente");
    equal(custom?.closingSource, null);
    equal(custom?.children.length, 1);
  });

  it("cierra solo los elementos abiertos de verdad, sin romper el arbol", () => {
    // Un HTML mal formado no puede descuadrar el resto del documento.
    const document = parseMarkup("<div><section><p>Hola</p></div><footer>Despues</footer>");

    equal(findByTag(document.roots, "p").length, 1);
    equal(findByTag(document.roots, "footer").length, 1);
  });
});

describe("M2.0.0 JavaScript se queda fuera", () => {
  it("no convierte el contenido de un script en elementos", () => {
    const document = parseMarkup(
      "<div><script>const boton = document.querySelector('.btn');</script></div>",
    );
    const script = findByTag(document.roots, "script")[0];

    // El contenido se conserva entero, pero no se ha interpretado.
    equal(script?.children.length, 0);
    // Solo el `<div>` y el propio `<script>`: nada del codigo es un elemento.
    equal(all(document, "element").length, 2);
  });

  it("no encuentra dentro del script un elemento que parece una etiqueta", () => {
    const document = parseMarkup("<script>var x = '<div>no soy real</div>';</script>");

    // Sin esto, un string de JavaScript se dibujaria como si fuera la pagina.
    equal(findByTag(document.roots, "div").length, 0);
  });

  it("no interpreta el contenido de un style", () => {
    const document = parseMarkup("<style>.a { color: red }</style><div></div>");

    equal(findByTag(document.roots, "style")[0]?.children.length, 0);
    equal(findByTag(document.roots, "div").length, 1);
  });

  it("el script sigue en su sitio dentro del documento", () => {
    const document = parseMarkup(
      "<html><head><script src='app.js'></script></head><body><p>Hola</p></body></html>",
    );
    const body = findByTag(document.roots, "body")[0];

    equal(body?.parentId, findByTag(document.roots, "html")[0]?.id);
    equal(body?.children.length, 1);
    equal(findByTag(document.roots, "script")[0]?.parentId, findByTag(document.roots, "head")[0]?.id);
  });
});

describe("M2.0.0 el modelo no pierde nada", () => {
  const samples: [string, string][] = [
    ["pagina completa", "<!DOCTYPE html>\n<html lang='es'>\n  <head>\n    <title>Prueba</title>\n  </head>\n  <body>\n    <h1>Hola</h1>\n  </body>\n</html>\n"],
    ["blade con bloques", "@if ($a)\n  <p>{{ $a }}</p>\n@else\n  <p>No</p>\n@endif\n"],
    ["componentes y directivas", "<x-layout title='Prueba'>\n  @include('parcial')\n  <x-alerta />\n</x-layout>\n"],
    ["script y estilos", "<link rel='stylesheet' href='a.css'>\n<script>var a = 1 < 2;</script>\n<div class='a b'>x</div>\n"],
    ["etiquetas desconocidas", "<mi-componente><dato valor='1' /></mi-componente>\n"],
    ["vacios y espacios", "   \n\n  <div>   </div>\n   \n"],
    ["sin cerrar", "<div><p>Hola"],
    ["sin abrir", "</div><p>Hola</p>"],
    ["solo texto", "Solo texto, sin etiquetas.\n"],
    ["vacio", ""],
  ];

  for (const [name, text] of samples) {
    it(`reconstruye sin cambios: ${name}`, () => {
      // La garantia de que el modelo es solo una representacion: el archivo real
      // se puede volver a escribir exactamente igual.
      equal(serialize(parseMarkup(text).roots), text);
    });
  }

  it("mantiene el texto original de cada elemento con sus atributos", () => {
    const document = parseMarkup("<div  class = 'a'   id=b >texto</div>");

    equal(findByTag(document.roots, "div")[0]?.source, "<div  class = 'a'   id=b >");
  });

  it("un documento leido dos veces da los mismos identificadores", () => {
    // La identidad es estable: permite reconocer un elemento entre dos analisis.
    const text = "<div><p>a</p><p>b</p></div>";
    const one = parseMarkup(text);
    const other = parseMarkup(text);

    deepEqual(findByTag(one.roots, "p").map((node) => node.id), [
      "element-002",
      "element-004",
    ]);
    deepEqual(
      findByTag(one.roots, "p").map((node) => node.id),
      findByTag(other.roots, "p").map((node) => node.id),
    );
  });

  it("construye un arbol equivalente al leerlo a mano", () => {
    // La via manual y la via del lector tienen que llevar al mismo sitio.
    const factory = createIdFactory();
    const section = createElement(factory, "section");
    const p = appendChild(section, createElement(factory, "p"));

    ok(p.parentId === section.id);
    equal(p.id, "element-002");

    const read = parseMarkup("<section><p></p></section>");
    const readSection = findByTag(read.roots, "section")[0];

    // Mismo orden de identificadores: el lector no inventa nodos por el camino.
    equal(readSection?.children[0]?.id, p.id);
  });
});
