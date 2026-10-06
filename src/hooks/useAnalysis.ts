import { useCallback, useEffect, useState } from "react";

import { analyzeProject } from "../analysis/analyze";
import type { AnalyzeProjectInput, ReadFailure } from "../analysis/analyze";
import {
  DEFAULT_IGNORED_DIRS,
  buildFileModels,
  groupFiles,
  readableFiles,
} from "../analysis/scan";
import type { ProjectModel } from "../analysis/types";
import { readProjectFile, scanProjectFiles } from "../services/projects";
import { messageOf } from "./useProject";

export interface AnalysisState {
  /** Modelo del proyecto analizado, o `null` si todavia no hay ninguno. */
  model: ProjectModel | null;
  /** `true` mientras se recorre el proyecto. */
  isBusy: boolean;
  /** Motivo del ultimo fallo, o `null` si no hubo ninguno. */
  error: string | null;
  /** Vuelve a recorrer el proyecto desde cero. */
  reanalyze: () => void;
}

/**
 * Recorre el proyecto abierto y lo convierte en un `ProjectModel`.
 *
 * El analisis solo lectura: se recorren los nombres de los archivos y se leen
 * los que interesan, sin escribir ni borrar nada. Si un archivo no se puede
 * leer se anota y se sigue con el resto, y solo se marca error cuando falla el
 * propio recorrido.
 *
 * Se ejecuta al abrir un proyecto y cuando se pide recargarlo. El resultado no
 * se guarda en el disco: vive en memoria hasta que se cierra el proyecto.
 */
export function useAnalysis(
  project: { name: string; path: string } | null,
): AnalysisState {
  const [model, setModel] = useState<ProjectModel | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const rootPath = project?.path ?? null;
  const projectName = project?.name ?? "";

  useEffect(() => {
    if (rootPath === null) {
      setModel(null);
      setError(null);
      setBusy(false);
      return;
    }

    const path = rootPath;
    const name = projectName;
    let cancelled = false;
    setBusy(true);
    setError(null);

    async function analyze(): Promise<void> {
      try {
        const scan = await scanProjectFiles(path, DEFAULT_IGNORED_DIRS);

        if (cancelled) {
          return;
        }

        const files = buildFileModels(scan.files);
        const contents: Record<string, string> = {};
        const readFailures: ReadFailure[] = [];

        for (const file of readableFiles(groupFiles(files))) {
          try {
            const read = await readProjectFile(file.path, path);

            if (cancelled) {
              return;
            }

            contents[file.path] = read.content;
          } catch (cause) {
            readFailures.push({
              path: file.path,
              relativePath: file.relativePath,
              message: messageOf(cause, "no se pudo leer"),
            });
          }
        }

        if (cancelled) {
          return;
        }

        const input: AnalyzeProjectInput = {
          rootPath: path,
          name,
          files,
          contents,
          readFailures,
          scanWarnings: scan.warnings,
          truncated: scan.truncated,
        };

        setModel(analyzeProject(input));
        setBusy(false);
      } catch (cause) {
        if (!cancelled) {
          setModel(null);
          setError(messageOf(cause, "No se pudo analizar el proyecto."));
          setBusy(false);
        }
      }
    }

    void analyze();

    return () => {
      cancelled = true;
    };
  }, [rootPath, projectName, attempt]);

  const reanalyze = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { model, isBusy, error, reanalyze };
}
