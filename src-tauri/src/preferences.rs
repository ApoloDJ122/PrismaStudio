//! Preferencias visuales de la aplicación.
//!
//! Solo se guarda lo que el usuario elige en la configuración, y siempre en la
//! carpeta de configuración de Prisma: nunca dentro de los proyectos web del
//! usuario, que no le pertenecen a la aplicación.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::jsonfile;

const PREFERENCES_FILE: &str = "preferences.json";
const PREFERENCES_VERSION: u32 = 1;

/// Temas disponibles. El orden es el que se muestra en la configuración.
const THEMES: [&str; 3] = ["light", "dark", "neo"];

/// Tema usado cuando no hay preferencias guardadas o no son utilizables.
const DEFAULT_THEME: &str = "light";

/// Preferencias de la aplicación. Se versionan para poder ampliarse más adelante
/// sin romper los archivos ya guardados.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppPreferences {
    pub version: u32,
    /// `light`, `dark` o `neo`.
    pub theme: String,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            version: PREFERENCES_VERSION,
            theme: DEFAULT_THEME.to_string(),
        }
    }
}

impl AppPreferences {
    /// Devuelve las preferencias con el tema corregido: si el archivo contiene un
    /// tema que Prisma no reconoce, se usa el predeterminado en lugar de fallar.
    /// Así una versión antigua o editada a mano nunca deja la interfaz sin tema.
    fn normalized(mut self) -> Self {
        self.version = PREFERENCES_VERSION;
        self.theme = normalize_theme(&self.theme).to_string();
        self
    }
}

/// Traduce el nombre de un tema al que Prisma reconoce.
fn normalize_theme(theme: &str) -> &str {
    if THEMES.contains(&theme) {
        theme
    } else {
        DEFAULT_THEME
    }
}

fn preferences_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    jsonfile::config_file(app, PREFERENCES_FILE)
}

fn read_preferences_from(path: &Path) -> AppPreferences {
    jsonfile::read_json::<AppPreferences>(path)
        .unwrap_or_default()
        .normalized()
}

fn write_preferences_to(path: &Path, preferences: &AppPreferences) -> Result<(), String> {
    jsonfile::write_json(path, &preferences.clone().normalized())
}

#[tauri::command]
pub fn load_preferences(app: AppHandle) -> Result<AppPreferences, String> {
    Ok(read_preferences_from(&preferences_file(&app)?))
}

#[tauri::command]
pub fn save_preferences(app: AppHandle, preferences: AppPreferences) -> Result<AppPreferences, String> {
    let normalized = preferences.normalized();
    write_preferences_to(&preferences_file(&app)?, &normalized)?;

    // Se devuelve lo que realmente se guardó, no lo pedido, para que la interfaz
    // se quede con el tema que Prisma va a usar.
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn temp_file(label: &str) -> std::path::PathBuf {
        jsonfile::tests::temp_file(&format!("prefs_{label}"), PREFERENCES_FILE)
    }

    fn with_theme(theme: &str) -> AppPreferences {
        AppPreferences {
            version: PREFERENCES_VERSION,
            theme: theme.to_string(),
        }
    }

    #[test]
    fn accepts_the_three_available_themes() {
        let path = temp_file("themes");

        for theme in THEMES {
            write_preferences_to(&path, &with_theme(theme)).unwrap();
            assert_eq!(read_preferences_from(&path).theme, theme);
        }

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn replaces_an_unknown_theme_with_the_default() {
        let path = temp_file("unknown");

        // Un tema inventado o de una versión posterior no deja la interfaz rota.
        write_preferences_to(&path, &with_theme("fucsia")).unwrap();
        assert_eq!(read_preferences_from(&path).theme, DEFAULT_THEME);

        // También si viene directamente en el archivo.
        fs::write(&path, r#"{"version":1,"theme":"fucsia"}"#).unwrap();
        assert_eq!(read_preferences_from(&path).theme, DEFAULT_THEME);

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn reads_default_preferences_when_there_is_no_file() {
        let path = temp_file("missing");

        let preferences = read_preferences_from(&path);
        assert_eq!(preferences.theme, DEFAULT_THEME);
        assert_eq!(preferences.version, PREFERENCES_VERSION);

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn tolerates_a_damaged_or_foreign_file() {
        let path = temp_file("damaged");

        fs::write(&path, "{ esto no es json").unwrap();
        assert_eq!(read_preferences_from(&path).theme, DEFAULT_THEME);

        fs::write(&path, r#"{"proyecto":"C:\\algo"}"#).unwrap();
        assert_eq!(read_preferences_from(&path).theme, DEFAULT_THEME);

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn survives_being_rewritten_repeatedly() {
        let path = temp_file("rewrite");

        for theme in THEMES {
            write_preferences_to(&path, &with_theme(theme)).unwrap();
        }

        assert_eq!(read_preferences_from(&path).theme, "neo");
        assert!(!path.with_extension("json.tmp").exists());

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn always_writes_the_current_version() {
        let path = temp_file("version");

        // Un archivo de una versión antigua debe poder seguir guardándose.
        let mut old = with_theme("neo");
        old.version = 0;
        write_preferences_to(&path, &old).unwrap();

        assert_eq!(read_preferences_from(&path).version, PREFERENCES_VERSION);

        jsonfile::tests::cleanup(&path);
    }
}
