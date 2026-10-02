import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { ProjectFile, ProjectInfo, ProjectNode, SearchMatch } from "../types/project";
import type { RunTarget } from "../types/session";

export function createWebProject(name: string, parentDir: string): Promise<ProjectInfo> {
  return invoke<ProjectInfo>("create_web_project", { name, parentDir });
}

export function openProject(path: string): Promise<ProjectInfo> {
  return invoke<ProjectInfo>("open_project", { path });
}

export function readProjectFile(path: string, projectPath: string): Promise<ProjectFile> {
  return invoke<ProjectFile>("read_project_file", { path, projectPath });
}

export function saveProjectFile(
  path: string,
  content: string,
  projectPath: string,
): Promise<void> {
  return invoke<void>("save_project_file", { path, content, projectPath });
}

export function createFile(
  projectPath: string,
  parentPath: string,
  name: string,
): Promise<ProjectNode> {
  return invoke<ProjectNode>("create_file", { projectPath, parentPath, name });
}

export function createFolder(
  projectPath: string,
  parentPath: string,
  name: string,
): Promise<ProjectNode> {
  return invoke<ProjectNode>("create_folder", { projectPath, parentPath, name });
}

export function renameEntry(
  projectPath: string,
  path: string,
  newName: string,
): Promise<ProjectNode> {
  return invoke<ProjectNode>("rename_entry", { projectPath, path, newName });
}

export function deleteEntry(projectPath: string, path: string): Promise<ProjectNode> {
  return invoke<ProjectNode>("delete_entry", { projectPath, path });
}

export function searchProjectFiles(
  projectPath: string,
  query: string,
): Promise<SearchMatch[]> {
  return invoke<SearchMatch[]>("search_project_files", { projectPath, query });
}

/** Comprueba si el proyecto se puede ejecutar y devuelve su archivo de entrada. */
export function resolveRunEntry(projectPath: string): Promise<RunTarget> {
  return invoke<RunTarget>("resolve_run_entry", { projectPath });
}

/** Valida el proyecto y abre su archivo HTML en el navegador del sistema. */
export function runProject(projectPath: string): Promise<RunTarget> {
  return invoke<RunTarget>("run_project", { projectPath });
}

export function pickProjectFolder(): Promise<string | null> {
  return open({
    directory: true,
    multiple: false,
    title: "Seleccionar carpeta del proyecto",
  });
}
