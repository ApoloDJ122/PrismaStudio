import type * as Monaco from "monaco-editor";

import type { ThemeName } from "../types/preferences.ts";

/**
 * Tema del editor de código.
 *
 * Monaco no entiende variables CSS, así que sus colores se leen de los mismos
 * tokens que usa el resto de la interfaz (`src/styles/editorTheme.css`). De esa
 * forma el editor nunca queda visualmente desconectado: un rediseño futuro solo
 * tiene que cambiar el CSS, no este código.
 */

/** Nombre con el que se registra el tema de Monaco de cada tema de Prisma. */
export const MONACO_THEME_PREFIX = "prisma";

/** Nombre registrado en Monaco para un tema de Prisma. */
export function monacoThemeName(theme: ThemeName): string {
  return `${MONACO_THEME_PREFIX}-${theme}`;
}

/**
 * Tokens que se leen del CSS. La lista es explícita y se comprueba con una
 * prueba: si se anade un token nuevo hay que decidir qué hace Monaco con él.
 */
export const EDITOR_TOKENS = {
  "--editor-bg": "editor.background",
  "--editor-fg": "editor.foreground",
  "--editor-line-highlight": "editor.lineHighlightBackground",
  "--editor-selection": "editor.selectionBackground",
  "--editor-inactive-selection": "editor.inactiveSelectionBackground",
  "--editor-cursor": "editorCursor.foreground",
  "--editor-line-number": "editorLineNumber.foreground",
  "--editor-line-number-active": "editorLineNumber.activeForeground",
  "--editor-indent-guide": "editorIndentGuide.background",
  "--editor-bracket-match": "editorBracketMatch.background",
  "--editor-widget-bg": "editorWidget.background",
  "--editor-widget-border": "editorWidget.border",
  "--editor-ruler": "editorRuler.foreground",
  "--token-comment": "tokenComment",
  "--token-keyword": "tokenKeyword",
  "--token-string": "tokenString",
  "--token-number": "tokenNumber",
  "--token-tag": "tokenTag",
  "--token-attribute": "tokenAttribute",
  "--token-property": "tokenProperty",
  "--token-punctuation": "tokenPunctuation",
  "--token-type": "tokenType",
} as const;

export type EditorTokenName = keyof typeof EDITOR_TOKENS;

/** Colores ya resueltos, listos para convertirse en tema de Monaco. */
export type EditorColors = Record<EditorTokenName, string>;

/** Resalta la sintaxis de HTML, CSS y JavaScript con los mismos colores. */
export function buildEditorTheme(
  colors: EditorColors,
  base: "vs" | "vs-dark" = "vs-dark",
): Monaco.editor.IStandaloneThemeData {
  return {
    base,
    inherit: true,
    rules: [
      { token: "comment", foreground: stripHash(colors["--token-comment"]) },
      { token: "keyword", foreground: stripHash(colors["--token-keyword"]) },
      { token: "string", foreground: stripHash(colors["--token-string"]) },
      { token: "number", foreground: stripHash(colors["--token-number"]) },
      { token: "tag", foreground: stripHash(colors["--token-tag"]) },
      { token: "attribute.name", foreground: stripHash(colors["--token-attribute"]) },
      { token: "attribute.value", foreground: stripHash(colors["--token-string"]) },
      { token: "property", foreground: stripHash(colors["--token-property"]) },
      { token: "type.identifier", foreground: stripHash(colors["--token-type"]) },
      { token: "delimiter", foreground: stripHash(colors["--token-punctuation"]) },
    ],
    colors: {
      "editor.background": colors["--editor-bg"],
      "editor.foreground": colors["--editor-fg"],
      "editorCursor.foreground": colors["--editor-cursor"],
      "editor.lineHighlightBackground": colors["--editor-line-highlight"],
      "editorLineNumber.foreground": colors["--editor-line-number"],
      "editorLineNumber.activeForeground": colors["--editor-line-number-active"],
      "editor.selectionBackground": colors["--editor-selection"],
      "editor.inactiveSelectionBackground": colors["--editor-inactive-selection"],
      "editorIndentGuide.background1": colors["--editor-indent-guide"],
      "editorIndentGuide.activeBackground1": colors["--editor-indent-guide"],
      "editorBracketMatch.background": colors["--editor-bracket-match"],
      "editorBracketMatch.border": colors["--editor-bracket-match"],
      "editorWidget.background": colors["--editor-widget-bg"],
      "editorWidget.border": colors["--editor-widget-border"],
      "editorRuler.foreground": colors["--editor-ruler"],
      "editorGutter.background": colors["--editor-bg"],
      "scrollbarSlider.background": colors["--editor-indent-guide"],
      "scrollbarSlider.hoverBackground": colors["--editor-line-number"],
      "scrollbarSlider.activeBackground": colors["--editor-line-number-active"],
      "editorWidget.resizeBorder": colors["--editor-widget-border"],
      "focusBorder": colors["--editor-bracket-match"],
    },
  };
}

/**
 * El tema claro necesita la base clara de Monaco. El oscuro y Neo comparten base
 * oscura, pero cada uno con sus propios colores.
 */
export function monacoBase(theme: ThemeName): "vs" | "vs-dark" {
  return theme === "light" ? "vs" : "vs-dark";
}

/** Lee los tokens del editor del CSS ya aplicado. */
export function readEditorColors(): EditorColors {
  const styles = getComputedStyle(document.documentElement);
  const colors = {} as EditorColors;

  for (const token of Object.keys(EDITOR_TOKENS) as EditorTokenName[]) {
    colors[token] = styles.getPropertyValue(token).trim();
  }

  return colors;
}

/**
 * Registra el tema de Monaco de un tema de Prisma y lo activa.
 * Se llama cada vez que cambia el tema o se crea el editor.
 */
export function defineEditorTheme(monaco: typeof Monaco, theme: ThemeName): void {
  const name = monacoThemeName(theme);

  monaco.editor.defineTheme(name, buildEditorTheme(readEditorColors(), monacoBase(theme)));
  monaco.editor.setTheme(name);
}

/** Monaco exige los colores sin almohadilla. */
function stripHash(color: string): string {
  return color.startsWith("#") ? color.slice(1) : color;
}
