import { useCallback, useEffect, useState } from "react";

import { loadPreferences, saveTheme } from "../services/preferences";
import { applyTheme } from "../theme/applyTheme";
import { defaultPreferences, type AppPreferences, type ThemeName } from "../types/preferences";

/**
 * Preferencia visual de Prisma: el tema activo.
 *
 * El tema se lee una vez al arrancar y se guarda en cuanto el usuario lo cambia,
 * así que no hace falta reiniciar la aplicación. La aplicación efectiva se marca
 * en el elemento raíz (`data-theme`) y de ahí la toman todos los estilos y el
 * propio editor de código.
 */
export function usePreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stored = await loadPreferences();

        if (!cancelled) {
          setPreferences(stored);
        }
      } catch (cause) {
        // Sin preferencias guardadas se usa el tema predeterminado: la
        // aplicación tiene que arrancar siempre. Solo se avisa si ya había un
        // archivo que no se pudo leer, que sería un problema de verdad.
        console.warn("[prisma] no se pudieron leer las preferencias:", cause);

        if (!cancelled) {
          setError("No se pudieron leer las preferencias guardadas. Se usa el tema claro.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // El atributo se actualiza en cuanto se conoce el tema, antes incluso de
  // que haya un proyecto abierto, para que la pantalla de bienvenida ya salga
  // con el tema elegido.
  useEffect(() => {
    applyTheme(preferences.theme);
  }, [preferences.theme]);

  const setTheme = useCallback((theme: ThemeName) => {
    /*
     * Se aplica al momento y se guarda después. La interfaz responde sin esperar
     * al disco, que es lo que se espera de un cambio de tema; si el guardado
     * falla, se avisa en la propia pantalla de ajustes en vez de dejar creerse
     * que se recordará para la próxima vez.
     */
    setPreferences((current) => (current.theme === theme ? current : { ...current, theme }));
    applyTheme(theme);

    void saveTheme(theme)
      .then(() => {
        setError(null);
      })
      .catch((cause: unknown) => {
        console.warn("[prisma] no se pudo guardar el tema:", cause);
        setError("No se pudo guardar el tema. Se usará solo durante esta sesión.");
      });
  }, []);

  return { theme: preferences.theme, isLoading, error, setTheme };
}

export type PreferencesState = ReturnType<typeof usePreferences>;
