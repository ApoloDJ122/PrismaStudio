use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

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
/// No contiene el contenido de los archivos: los archivos siguen siendo la
/// única fuente de verdad y viven en el disco.
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

fn session_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("No se pudo localizar la carpeta de Prisma: {error}"))?;

    Ok(dir.join(SESSION_FILE))
}

/// Lectura pura del archivo de sesión. Un archivo ausente, vacio o ilegible
/// devuelve `None` en lugar de un error: la sesión es una comodidad, nunca un
/// requisito para abrir Prisma.
fn read_session_from(path: &Path) -> Option<SessionState> {
    if !path.is_file() {
        return None;
    }

    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) => {
            eprintln!("[prisma] no se pudo leer la sesion guardada: {error}");
            return None;
        }
    };

    if content.trim().is_empty() {
        return None;
    }

    match serde_json::from_str::<SessionState>(&content) {
        // Una sesión sin proyecto no sirve para recuperar nada, así que se trata
        // como si no hubiera sesión. También descarta archivos json ajenos.
        Ok(state) if state.last_project.is_some() => Some(state),
        Ok(_) => None,
        Err(error) => {
            eprintln!("[prisma] la sesion guardada esta danada y se ignora: {error}");
            None
        }
    }
}

/// Escritura atomica: se escribe un archivo temporal y se renombra, de modo que
/// un cierre inesperado nunca deje una sesion a medias.
fn write_session_to(path: &Path, state: &SessionState) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| "No se pudo determinar la carpeta de la sesion.".to_string())?;

    fs::create_dir_all(dir)
        .map_err(|error| format!("No se pudo crear la carpeta de la sesion: {error}"))?;

    let payload = serde_json::to_string_pretty(state)
        .map_err(|error| format!("No se pudo preparar la sesion: {error}"))?;

    let temporary = path.with_extension("json.tmp");

    fs::write(&temporary, payload)
        .map_err(|error| format!("No se pudo escribir la sesion: {error}"))?;

    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("No se pudo guardar la sesion: {error}"));
    }

    Ok(())
}

fn remove_session_from(path: &Path) -> Result<(), String> {
    if path.is_file() {
        fs::remove_file(path)
            .map_err(|error| format!("No se pudo borrar la sesion guardada: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn load_session(app: AppHandle) -> Result<Option<SessionState>, String> {
    Ok(read_session_from(&session_file(&app)?))
}

#[tauri::command]
pub fn save_session(app: AppHandle, state: SessionState) -> Result<(), String> {
    let mut state = state;
    state.version = SESSION_VERSION;

    // La version se fija aqui para que un archivo antiguo no impida guardar.
    write_session_to(&session_file(&app)?, &state)
}

#[tauri::command]
pub fn clear_session(app: AppHandle) -> Result<(), String> {
    remove_session_from(&session_file(&app)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("prisma_m14_session_{label}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join(SESSION_FILE)
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

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn missing_or_empty_session_returns_none() {
        let path = temp_file("missing");
        assert_eq!(read_session_from(&path), None);

        fs::write(&path, "   ").unwrap();
        assert_eq!(read_session_from(&path), None);

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn corrupted_session_does_not_block_startup() {
        let path = temp_file("corrupted");

        fs::write(&path, "{ esto no es json").unwrap();
        assert_eq!(read_session_from(&path), None);

        // Un archivo con campos de otro formato tambien se descarta.
        fs::write(&path, r#"{"otraCosa": 42}"#).unwrap();
        assert_eq!(read_session_from(&path), None);

        let _ = fs::remove_dir_all(path.parent().unwrap());
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

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn writes_create_missing_directory() {
        let path = std::env::temp_dir()
            .join("prisma_m14_session_newdir")
            .join("otra")
            .join("carpeta")
            .join(SESSION_FILE);
        let _ = fs::remove_dir_all(path.parent().unwrap().parent().unwrap().parent().unwrap());

        write_session_to(&path, &sample()).unwrap();
        assert!(path.is_file());

        let _ = fs::remove_dir_all(path.parent().unwrap().parent().unwrap().parent().unwrap());
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

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn clearing_session_is_idempotent() {
        let path = temp_file("clear");

        remove_session_from(&path).unwrap();
        write_session_to(&path, &sample()).unwrap();
        remove_session_from(&path).unwrap();
        assert!(!path.exists());
        remove_session_from(&path).unwrap();

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
