//! Lectura y escritura de archivos json de Prisma en la carpeta de configuración
//! de la aplicación.
//!
//! Lo usan la sesión del workspace y las preferencias visuales. Las dos son una
//! comodidad: un archivo ausente, vacío o ilegible devuelve `None` y no impide
//! arrancar Prisma, así que un json dañado nunca bloquea la aplicación.

use std::fs;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Ruta de un archivo json dentro de la carpeta de configuración de Prisma.
///
/// No se usa `path.app_config_dir()` directamente en cada sitio para que el
/// nombre del archivo y la carpeta sean siempre los mismos.
pub fn config_file(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("No se pudo localizar la carpeta de Prisma: {error}"))?;

    Ok(dir.join(file_name))
}

/// Lee un json. Devuelve `None` si no existe, está vacío, no se puede leer o no
/// tiene el formato esperado.
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    if !path.is_file() {
        return None;
    }

    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) => {
            eprintln!("[prisma] no se pudo leer {}: {error}", display(path));
            return None;
        }
    };

    if content.trim().is_empty() {
        return None;
    }

    match serde_json::from_str::<T>(&content) {
        Ok(value) => Some(value),
        Err(error) => {
            eprintln!(
                "[prisma] {} esta danado y se ignora: {error}",
                display(path)
            );
            None
        }
    }
}

/// Escribe un json de forma atómica: primero un archivo temporal y después lo
/// renombra sobre el destino, de modo que un cierre inesperado nunca deje un
/// archivo a medias. Si el destino ya existe, el renombrado lo sustituye.
pub fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| format!("No se pudo determinar la carpeta de {}.", display(path)))?;

    fs::create_dir_all(dir)
        .map_err(|error| format!("No se pudo crear la carpeta de {}: {error}", display(path)))?;

    let payload = serde_json::to_string_pretty(value)
        .map_err(|error| format!("No se pudo preparar {}: {error}", display(path)))?;

    let temporary = path.with_extension("json.tmp");

    fs::write(&temporary, payload)
        .map_err(|error| format!("No se pudo escribir {}: {error}", display(path)))?;

    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("No se pudo guardar {}: {error}", display(path)));
    }

    Ok(())
}

/// Borra un json si existe. Repetir la operación no es un error.
pub fn remove_json(path: &Path) -> Result<(), String> {
    if path.is_file() {
        fs::remove_file(path)
            .map_err(|error| format!("No se pudo borrar {}: {error}", display(path)))?;
    }

    Ok(())
}

fn display(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

#[cfg(test)]
pub(crate) mod tests {
    use serde::Deserialize;

    use super::*;

    /// Carpeta temporal propia de cada prueba, para poder ejecutarlas en paralelo.
    pub fn temp_file(label: &str, file_name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("prisma_jsonfile_{label}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join(file_name)
    }

    pub fn cleanup(path: &Path) {
        if let Some(dir) = path.parent() {
            let _ = fs::remove_dir_all(dir);
        }
    }

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Sample {
        nombre: String,
        veces: u32,
    }

    fn sample() -> Sample {
        Sample {
            nombre: "Prisma".to_string(),
            veces: 3,
        }
    }

    #[test]
    fn writes_and_reads_json() {
        let path = temp_file("roundtrip", "datos.json");

        write_json(&path, &sample()).unwrap();
        assert_eq!(read_json::<Sample>(&path), Some(sample()));

        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("Prisma"));
        assert!(raw.contains("\"veces\": 3"));

        cleanup(&path);
    }

    #[test]
    fn overwrites_existing_json_and_leaves_no_temporary() {
        let path = temp_file("overwrite", "datos.json");

        write_json(&path, &sample()).unwrap();

        let updated = Sample {
            nombre: "Oscuro".to_string(),
            veces: 9,
        };

        write_json(&path, &updated).unwrap();
        assert_eq!(read_json::<Sample>(&path), Some(updated));
        assert!(!path.with_extension("json.tmp").exists());

        cleanup(&path);
    }

    #[test]
    fn missing_empty_or_damaged_json_returns_none() {
        let path = temp_file("damaged", "datos.json");

        assert_eq!(read_json::<Sample>(&path), None);

        fs::write(&path, "   ").unwrap();
        assert_eq!(read_json::<Sample>(&path), None);

        fs::write(&path, "{ esto no es json").unwrap();
        assert_eq!(read_json::<Sample>(&path), None);

        // Un json bien formado de otro formato tampoco se acepta.
        fs::write(&path, r#"{"otraCosa": 42}"#).unwrap();
        assert_eq!(read_json::<Sample>(&path), None);

        cleanup(&path);
    }

    #[test]
    fn writes_create_missing_directory() {
        let path = std::env::temp_dir()
            .join("prisma_jsonfile_newdir")
            .join("otra")
            .join("carpeta")
            .join("datos.json");
        cleanup(&path);

        write_json(&path, &sample()).unwrap();
        assert!(path.is_file());

        cleanup(&path);
    }

    #[test]
    fn removing_json_is_idempotent() {
        let path = temp_file("remove", "datos.json");

        remove_json(&path).unwrap();
        write_json(&path, &sample()).unwrap();
        remove_json(&path).unwrap();
        assert!(!path.exists());
        remove_json(&path).unwrap();

        cleanup(&path);
    }
}
