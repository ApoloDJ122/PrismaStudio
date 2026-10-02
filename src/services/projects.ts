import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { ProjectFile, ProjectInfo, ProjectNode, SearchMatch } from "../types/project";

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

export function openInBrowser(path: string): Promise<void> {
  return invoke<void>("open_in_browser", { path });
}

export function pickProjectFolder(): Promise<string | null> {
  return open({
    directory: true,
    multiple: false,
    title: "Seleccionar carpeta del proyecto",
  });
}
