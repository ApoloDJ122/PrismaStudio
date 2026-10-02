use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const MAX_TREE_DEPTH: usize = 8;
const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024;
const MAX_SEARCH_RESULTS: usize = 200;

/// Archivo HTML que se abre al ejecutar el proyecto.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTarget {
    /// Ruta completa, en la misma forma que la devuelve el arbol de archivos.
    pub path: String,
    /// Ruta relativa al proyecto, para poder mostrarla en la interfaz.
    pub relative_path: String,
    /// `true` si el archivo es el `index.html` de la raiz del proyecto.
    pub is_root_index: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectNode {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub language: Option<String>,
    pub children: Vec<ProjectNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub created: bool,
    pub tree: ProjectNode,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub name: String,
    pub path: String,
    pub language: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub name: String,
    pub path: String,
    pub line: usize,
    pub preview: String,
}

fn invalid_characters() -> Vec<char> {
    vec!['<', '>', ':', '"', '/', '\\', '|', '?', '*']
}

fn reserved_names() -> Vec<&'static str> {
    vec![
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
}

/// Valida el nombre de un archivo o carpeta del proyecto.
/// Se usa tambien para el nombre del proyecto, que es un caso particular.
fn validate_entry_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err("El nombre no puede estar vacío.".to_string());
    }

    if trimmed == "." || trimmed == ".." {
        return Err("El nombre no puede ser '.' ni '..'.".to_string());
    }

    if invalid_characters().iter().any(|c| trimmed.contains(*c)) {
        return Err("El nombre no puede contener < > : \" / \\ | ? *".to_string());
    }

    if trimmed.ends_with('.') || trimmed.ends_with(' ') {
        return Err("El nombre no puede terminar en punto ni en espacio.".to_string());
    }

    let stem = trimmed.split('.').next().unwrap_or("").to_uppercase();

    if reserved_names().contains(&stem.as_str()) {
        return Err(format!("'{trimmed}' es un nombre reservado del sistema."));
    }

    Ok(trimmed.to_string())
}

fn validate_project_name(name: &str) -> Result<String, String> {
    validate_entry_name(name)
}

fn language_for(path: &Path) -> Option<&'static str> {
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    match extension.as_str() {
        "html" | "htm" => Some("html"),
        "css" => Some("css"),
        "js" | "mjs" => Some("javascript"),
        "json" => Some("json"),
        "txt" | "md" => Some("plaintext"),
        _ => None,
    }
}

fn entry_name(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn build_tree(path: &Path, depth: usize) -> Result<ProjectNode, String> {
    let mut children: Vec<ProjectNode> = Vec::new();

    if depth < MAX_TREE_DEPTH {
        let entries = fs::read_dir(path)
            .map_err(|error| format!("No se pudo leer la carpeta '{}': {error}", path.display()))?;

        for entry in entries.filter_map(|entry| entry.ok()) {
            let entry_path = entry.path();
            let name = entry_name(&entry_path);

            if name.starts_with('.') {
                continue;
            }

            if entry_path.is_dir() {
                // Una subcarpeta ilegible no debe impedir abrir el proyecto entero.
                if let Ok(node) = build_tree(&entry_path, depth + 1) {
                    children.push(node);
                }
            } else {
                children.push(ProjectNode {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    kind: "file".to_string(),
                    language: language_for(&entry_path).map(|value| value.to_string()),
                    children: Vec::new(),
                });
            }
        }
    }

    children.sort_by(|a, b| {
        let a_is_folder = a.kind == "folder";
        let b_is_folder = b.kind == "folder";

        b_is_folder
            .cmp(&a_is_folder)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(ProjectNode {
        name: entry_name(path),
        path: path.to_string_lossy().to_string(),
        kind: "folder".to_string(),
        language: None,
        children,
    })
}

fn project_info(name: String, path: &Path, created: bool) -> Result<ProjectInfo, String> {
    Ok(ProjectInfo {
        name,
        path: path.to_string_lossy().to_string(),
        created,
        tree: build_tree(path, 0)?,
    })
}

fn index_html_template(project_name: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{project_name}</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <h1>Hello World!</h1>
    <script src="script.js"></script>
  </body>
</html>
"#
    )
}

const STYLE_CSS_TEMPLATE: &str = r#"/* Estilos de tu proyecto */
body {
  font-family: system-ui, sans-serif;
}
"#;

const SCRIPT_JS_TEMPLATE: &str = r#"// JavaScript de tu proyecto
"#;

#[tauri::command]
pub fn create_web_project(name: String, parent_dir: String) -> Result<ProjectInfo, String> {
    let name = validate_project_name(&name)?;
    let parent = PathBuf::from(&parent_dir);

    if !parent.is_dir() {
        return Err(format!(
            "La ubicación '{}' no es una carpeta válida.",
            parent.display()
        ));
    }

    let project_path = parent.join(&name);

    if project_path.exists() {
        return Err(format!(
            "La carpeta '{}' ya existe. Elige otro nombre.",
            name
        ));
    }

    fs::create_dir_all(&project_path)
        .map_err(|error| format!("No se pudo crear la carpeta del proyecto: {error}"))?;

    let write_file = |file_name: &str, contents: &str| -> Result<(), String> {
        let target = project_path.join(file_name);
        fs::write(&target, contents)
            .map_err(|error| format!("No se pudo escribir '{file_name}': {error}"))
    };

    write_file("index.html", &index_html_template(&name))?;
    write_file("style.css", STYLE_CSS_TEMPLATE)?;
    write_file("script.js", SCRIPT_JS_TEMPLATE)?;

    project_info(name, &project_path, true)
}

#[tauri::command]
pub fn open_project(path: String) -> Result<ProjectInfo, String> {
    let project_path = PathBuf::from(&path);

    if !project_path.is_dir() {
        return Err(format!(
            "'{}' no es una carpeta válida.",
            project_path.display()
        ));
    }

    let name = entry_name(&project_path);
    project_info(name, &project_path, false)
}

fn canonical_project(project_path: &str) -> Result<PathBuf, String> {
    Path::new(project_path)
        .canonicalize()
        .map_err(|_| "El proyecto ya no está disponible en el disco.".to_string())
}

/// Resuelve una ruta y comprueba que esté dentro del proyecto.
fn ensure_inside_project(project_root: &Path, file_path: &str) -> Result<PathBuf, String> {
    let target = Path::new(file_path)
        .canonicalize()
        .map_err(|_| "El elemento ya no existe en el disco.".to_string())?;

    if !target.starts_with(project_root) {
        return Err("La operación debe realizarse dentro del proyecto.".to_string());
    }

    Ok(target)
}

fn read_text_file(path: &Path) -> Result<String, String> {
    let size = fs::metadata(path)
        .map_err(|_| "No se pudo leer el archivo.".to_string())?
        .len();

    if size > MAX_FILE_SIZE {
        return Err(format!(
            "El archivo supera el tamaño máximo de {} MB.",
            MAX_FILE_SIZE / (1024 * 1024)
        ));
    }

    fs::read_to_string(path).map_err(|_| "No se pudo leer el archivo.".to_string())
}

fn refresh_tree(project_path: &str) -> Result<ProjectNode, String> {
    build_tree(Path::new(project_path), 0)
}

#[tauri::command]
pub fn read_project_file(path: String, project_path: String) -> Result<ProjectFile, String> {
    let root = canonical_project(&project_path)?;
    let target = ensure_inside_project(&root, &path)?;

    if !target.is_file() {
        return Err("El elemento seleccionado no es un archivo.".to_string());
    }

    let language = language_for(&target).unwrap_or("plaintext").to_string();
    let content = read_text_file(&target)?;

    Ok(ProjectFile {
        name: entry_name(&target),
        path: target.to_string_lossy().to_string(),
        language,
        content,
    })
}

#[tauri::command]
pub fn save_project_file(
    path: String,
    content: String,
    project_path: String,
) -> Result<(), String> {
    let root = canonical_project(&project_path)?;
    let target = ensure_inside_project(&root, &path)?;

    if !target.is_file() {
        return Err("El elemento seleccionado no es un archivo.".to_string());
    }

    fs::write(&target, content).map_err(|_| "No se pudo guardar el archivo.".to_string())
}

#[tauri::command]
pub fn create_file(
    project_path: String,
    parent_path: String,
    name: String,
) -> Result<ProjectNode, String> {
    let name = validate_entry_name(&name)?;
    let root = canonical_project(&project_path)?;
    let parent_real = ensure_inside_project(&root, &parent_path)?;

    if !parent_real.is_dir() {
        return Err("El elemento seleccionado no es una carpeta.".to_string());
    }

    // Se usa la ruta mostrada al usuario (no la canonicalizada) para que las rutas
    // del arbol sean siempre las mismas que devuelve la apertura del proyecto.
    let target = Path::new(&parent_path).join(&name);

    if target.exists() {
        return Err(format!("Ya existe un elemento llamado '{name}'."));
    }

    fs::write(&target, "")
        .map_err(|_| format!("No se pudo crear el archivo '{name}'."))?;

    refresh_tree(&project_path)
}

#[tauri::command]
pub fn create_folder(
    project_path: String,
    parent_path: String,
    name: String,
) -> Result<ProjectNode, String> {
    let name = validate_entry_name(&name)?;
    let root = canonical_project(&project_path)?;
    let parent_real = ensure_inside_project(&root, &parent_path)?;

    if !parent_real.is_dir() {
        return Err("El elemento seleccionado no es una carpeta.".to_string());
    }

    let target = Path::new(&parent_path).join(&name);

    if target.exists() {
        return Err(format!("Ya existe un elemento llamado '{name}'."));
    }

    fs::create_dir(&target).map_err(|_| format!("No se pudo crear la carpeta '{name}'."))?;

    refresh_tree(&project_path)
}

#[tauri::command]
pub fn rename_entry(
    project_path: String,
    path: String,
    new_name: String,
) -> Result<ProjectNode, String> {
    let new_name = validate_entry_name(&new_name)?;
    let root = canonical_project(&project_path)?;
    let current_real = ensure_inside_project(&root, &path)?;

    if current_real == root {
        return Err("No se puede renombrar la carpeta raíz del proyecto.".to_string());
    }

    let parent = current_real
        .parent()
        .ok_or_else(|| "No se pudo determinar la carpeta del elemento.".to_string())?
        .to_path_buf();
    let target = parent.join(&new_name);

    if target == current_real {
        return refresh_tree(&project_path);
    }

    if target.exists() {
        return Err(format!("Ya existe un elemento llamado '{new_name}'."));
    }

    fs::rename(&current_real, &target).map_err(|_| {
        "No se pudo renombrar. Comprueba que el nombre sea válido y que el elemento no esté abierto en otro programa.".to_string()
    })?;

    refresh_tree(&project_path)
}

#[tauri::command]
pub fn delete_entry(project_path: String, path: String) -> Result<ProjectNode, String> {
    let root = canonical_project(&project_path)?;
    let target = ensure_inside_project(&root, &path)?;

    if target == root {
        return Err("No se puede eliminar la carpeta raíz del proyecto.".to_string());
    }

    if target.is_dir() {
        fs::remove_dir_all(&target)
            .map_err(|_| "No se pudo eliminar la carpeta. Puede que algún archivo esté en uso.".to_string())?;
    } else {
        fs::remove_file(&target)
            .map_err(|_| "No se pudo eliminar el archivo. Puede que esté en uso.".to_string())?;
    }

    refresh_tree(&project_path)
}

fn collect_files(node: &ProjectNode, depth: usize, out: &mut Vec<ProjectNode>) {
    if depth > MAX_TREE_DEPTH {
        return;
    }

    for child in &node.children {
        if child.kind == "folder" {
            collect_files(child, depth + 1, out);
        } else if child.language.is_some() {
            out.push(ProjectNode {
                name: child.name.clone(),
                path: child.path.clone(),
                kind: child.kind.clone(),
                language: child.language.clone(),
                children: Vec::new(),
            });
        }
    }
}

#[tauri::command]
pub fn search_project_files(
    project_path: String,
    query: String,
) -> Result<Vec<SearchMatch>, String> {
    let needle = query.trim().to_lowercase();

    if needle.is_empty() {
        return Ok(Vec::new());
    }

    // Se valida con la ruta canonicalizada, pero el arbol se construye desde la
    // ruta original: sus rutas deben coincidir con las que ve el explorador para
    // que los resultados de busqueda se puedan abrir en el editor.
    canonical_project(&project_path)?;
    let tree = build_tree(Path::new(&project_path), 0)?;
    let mut files = Vec::new();
    collect_files(&tree, 0, &mut files);

    let mut matches = Vec::new();

    for file in files {
        if matches.len() >= MAX_SEARCH_RESULTS {
            break;
        }

        let path = Path::new(&file.path);

        let content = match read_text_file(path) {
            Ok(content) => content,
            Err(_) => continue,
        };

        for (index, line) in content.lines().enumerate() {
            if matches.len() >= MAX_SEARCH_RESULTS {
                break;
            }

            if line.to_lowercase().contains(&needle) {
                matches.push(SearchMatch {
                    name: file.name.clone(),
                    path: file.path.clone(),
                    line: index + 1,
                    preview: line.trim().chars().take(200).collect(),
                });
            }
        }
    }

    Ok(matches)
}

// ---------------------------------------------------------------------------
// Ejecucion del proyecto
// ---------------------------------------------------------------------------

/// Busca el HTML de entrada del proyecto.
///
/// Recorre en anchura, asi que gana siempre el `index.html` mas cercano a la
/// raiz: si existe en la raiz se usa ese, y solo si falta se recurre a uno
/// dentro de una subcarpeta. Devuelve la ruta tal y como la construye el arbol
/// de archivos, para que el frontend pueda mostrarla sin transformarla.
fn find_entry_html(root: &Path) -> Option<PathBuf> {
    let mut pending: VecDeque<(PathBuf, usize)> = VecDeque::new();
    pending.push_back((root.to_path_buf(), 0));

    while let Some((folder, depth)) = pending.pop_front() {
        // Una carpeta ilegible no debe impedir encontrar el archivo de entrada.
        let entries = match fs::read_dir(&folder) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        let mut subfolders: Vec<PathBuf> = Vec::new();

        for entry in entries.flatten() {
            let entry_path = entry.path();
            let name = entry_name(&entry_path);

            if name.starts_with('.') {
                continue;
            }

            if entry_path.is_dir() {
                if depth < MAX_TREE_DEPTH {
                    subfolders.push(entry_path);
                }
            } else if name.to_lowercase() == "index.html" {
                return Some(entry_path);
            }
        }

        for subfolder in subfolders {
            pending.push_back((subfolder, depth + 1));
        }
    }

    None
}

/// Ruta del archivo de entrada respecto al proyecto, siempre con `/` como
/// separador: es un texto para mostrar en la interfaz, no una ruta real.
fn relative_to(root: &Path, target: &Path) -> String {
    match target.strip_prefix(root) {
        Ok(value) => value.to_string_lossy().replace('\\', "/"),
        Err(_) => entry_name(target),
    }
}

/// Valida el proyecto y localiza su archivo de entrada sin abrir nada.
/// La interfaz la usa para saber si el proyecto se puede ejecutar.
#[tauri::command]
pub fn resolve_run_entry(project_path: String) -> Result<RunTarget, String> {
    let (entry, _) = locate_run_entry(&project_path)?;

    Ok(entry)
}

/// Localiza el archivo de entrada comprobando el proyecto de verdad.
/// El segundo valor es la raiz canonicalizada, que hace falta para validar
/// que el archivo encontrado sigue dentro del proyecto.
fn locate_run_entry(project_path: &str) -> Result<(RunTarget, PathBuf), String> {
    if project_path.trim().is_empty() {
        return Err("No hay ningún proyecto abierto.".to_string());
    }

    let root = canonical_project(project_path)
        .map_err(|_| "No se puede acceder al proyecto.".to_string())?;

    if !root.is_dir() {
        return Err("No se puede acceder al proyecto.".to_string());
    }

    let folder = PathBuf::from(project_path);
    let entry = find_entry_html(&folder).ok_or_else(|| {
        "No se encontró index.html en este proyecto.".to_string()
    })?;

    // El archivo se busca desde la ruta mostrada al usuario, pero se valida
    // contra la raiz canonicalizada para confirmar que no se sale del proyecto.
    ensure_inside_project(&root, &entry.to_string_lossy())?;

    let is_root_index = entry
        .parent()
        .map(|parent| parent == folder.as_path())
        .unwrap_or(false);

    let target = RunTarget {
        relative_path: relative_to(&folder, &entry),
        path: entry.to_string_lossy().to_string(),
        is_root_index,
    };

    Ok((target, root))
}

/// Ejecuta el proyecto: valida todo de nuevo y abre el HTML de entrada en el
/// navegador predeterminado del sistema. No hay preview interno.
#[tauri::command]
pub fn run_project(app: AppHandle, project_path: String) -> Result<RunTarget, String> {
    let (target, _) = locate_run_entry(&project_path)?;

    app.opener()
        .open_path(target.path.clone(), None::<&str>)
        .map_err(|_| "No se pudo ejecutar el proyecto.".to_string())?;

    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("prisma_m12_{label}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn file_names(children: &[ProjectNode]) -> Vec<&str> {
        children.iter().map(|node| node.name.as_str()).collect()
    }

    fn find_node<'a>(node: &'a ProjectNode, name: &str) -> Option<&'a ProjectNode> {
        node.children.iter().find(|child| child.name == name)
    }

    fn new_project(label: &str, name: &str) -> (PathBuf, ProjectInfo) {
        let base = temp_dir(label);
        let info = create_web_project(name.to_string(), base.to_string_lossy().into()).unwrap();
        (base, info)
    }

    #[test]
    fn creates_web_project_with_linked_files() {
        let (base, info) = new_project("create", "mi-proyecto");

        assert!(info.created);
        assert_eq!(info.name, "mi-proyecto");
        assert_eq!(info.tree.kind, "folder");
        assert_eq!(file_names(&info.tree.children), vec!["index.html", "script.js", "style.css"]);

        let html = fs::read_to_string(Path::new(&info.path).join("index.html")).unwrap();
        assert!(html.contains("Hello World!"));
        assert!(html.contains("style.css"));
        assert!(html.contains("script.js"));

        let error =
            create_web_project("mi-proyecto".into(), base.to_string_lossy().into()).unwrap_err();
        assert!(error.contains("ya existe"));

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_invalid_names() {
        let base = temp_dir("invalid");

        assert!(create_web_project("   ".into(), base.to_string_lossy().into()).is_err());
        assert!(create_web_project("a/b".into(), base.to_string_lossy().into()).is_err());
        assert!(create_web_project(".".into(), base.to_string_lossy().into()).is_err());
        assert!(create_web_project("CON".into(), base.to_string_lossy().into()).is_err());
        assert!(create_web_project("x".into(), "no_existe_esta_ruta".into()).is_err());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn opens_existing_folder_and_recognizes_web_files() {
        let base = temp_dir("open");
        let project = base.join("sitio-externo");
        fs::create_dir_all(project.join("js")).unwrap();
        fs::write(project.join("pagina.HTM"), "<h1>Hola</h1>").unwrap();
        fs::write(project.join("main.css"), "body{}").unwrap();
        fs::write(project.join("js/app.mjs"), "console.log(1)").unwrap();
        fs::write(project.join("notas.txt"), "ignorar").unwrap();
        fs::write(project.join("imagen.png"), "binario").unwrap();
        fs::write(project.join(".oculto"), "ignorar").unwrap();

        let info = open_project(project.to_string_lossy().into()).unwrap();

        assert!(!info.created);
        assert_eq!(info.name, "sitio-externo");
        assert_eq!(
            file_names(&info.tree.children),
            vec!["js", "imagen.png", "main.css", "notas.txt", "pagina.HTM"]
        );

        let page = find_node(&info.tree, "pagina.HTM").unwrap();
        assert_eq!(page.language.as_deref(), Some("html"));
        assert_eq!(page.kind, "file");

        let image = find_node(&info.tree, "imagen.png").unwrap();
        assert_eq!(image.language, None);

        let folder = find_node(&info.tree, "js").unwrap();
        assert_eq!(folder.kind, "folder");
        assert_eq!(folder.children[0].language.as_deref(), Some("javascript"));

        assert!(open_project(base.join("nope").to_string_lossy().into()).is_err());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn reads_and_saves_real_file_content() {
        let (base, info) = new_project("io", "guardado");
        let index = Path::new(&info.path).join("index.html");

        let file = read_project_file(index.to_string_lossy().into(), info.path.clone()).unwrap();
        assert_eq!(file.name, "index.html");
        assert_eq!(file.language, "html");
        assert!(file.content.contains("Hello World!"));

        save_project_file(
            index.to_string_lossy().into(),
            "<h1>Editado</h1>".to_string(),
            info.path.clone(),
        )
        .unwrap();

        assert_eq!(fs::read_to_string(&index).unwrap(), "<h1>Editado</h1>");

        let outside = base.join("fuera.txt");
        fs::write(&outside, "x").unwrap();
        assert!(read_project_file(outside.to_string_lossy().into(), info.path.clone()).is_err());
        assert!(save_project_file(
            outside.to_string_lossy().into(),
            "y".to_string(),
            info.path.clone()
        )
        .is_err());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn creates_files_and_folders_and_updates_tree() {
        let (base, info) = new_project("create_entry", "arbol");
        let root = info.path.clone();

        let tree = create_file(
            root.clone(),
            root.clone(),
            "contacto.html".to_string(),
        )
        .unwrap();
        assert!(find_node(&tree, "contacto.html").is_some());
        assert!(Path::new(&root).join("contacto.html").is_file());

        let tree = create_folder(root.clone(), root.clone(), "pages".to_string()).unwrap();
        let pages = find_node(&tree, "pages").unwrap();
        assert_eq!(pages.kind, "folder");
        assert!(Path::new(&root).join("pages").is_dir());

        // carpeta anidada
        let tree = create_file(
            root.clone(),
            pages.path.clone(),
            "about.html".to_string(),
        )
        .unwrap();
        let pages = find_node(&tree, "pages").unwrap();
        assert_eq!(file_names(&pages.children), vec!["about.html"]);
        assert!(Path::new(&pages.path).join("about.html").is_file());

        // un archivo nuevo esta vacio y se puede abrir y guardar
        let created = Path::new(&root).join("contacto.html");
        let file = read_project_file(created.to_string_lossy().into(), root.clone()).unwrap();
        assert_eq!(file.content, "");
        save_project_file(
            created.to_string_lossy().into(),
            "<h1>Contacto</h1>".to_string(),
            root.clone(),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(&created).unwrap(), "<h1>Contacto</h1>");

        // nombres duplicados e invalidos
        assert!(create_file(root.clone(), root.clone(), "pages".into()).is_err());
        assert!(create_file(root.clone(), root.clone(), "a/b.html".into()).is_err());
        assert!(create_folder(root.clone(), root.clone(), "pages".into()).is_err());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn renames_files_and_folders_keeping_content() {
        let (base, info) = new_project("rename", "renombrar");
        let root = info.path.clone();
        let pages = create_folder(root.clone(), root.clone(), "pages".into()).unwrap();
        let pages_path = pages
            .children
            .iter()
            .find(|n| n.name == "pages")
            .map(|n| n.path.clone())
            .unwrap();
        let about = create_file(root.clone(), pages_path.clone(), "about.html".into()).unwrap();
        let about_path = find_node(find_node(&about, "pages").unwrap(), "about.html")
            .unwrap()
            .path
            .clone();
        fs::write(&about_path, "<h1>Nosotros</h1>").unwrap();

        let tree = rename_entry(root.clone(), about_path, "nosotros.html".into()).unwrap();
        let renamed = find_node(find_node(&tree, "pages").unwrap(), "nosotros.html");
        assert!(renamed.is_some());
        assert!(Path::new(&find_node(&tree, "pages").unwrap().path)
            .join("nosotros.html")
            .is_file());

        // renombrar una carpeta conserva su contenido
        let tree = rename_entry(root.clone(), pages_path, "paginas".into()).unwrap();
        let folder = find_node(&tree, "paginas").unwrap();
        assert_eq!(file_names(&folder.children), vec!["nosotros.html"]);

        // colisiones y protecciones
        assert!(rename_entry(root.clone(), root.clone(), "otro".into()).is_err());
        assert!(rename_entry(
            root.clone(),
            folder.path.clone(),
            "index.html".into()
        )
        .is_err());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn deletes_files_and_folders() {
        let (base, info) = new_project("delete", "borrar");
        let root = info.path.clone();
        let pages = create_folder(root.clone(), root.clone(), "pages".into()).unwrap();
        let pages_path = find_node(&pages, "pages").unwrap().path.clone();
        let tree = create_file(root.clone(), pages_path.clone(), "about.html".into()).unwrap();
        let about_path = find_node(find_node(&tree, "pages").unwrap(), "about.html")
            .unwrap()
            .path
            .clone();

        let tree = delete_entry(root.clone(), about_path).unwrap();
        assert!(find_node(find_node(&tree, "pages").unwrap(), "about.html").is_none());
        assert!(!Path::new(&pages_path).join("about.html").exists());

        // borrar una carpeta con contenido
        let tree = delete_entry(root.clone(), pages_path).unwrap();
        assert!(find_node(&tree, "pages").is_none());
        assert!(!Path::new(&root).join("pages").exists());

        // la raiz del proyecto no se puede borrar
        assert!(delete_entry(root.clone(), root.clone()).is_err());
        assert!(Path::new(&root).is_dir());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn operations_cannot_escape_the_project() {
        let (base, info) = new_project("escape", "seguro");
        let root = info.path.clone();
        let outside = base.join("fuera.txt");
        fs::write(&outside, "contenido").unwrap();

        // crear dentro de una ruta externa
        assert!(create_file(root.clone(), outside.to_string_lossy().into(), "x.html".into()).is_err());
        assert!(create_folder(root.clone(), outside.to_string_lossy().into(), "x".into()).is_err());
        // renombrar o borrar algo externo
        assert!(rename_entry(root.clone(), outside.to_string_lossy().into(), "y.txt".into()).is_err());
        assert!(delete_entry(root.clone(), outside.to_string_lossy().into()).is_err());
        assert!(Path::new(&outside).exists());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn searches_text_files_by_content() {
        let (base, info) = new_project("search", "buscar");
        let root = info.path.clone();
        let css = Path::new(&root).join("style.css");
        fs::write(&css, "body {\n  color: rebeccapurple;\n}\n").unwrap();

        let matches = search_project_files(root.clone(), "REBECCA".into()).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].name, "style.css");
        assert_eq!(matches[0].line, 2);
        assert!(matches[0].preview.contains("rebeccapurple"));

        // La ruta del resultado debe ser la del arbol, no la canonicalizada de Rust.
        assert_eq!(matches[0].path, css.to_string_lossy());
        let tree = open_project(root.clone()).unwrap();
        assert!(find_node(&tree.tree, "style.css").is_some());

        assert!(search_project_files(root.clone(), "   ".into()).unwrap().is_empty());
        assert!(search_project_files(root.clone(), "no-existe-esto".into())
            .unwrap()
            .is_empty());

        let _ = fs::remove_dir_all(&base);
    }

    // -----------------------------------------------------------------------
    // M1.4.0 - Ejecucion del proyecto
    // -----------------------------------------------------------------------

    #[test]
    fn finds_root_index_html_and_reports_it_as_root() {
        let (base, info) = new_project("run_root", "ejecutar");
        let root = info.path.clone();

        let target = resolve_run_entry(root.clone()).unwrap();

        assert!(target.is_root_index);
        assert_eq!(target.relative_path, "index.html");
        assert_eq!(target.path, Path::new(&root).join("index.html").to_string_lossy());
        // La ruta debe ser la misma clave que usa el arbol en el frontend.
        assert!(find_node(&info.tree, "index.html").is_some());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn root_index_html_wins_over_nested_one() {
        let (base, info) = new_project("run_priority", "prioridad");
        let root = info.path.clone();

        // Una subcarpeta con su propio index.html no debe desplazar al de la raiz,
        // aunque el arbol ordene las carpetas primero.
        fs::create_dir_all(Path::new(&root).join("pages")).unwrap();
        fs::write(Path::new(&root).join("pages/index.html"), "<h1>interna</h1>").unwrap();

        let target = resolve_run_entry(root.clone()).unwrap();
        assert!(target.is_root_index);
        assert_eq!(target.relative_path, "index.html");

        // Sin index.html en la raiz, se usa el mas cercano a la raiz.
        fs::remove_file(Path::new(&root).join("index.html")).unwrap();
        let nested = resolve_run_entry(root).unwrap();
        assert!(!nested.is_root_index);
        assert_eq!(nested.relative_path, "pages/index.html");

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn finds_shallowest_index_html_with_folders_of_resources() {
        let base = temp_dir("run_nested");
        let project = base.join("sitio-con-carpetas");
        fs::create_dir_all(project.join("css")).unwrap();
        fs::create_dir_all(project.join("js")).unwrap();
        fs::create_dir_all(project.join("assets/img")).unwrap();
        fs::create_dir_all(project.join("pages/dentro")).unwrap();

        fs::write(project.join("css/style.css"), "body{}").unwrap();
        fs::write(project.join("js/app.js"), "console.log(1)").unwrap();
        fs::write(project.join("assets/img/logo.png"), "binario").unwrap();
        // El HTML mas profundo debe perder frente a uno de una carpeta menos.
        fs::write(project.join("pages/index.html"), "<h1>paginas</h1>").unwrap();
        fs::write(project.join("pages/dentro/index.html"), "<h1>profundo</h1>").unwrap();

        let info = open_project(project.to_string_lossy().into()).unwrap();
        let target = resolve_run_entry(info.path.clone()).unwrap();

        assert_eq!(target.relative_path, "pages/index.html");
        assert!(!target.is_root_index);

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn reports_clear_message_when_index_html_is_missing() {
        let base = temp_dir("run_missing");
        let project = base.join("sin-html");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("notas.txt"), "sin html").unwrap();
        fs::write(project.join("estilo.css"), "body{}").unwrap();

        let info = open_project(project.to_string_lossy().into()).unwrap();
        let error = resolve_run_entry(info.path.clone()).unwrap_err();

        assert_eq!(error, "No se encontró index.html en este proyecto.");
        assert!(error.chars().all(|c| !c.is_ascii_digit()));

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn reports_clear_message_when_project_no_longer_exists() {
        let (base, info) = new_project("run_gone", "se-fue");
        let root = info.path.clone();

        fs::remove_dir_all(&root).unwrap();

        // El proyecto se todavia tiene abierto, pero su carpeta ya no esta.
        assert_eq!(
            resolve_run_entry(root.clone()).unwrap_err(),
            "No se puede acceder al proyecto."
        );
        assert_eq!(
            resolve_run_entry("   ".into()).unwrap_err(),
            "No hay ningún proyecto abierto."
        );

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn ignores_hidden_folders_when_looking_for_entry() {
        let base = temp_dir("run_hidden");
        let project = base.join("con-ocultos");
        fs::create_dir_all(project.join(".cache")).unwrap();

        fs::write(project.join(".cache/index.html"), "<h1>cache</h1>").unwrap();
        fs::write(project.join("index.html"), "<h1>real</h1>").unwrap();

        let info = open_project(project.to_string_lossy().into()).unwrap();
        let target = resolve_run_entry(info.path.clone()).unwrap();

        assert!(target.is_root_index);
        assert_eq!(target.relative_path, "index.html");

        let _ = fs::remove_dir_all(&base);
    }
}
