import { invoke } from "@tauri-apps/api/core";

import type { SessionState } from "../types/session";

/**
 * Persistencia de la sesión de Prisma.
 *
 * Solo se guarda información de referencia (ruta del proyecto, pestañas y
 * posición del cursor). El contenido de los archivos nunca se guarda aquí:
 * sigue viviendo en los archivos reales del proyecto.
 */

/** Devuelve la sesión anterior, o `null` si no hay ninguna o está dañada. */
export function loadSession(): Promise<SessionState | null> {
  return invoke<SessionState | null>("load_session");
}

/** Guarda la sesión actual. La escritura en Rust es atómica. */
export function saveSession(state: SessionState): Promise<void> {
  return invoke<void>("save_session", { state });
}

/** Borra la sesión guardada, por ejemplo al cerrar el proyecto. */
export function clearSession(): Promise<void> {
  return invoke<void>("clear_session");
}
