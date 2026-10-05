import { invoke } from "@tauri-apps/api/core";

import { defaultPreferences, resolveTheme, type AppPreferences } from "../types/preferences";

/**
 * Preferencias visuales de Prisma.
 *
 * Se guardan en la carpeta de configuración de la aplicación, nunca dentro de los
 * proyectos web del usuario: son preferencias de Prisma, no del proyecto.
 */

/** Devuelve las preferencias guardadas, o las predeterminadas si no hay ninguna. */
export async function loadPreferences(): Promise<AppPreferences> {
  const stored = await invoke<Partial<AppPreferences>>("load_preferences");

  return {
    version: typeof stored.version === "number" ? stored.version : 1,
    theme: resolveTheme(stored.theme),
  };
}

/** Guarda el tema elegido y devuelve lo que Prisma ha guardado realmente. */
export async function saveTheme(theme: AppPreferences["theme"]): Promise<AppPreferences> {
  const saved = await invoke<Partial<AppPreferences>>("save_preferences", {
    preferences: { ...defaultPreferences(), theme },
  });

  return {
    version: typeof saved.version === "number" ? saved.version : 1,
    theme: resolveTheme(saved.theme),
  };
}
