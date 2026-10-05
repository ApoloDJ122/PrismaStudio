import { isThemeName, type ThemeName } from "../types/preferences.ts";

/**
 * Aplicación del tema a la interfaz.
 *
 * El tema se marca con `data-theme` en el elemento raíz y todo el color de
 * Prisma sale de los tokens CSS definidos en `src/styles/themes.css`. Ningún
 * componente escribe un color propio, así que cambiar de tema no obliga a
 * re-renderizar nada: basta con cambiar un atributo.
 *
 * Estas funciones reciben el elemento sobre el que trabajan. Así el código que
 * decide qué tema hay activo se puede probar sin montar una ventana.
 */

/** Atributo del elemento raíz que selecciona el tema. */
export const THEME_ATTRIBUTE = "data-theme";

/** Parte del elemento raíz que necesita el tema. */
export type ThemeTarget = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

/** Valor del atributo para un tema dado. */
export function themeAttribute(theme: ThemeName): string {
  return theme;
}

/** Marca el tema activo en el elemento raíz. */
export function applyTheme(theme: ThemeName, target?: ThemeTarget): void {
  const element = target ?? document.documentElement;
  element.setAttribute(THEME_ATTRIBUTE, themeAttribute(theme));
}

/**
 * Tema que hay aplicado ahora mismo, o `null` si no hay ninguno reconocible.
 *
 * Un valor desconocido se trata como `null` para que quien llame aplique el
 * predeterminado en vez de dejar la interfaz sin definir.
 */
export function currentTheme(target?: ThemeTarget): ThemeName | null {
  const element = target ?? document.documentElement;
  const value = element.getAttribute(THEME_ATTRIBUTE);

  return isThemeName(value) ? value : null;
}

/** Deja el tema sin aplicar. Se usa al desmontar la aplicación. */
export function clearTheme(target?: ThemeTarget): void {
  const element = target ?? document.documentElement;
  element.removeAttribute(THEME_ATTRIBUTE);
}
