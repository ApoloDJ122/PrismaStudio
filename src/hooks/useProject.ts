import { useCallback, useEffect, useState } from "react";

import {
  createWebProject,
  openProject,
  pickProjectFolder,
  resolveRunEntry,
  runProject,
} from "../services/projects";
import { clearSession, loadSession } from "../services/session";
import type { ProjectInfo, ProjectNode } from "../types/project";
import type { RunTarget } from "../types/session";

export function messageOf(cause: unknown, fallback: string): string {
  return typeof cause === "string" && cause.length > 0 ? cause : fallback;
}

/** Ciclo de vida del proyecto: crear, abrir, recuperar, ejecutar y cerrar. */
export function useProject() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [runTarget, setRunTarget] = useState<RunTarget | null>(null);

  const applyTree = useCallback((tree: ProjectNode) => {
    setProject((current) => (current === null ? current : { ...current, tree }));
  }, []);

  const adopt = useCallback((info: ProjectInfo) => {
    setProject(info);
    setRunTarget(null);
  }, []);

  const createProject = useCallback(
    async (name: string, parentDir: string) => {
      setError(null);
      setIsBusy(true);

      try {
        adopt(await createWebProject(name, parentDir));
        return true;
      } catch (cause) {
        setError(messageOf(cause, "No se pudo crear el proyecto."));
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [adopt],
  );

  const openExistingProject = useCallback(async () => {
    setError(null);
    setIsBusy(true);

    try {
      const selected = await pickProjectFolder();

      if (selected === null) {
        return;
      }

      adopt(await openProject(selected));
    } catch (cause) {
      setError(messageOf(cause, "No se pudo abrir el proyecto."));
    } finally {
      setIsBusy(false);
    }
  }, [adopt]);

  /*
   * M1.4.0 - Recuperación al arrancar.
   *
   * Se intenta recuperar el último proyecto. Si su carpeta ya no existe se
   * borra la sesión guardada y se muestra un aviso en la pantalla inicial:
   * Prisma arranca siempre, nunca se queda bloqueado.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsRestoring(true);

      try {
        const session = await loadSession();
        const previous = session?.lastProject ?? null;

        if (cancelled || previous === null) {
          return;
        }

        try {
          const info = await openProject(previous);

          if (cancelled) {
            return;
          }

          setProject(info);
        } catch (cause) {
          console.warn("[prisma] el proyecto anterior ya no esta disponible:", cause);

          if (cancelled) {
            return;
          }

          // La sesión caducada no se conserva: se descarta para no reintentarlo
          // en cada arranque.
          await clearSession().catch(() => undefined);

          setError(
            `El proyecto anterior ya no está disponible en esta ruta, así que no se ha recuperado. Elige un proyecto para empezar.`,
          );
        }
      } catch (cause) {
        console.warn("[prisma] no se pudo leer la sesion guardada:", cause);
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * El archivo de entrada se comprueba en Rust cada vez que cambia el árbol o
   * el proyecto, para que el botón Ejecutar refleje el estado real del disco.
   */
  useEffect(() => {
    const projectPath = project?.path ?? null;

    if (projectPath === null) {
      setRunTarget(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const target = await resolveRunEntry(projectPath);

        if (!cancelled) {
          setRunTarget(target);
        }
      } catch (cause) {
        if (!cancelled) {
          setRunTarget(null);
          console.warn("[prisma] el proyecto no se puede ejecutar todavia:", cause);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project?.path, project?.tree]);

  const canExecute = project !== null && runTarget !== null;

  /**
   * Ejecuta el proyecto en el navegador del sistema. La validación completa la
   * vuelve a hacer Rust, por si el disco cambió entre la comprobación y la
   * pulsación. Devuelve el error, o `null` si se ejecutó.
   */
  const execute = useCallback(async (): Promise<string | null> => {
    const current = project;

    if (current === null) {
      return "No hay ningún proyecto abierto.";
    }

    setIsBusy(true);

    try {
      const target = await runProject(current.path);
      setRunTarget(target);
      return null;
    } catch (cause) {
      const message = messageOf(cause, "No se pudo ejecutar el proyecto.");
      setError(message);

      // El proyecto puede haber cambiado en el disco: se vuelve a comprobar.
      resolveRunEntry(current.path)
        .then(setRunTarget)
        .catch(() => setRunTarget(null));

      return message;
    } finally {
      setIsBusy(false);
    }
  }, [project]);

  /*
   * Cerrar el proyecto es una decisión deliberada: se olvida la sesión para
   * que al reabrir Prisma no aparezca un proyecto que el usuario ya cerró.
   */
  const closeProject = useCallback(() => {
    setProject(null);
    setRunTarget(null);
    setError(null);

    void clearSession().catch((cause: unknown) => {
      console.warn("[prisma] no se pudo borrar la sesion guardada:", cause);
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    project,
    error,
    isBusy,
    isRestoring,
    runTarget,
    canExecute,
    createProject,
    openExistingProject,
    execute,
    closeProject,
    applyTree,
    clearError,
  };
}

export type ProjectState = ReturnType<typeof useProject>;
