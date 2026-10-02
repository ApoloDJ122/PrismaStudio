mod projects;
mod session;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            projects::create_web_project,
            projects::open_project,
            projects::read_project_file,
            projects::save_project_file,
            projects::create_file,
            projects::create_folder,
            projects::rename_entry,
            projects::delete_entry,
            projects::search_project_files,
            projects::resolve_run_entry,
            projects::run_project,
            session::load_session,
            session::save_session,
            session::clear_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
