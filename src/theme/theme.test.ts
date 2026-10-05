import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildEditorTheme,
  EDITOR_TOKENS,
  monacoBase,
  monacoThemeName,
  type EditorColors,
  type EditorTokenName,
} from "../editor/editorTheme.ts";
import { applyTheme, clearTheme, currentTheme, THEME_ATTRIBUTE, themeAttribute, type ThemeTarget } from "./applyTheme.ts";
import {
  DEFAULT_THEME,
  isThemeName,
  resolveTheme,
  THEME_NAMES,
  THEMES,
  themeLabel,
} from "../types/preferences.ts";

const { deepEqual, equal } = assert;

/** Colores de mentira: aquí importa la estructura, no el valor concreto. */
function fakeColors(): EditorColors {
  const colors = {} as EditorColors;

  for (const token of Object.keys(EDITOR_TOKENS) as EditorTokenName[]) {
    colors[token] = "#123456";
  }

  return colors;
}

/** Elemento con atributos, como el raíz del documento pero sin DOM. */
function fakeElement(theme?: string): ThemeTarget {
  const attributes = new Map<string, string>();

  if (theme !== undefined) {
    attributes.set(THEME_ATTRIBUTE, theme);
  }

  return {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => {
      attributes.set(name, value);
    },
    removeAttribute: (name) => {
      attributes.delete(name);
    },
  };
}

describe("temas disponibles", () => {
  it("ofrece exactamente los tres temas de Prisma", () => {
    deepEqual([...THEME_NAMES], ["light", "dark", "neo"]);
  });

  it("usa el tema claro por defecto", () => {
    equal(DEFAULT_THEME, "light");
    equal(resolveTheme(undefined), "light");
  });

  it("acepta los tres nombres y rechaza cualquier otro", () => {
    for (const name of THEME_NAMES) {
      equal(isThemeName(name), true);
    }

    equal(isThemeName("fucsia"), false);
    equal(isThemeName(""), false);
    equal(isThemeName(3), false);
    equal(isThemeName(null), false);
  });

  it("nunca devuelve un tema que Prisma no sepa aplicar", () => {
    // Un valor corrupto en el archivo de preferencias no puede dejar la interfaz
    // sin tema ni con un tema inexistente.
    for (const value of ["fucsia", "", 0, null, undefined, {}, []]) {
      equal(isThemeName(resolveTheme(value)), true);
    }
  });

  it("devuelve el tema pedido cuando es válido", () => {
    equal(resolveTheme("neo"), "neo");
    equal(resolveTheme("dark"), "dark");
  });

  it("tiene nombre y descripción para cada tema", () => {
    for (const option of THEMES) {
      equal(option.label.length > 0, true);
      equal(option.description.length > 0, true);
      equal(themeLabel(option.name), option.label);
    }
  });

  it("describe el aspecto de cada tema con colores de muestra", () => {
    for (const option of THEMES) {
      for (const color of Object.values(option.swatch)) {
        equal(/^#[0-9a-f]{6}$/i.test(color), true);
      }
    }
  });
});

describe("aplicación del tema a la interfaz", () => {
  it("marca el tema con un atributo en el elemento raíz", () => {
    equal(THEME_ATTRIBUTE, "data-theme");
    equal(themeAttribute("light"), "light");
    equal(themeAttribute("dark"), "dark");
    equal(themeAttribute("neo"), "neo");
  });

  it("escribe y lee el tema en el elemento indicado", () => {
    const element = fakeElement();

    applyTheme("neo", element);
    equal(element.getAttribute(THEME_ATTRIBUTE), "neo");
    equal(currentTheme(element), "neo");

    applyTheme("dark", element);
    equal(currentTheme(element), "dark");
  });

  it("avisa con null cuando el tema aplicado no es válido", () => {
    // Un valor escrito a mano o de una versión antigua no puede dejar la
    // interfaz sin tema: quien llame usará el predeterminado.
    equal(currentTheme(fakeElement()), null);
    equal(currentTheme(fakeElement("FUCIA")), null);
    equal(currentTheme(fakeElement("")), null);
  });

  it("se queda sin tema al limpiarlo, para volver al predeterminado", () => {
    const element = fakeElement("neo");
    clearTheme(element);

    equal(currentTheme(element), null);
  });
});

describe("tema del editor", () => {
  it("registra un nombre propio por tema para no chocar con los de Monaco", () => {
    equal(monacoThemeName("light"), "prisma-light");
    equal(monacoThemeName("dark"), "prisma-dark");
    equal(monacoThemeName("neo"), "prisma-neo");
  });

  it("usa la base clara solo en el tema claro", () => {
    equal(monacoBase("light"), "vs");
    equal(monacoBase("dark"), "vs-dark");
    equal(monacoBase("neo"), "vs-dark");
  });

  it("manda a Monaco el fondo y el texto del tema", () => {
    const colors = fakeColors();
    colors["--editor-bg"] = "#0d0f15";
    colors["--editor-fg"] = "#e9ecf6";

    const data = buildEditorTheme(colors, "vs-dark");

    equal(data.base, "vs-dark");
    equal(data.colors?.["editor.background"], "#0d0f15");
    equal(data.colors?.["editor.foreground"], "#e9ecf6");
  });

  it("acepta la base clara para el tema claro", () => {
    equal(buildEditorTheme(fakeColors(), "vs").base, "vs");
  });

  it("quita la almohadilla que Monaco no admite en los tokens", () => {
    const data = buildEditorTheme(fakeColors());
    const comment = data.rules?.find((rule) => rule.token === "comment");

    equal(comment?.foreground, "123456");
  });

  it("mantiene el resaltado de HTML, CSS y JavaScript", () => {
    const tokens = (buildEditorTheme(fakeColors()).rules ?? []).map((rule) => rule.token);

    for (const token of ["comment", "keyword", "string", "number", "tag", "property"]) {
      equal(tokens.includes(token), true);
    }

    // Los atributos y los delimitadores son los que más se ven en un proyecto web.
    equal(tokens.includes("attribute.name"), true);
    equal(tokens.includes("delimiter"), true);
  });

  it("da color propio a cada superficie del editor", () => {
    const data = buildEditorTheme(fakeColors());
    const colors = data.colors ?? {};

    for (const key of [
      "editor.background",
      "editor.foreground",
      "editorCursor.foreground",
      "editorLineNumber.foreground",
      "editor.selectionBackground",
      "editorWidget.background",
    ]) {
      equal(key in colors, true);
    }
  });

  it("hereda el estilo de los temas base de Monaco", () => {
    // Los widgets de Monaco (buscador, autocompletado) se pintarían todos de
    // golpe si no se hereda el tema base.
    equal(buildEditorTheme(fakeColors()).inherit, true);
  });
});

/*
 * Comprueba que themes.css y editorTheme.css siguen teniendo todos los tokens que
 * el código usa. Es la red de seguridad para que anadir un token a medias no
 * rompe un tema en silencio.
 */
describe("tokens de los estilos", () => {
  const themesCss = readFileSync(new URL("../styles/themes.css", import.meta.url), "utf8");
  const editorCss = readFileSync(new URL("../styles/editorTheme.css", import.meta.url), "utf8");

  /** Estilos que deben usar tokens y no colores propios. */
  const COMPONENT_STYLES = [
    "../styles/global.css",
    "../styles/ui.css",
    "../styles/App.css",
    "../components/CreateProjectDialog.css",
    "../components/WelcomeScreen.css",
    "../components/SettingsScreen.css",
    "../components/workspace/Workspace.css",
  ] as const;

  /** Tokens de la interfaz que los componentes necesitan, por zona. */
  const INTERFACE_TOKENS = [
    "--color-bg",
    "--color-bg-hover",
    "--color-surface",
    "--color-surface-muted",
    "--color-surface-sunken",
    "--color-border",
    "--color-border-strong",
    "--color-text",
    "--color-text-muted",
    "--color-text-subtle",
    "--color-accent",
    "--color-accent-hover",
    "--color-accent-contrast",
    "--color-accent-soft",
    "--color-accent-border",
    "--color-danger",
    "--color-danger-hover",
    "--color-danger-contrast",
    "--color-danger-soft",
    "--color-danger-border",
    "--color-danger-text",
    "--color-warning",
    "--color-focus",
    "--color-selection",
    "--color-overlay",
    "--color-shadow",
    "--color-scrollbar",
    "--color-header-bg",
    "--color-tabbar-bg",
    "--color-tab-active-bg",
    "--color-tab-active-border",
    "--color-statusbar-bg",
    "--color-sidebar-bg",
  ];

  function block(css: string, selector: string): string {
    const start = css.indexOf(selector);
    equal(start >= 0, true);

    const open = css.indexOf("{", start);
    const close = css.indexOf("}", open);
    return css.slice(open, close);
  }

  for (const name of THEME_NAMES) {
    it(`el tema ${name} define todos los tokens de la interfaz`, () => {
      const content = block(themesCss, `[data-theme="${name}"]`);

      for (const token of INTERFACE_TOKENS) {
        equal(content.includes(`${token}:`), true, `falta ${token} en ${name}`);
      }
    });

    it(`el tema ${name} define todos los tokens del editor`, () => {
      const content =
        name === "light" ? editorCss : block(editorCss, `[data-theme="${name}"]`);

      for (const token of Object.keys(EDITOR_TOKENS)) {
        equal(content.includes(`${token}:`), true, `falta ${token} en ${name}`);
      }
    });
  }

  it("declara el color del editor base junto al tema claro", () => {
    // El tema claro no necesita un bloque propio: sus tokens del editor están
    // en :root, que es lo que se aplica si falta el atributo.
    equal(editorCss.includes(":root"), true);
  });

  it("no deja colores sueltos fuera de los archivos de temas", () => {
    // Los componentes solo usan tokens. Un color escrito a mano en un
    // componente se vería mal en dos de los tres temas, así que aquí se busca.
    for (const file of COMPONENT_STYLES) {
      const css = readFileSync(new URL(file, import.meta.url), "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );

      deepEqual(
        [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0]),
        [],
        `${file} tiene un color escrito a mano`,
      );
      deepEqual(
        [...css.matchAll(/\brgba?\(/g)].map((match) => match[0]),
        [],
        `${file} tiene un color escrito a mano`,
      );
    }
  });
});
