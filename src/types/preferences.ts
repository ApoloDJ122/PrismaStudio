/** Temas visuales disponibles en Prisma. */
export type ThemeName = "light" | "dark" | "neo";

export interface ThemeOption {
  name: ThemeName;
  /** Nombre mostrado en la configuración. */
  label: string;
  /** Descripción corta de cómo se ve el tema. */
  description: string;
  /** Colores de muestra: fondo, superficie y acento. */
  swatch: { bg: string; surface: string; accent: string };
}

/** Tema usado cuando no hay preferencia guardada o la guardada no es válida. */
export const DEFAULT_THEME: ThemeName = "light";

/** Orden en que aparecen los temas en la configuración. */
export const THEMES: readonly ThemeOption[] = [
  {
    name: "light",
    label: "Claro",
    description: "Fondo claro y texto oscuro. Para trabajar a pleno día.",
    swatch: { bg: "#f2f4f7", surface: "#ffffff", accent: "#2f6feb" },
  },
  {
    name: "dark",
    label: "Oscuro",
    description: "Superficies en grafito. Cómodo en sesiones largas.",
    swatch: { bg: "#171a1f", surface: "#1e2228", accent: "#5b8def" },
  },
  {
    name: "neo",
    label: "Neo",
    description: "Base azul profunda con acento violeta. Identidad de Prisma.",
    swatch: { bg: "#0d0f15", surface: "#151924", accent: "#8b7bf5" },
  },
];

/** Nombres de tema válidos, derivados de la lista anterior. */
export const THEME_NAMES: readonly ThemeName[] = THEMES.map((theme) => theme.name);

/**
 * Comprueba si un valor cualquiera es un tema de Prisma. Rust también valida el
 * tema al guardar; esto evita mandar basura desde la interfaz.
 */
export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && THEME_NAMES.includes(value as ThemeName);
}

/**
 * Devuelve el tema pedido si existe y el predeterminado si no. Nunca falla: una
 * preferencia corrupta deja la interfaz con un tema válido.
 */
export function resolveTheme(value: unknown): ThemeName {
  return isThemeName(value) ? value : DEFAULT_THEME;
}

/** Preferencias de la aplicación. Se guardan en la carpeta de Prisma. */
export interface AppPreferences {
  version: number;
  theme: ThemeName;
}

/** Preferencias iniciales, antes de leer las guardadas. */
export function defaultPreferences(): AppPreferences {
  return { version: 1, theme: DEFAULT_THEME };
}

/** Etiqueta de un tema, para mostrar su nombre. */
export function themeLabel(theme: ThemeName): string {
  return THEMES.find((option) => option.name === theme)?.label ?? theme;
}
