//! Sesión del workspace: qué proyecto estaba abierto y con qué archivos.
//!
//! Es una comodidad, nunca un requisito. Los archivos del disco siguen siendo la
//! única fuente de verdad: aquí no se guarda su contenido, solo la referencia.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::jsonfile;

const SESSION_FILE: &str = "session.json";
const SESSION_VERSION: u32 = 1;

/// Una pestaña abierta en la sesión anterior. Guarda solo la referencia al
/// archivo real, nunca su contenido.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionTab {
    pub path: String,
    pub name: String,
    /// Línea del cursor, para devolver el editor a su posición aproximada.
    #[serde(default)]
    pub line: u32,
}

/// Información mínima necesaria para reconstruir el workspace.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionState {
    pub version: u32,
    pub last_project: Option<String>,
    pub open_tabs: Vec<SessionTab>,
    pub active_path: Option<String>,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            version: SESSION_VERSION,
            last_project: None,
            open_tabs: Vec::new(),
            active_path: None,
        }
    }
}

fn session_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    jsonfile::config_file(app, SESSION_FILE)
}

/// Lectura de la sesión. Una sesión sin proyecto no sirve para recuperar nada, así
/// que se trata como si no hubiera sesión: así un json ajeno en esa ruta no
/// reaparece como un proyecto.
fn read_session_from(path: &Path) -> Option<SessionState> {
    jsonfile::read_json::<SessionState>(path).filter(|state| state.last_project.is_some())
}

fn write_session_to(path: &Path, state: &SessionState) -> Result<(), String> {
    // La versión se fija aquí para que un archivo antiguo no impida guardar.
    let mut state = state.clone();
    state.version = SESSION_VERSION;

    jsonfile::write_json(path, &state)
}

fn remove_session_from(path: &Path) -> Result<(), String> {
    jsonfile::remove_json(path)
}

#[tauri::command]
pub fn load_session(app: AppHandle) -> Result<Option<SessionState>, String> {
    Ok(read_session_from(&session_file(&app)?))
}

#[tauri::command]
pub fn save_session(app: AppHandle, state: SessionState) -> Result<(), String> {
    write_session_to(&session_file(&app)?, &state)
}

#[tauri::command]
pub fn clear_session(app: AppHandle) -> Result<(), String> {
    remove_session_from(&session_file(&app)?)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn temp_file(label: &str) -> std::path::PathBuf {
        jsonfile::tests::temp_file(&format!("session_{label}"), SESSION_FILE)
    }

    fn sample() -> SessionState {
        SessionState {
            version: SESSION_VERSION,
            last_project: Some("C:\\proyectos\\mi-web".to_string()),
            open_tabs: vec![
                SessionTab {
                    path: "C:\\proyectos\\mi-web\\index.html".to_string(),
                    name: "index.html".to_string(),
                    line: 12,
                },
                SessionTab {
                    path: "C:\\proyectos\\mi-web\\css\\style.css".to_string(),
                    name: "style.css".to_string(),
                    line: 1,
                },
            ],
            active_path: Some("C:\\proyectos\\mi-web\\css\\style.css".to_string()),
        }
    }

    #[test]
    fn round_trips_session_state() {
        let path = temp_file("roundtrip");
        let state = sample();

        write_session_to(&path, &state).unwrap();
        assert_eq!(read_session_from(&path), Some(state.clone()));

        // El archivo existe de verdad y es json legible.
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("mi-web"));
        assert!(raw.contains("\"version\": 1"));

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn overwrites_an_existing_session() {
        let path = temp_file("overwrite");

        // Escribir dos veces seguidas es el caso normal: la sesion se guarda cada
        // vez que cambian las pestanas, no solo la primera.
        write_session_to(&path, &sample()).unwrap();

        let mut updated = sample();
        updated.open_tabs.truncate(1);
        updated.active_path = Some("C:\\proyectos\\mi-web\\index.html".to_string());
        updated.open_tabs[0].line = 99;

        write_session_to(&path, &updated).unwrap();
        assert_eq!(read_session_from(&path), Some(updated));

        // No debe quedar el archivo temporal por el camino.
        assert!(!path.with_extension("json.tmp").exists());

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn missing_or_empty_session_returns_none() {
        let path = temp_file("missing");
        assert_eq!(read_session_from(&path), None);

        fs::write(&path, "   ").unwrap();
        assert_eq!(read_session_from(&path), None);

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn corrupted_session_does_not_block_startup() {
        let path = temp_file("corrupted");

        fs::write(&path, "{ esto no es json").unwrap();
        assert_eq!(read_session_from(&path), None);

        // Un archivo con campos de otro formato tambien se descarta.
        fs::write(&path, r#"{"otraCosa": 42}"#).unwrap();
        assert_eq!(read_session_from(&path), None);

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn session_without_project_is_treated_as_empty() {
        let path = temp_file("noproject");

        // Sin proyecto no hay nada que recuperar, aunque el archivo sea valido.
        let mut state = sample();
        state.last_project = None;
        write_session_to(&path, &state).unwrap();

        assert_eq!(read_session_from(&path), None);

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn older_session_without_cursor_still_loads() {
        let path = temp_file("legacy");

        // Sesion escrita antes de que existiera el campo de la linea del cursor.
        fs::write(
            &path,
            r#"{"version":1,"lastProject":"C:\\p","openTabs":[{"path":"C:\\p\\a.html","name":"a.html"}],"activePath":"C:\\p\\a.html"}"#,
        )
        .unwrap();

        let state = read_session_from(&path).unwrap();
        assert_eq!(state.open_tabs.len(), 1);
        assert_eq!(state.open_tabs[0].line, 0);

        jsonfile::tests::cleanup(&path);
    }

    #[test]
    fn clearing_session_is_idempotent() {
        let path = temp_file("clear");

        remove_session_from(&path).unwrap();
        write_session_to(&path, &sample()).unwrap();
        remove_session_from(&path).unwrap();
        assert!(!path.exists());
        remove_session_from(&path).unwrap();

        jsonfile::tests::cleanup(&path);
    }
}
