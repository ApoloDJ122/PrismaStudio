import { useCallback, useState } from "react";

import {
  createWebProject,
  openInBrowser,
  openProject,
  pickProjectFolder,
} from "../services/projects";
import type { ProjectInfo, ProjectNode } from "../types/project";

export function messageOf(cause: unknown, fallback: string): string {
  return typeof cause === "string" && cause.length > 0 ? cause : fallback;
}

function findIndexHtml(node: ProjectNode): string | null {
  for (const child of node.children) {
    if (child.kind === "folder") {
      const nested = findIndexHtml(child);
      if (nested !== null) {
        return nested;
      }
    } else if (child.name.toLowerCase() === "index.html") {
      return child.path;
    }
  }

  return null;
}

/** Ciclo de vida del proyecto: crear, abrir, refrescar el arbol, ejecutar y cerrar. */
export function useProject() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const applyTree = useCallback((tree: ProjectNode) => {
    setProject((current) => (current === null ? current : { ...current, tree }));
  }, []);

  const createProject = useCallback(async (name: string, parentDir: string) => {
    setError(null);
    setIsBusy(true);

    try {
      setProject(await createWebProject(name, parentDir));
      return true;
    } catch (cause) {
      setError(messageOf(cause, "No se pudo crear el proyecto."));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const openExistingProject = useCallback(async () => {
    setError(null);
    setIsBusy(true);

    try {
      const selected = await pickProjectFolder();

      if (selected === null) {
        return;
      }

      setProject(await openProject(selected));
    } catch (cause) {
      setError(messageOf(cause, "No se pudo abrir el proyecto."));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const execute = useCallback(async () => {
    if (project === null) {
      return;
    }

    const entry = findIndexHtml(project.tree);

    if (entry === null) {
      setError("El proyecto no tiene un archivo index.html para ejecutar.");
      return;
    }

    setError(null);

    try {
      await openInBrowser(entry);
    } catch (cause) {
      setError(messageOf(cause, "No se pudo ejecutar el proyecto."));
    }
  }, [project]);

  const closeProject = useCallback(() => {
    setProject(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    project,
    error,
    isBusy,
    canExecute: project !== null && findIndexHtml(project.tree) !== null,
    createProject,
    openExistingProject,
    execute,
    closeProject,
    applyTree,
    clearError,
  };
}

export type ProjectState = ReturnType<typeof useProject>;
