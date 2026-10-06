import { useMemo } from "react";

import { DEFAULT_IGNORED_DIRS } from "../../analysis/scan";
import type { AnalysisWarning, ProjectModel } from "../../analysis/types";
import "./AnalysisPanel.css";

interface AnalysisPanelProps {
  model: ProjectModel | null;
  isBusy: boolean;
  error: string | null;
  /** Ruta completa del archivo abierto en el editor, para marcarlo. */
  activePath: string | null;
  onReanalyze: () => void;
  /** Abre un archivo en el editor, en la linea indicada. */
  onOpenFile: (path: string, line: number) => void;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Panel lateral con el resultado del analisis del proyecto.
 *
 * Es una vista de solo lectura: sirve para ver que hay en el proyecto, que
 * problemas ha encontrado y saltar a cada archivo. No modifica nada de lo que
 * muestra; el proyecto sigue siendo el de disco.
 */
function AnalysisPanel({
  model,
  isBusy,
  error,
  activePath,
  onReanalyze,
  onOpenFile,
}: AnalysisPanelProps) {
  // Relativa -> completa, para poder abrir el archivo desde un aviso.
  const pathsByRelative = useMemo(() => {
    const index = new Map<string, string>();

    for (const file of model?.files ?? []) {
      index.set(file.relativePath, file.path);
    }

    return index;
  }, [model]);

  if (error !== null) {
    return (
      <div className="analysis">
        <p className="analysis__error" role="alert">
          {error}
        </p>
        <button type="button" className="button button--secondary" onClick={onReanalyze}>
          Volver a intentar
        </button>
      </div>
    );
  }

  if (model === null) {
    return (
      <div className="analysis">
        <p className="analysis__empty">
          {isBusy ? "Analizando el proyecto..." : "Todavia no hay ningun analisis."}
        </p>
        {!isBusy && (
          <button type="button" className="button button--secondary" onClick={onReanalyze}>
            Analizar
          </button>
        )}
      </div>
    );
  }

  const { analysis } = model;

  const open = (relativePath: string, line: number) => {
    const path = pathsByRelative.get(relativePath);

    if (path !== undefined) {
      onOpenFile(path, line);
    }
  };

  return (
    <div className="analysis">
      {isBusy && <p className="analysis__busy">Actualizando el analisis...</p>}

      <div className="analysis__summary">
        <span className="analysis__figure">
          <strong>{analysis.documentCount}</strong>
          {analysis.documentCount === 1 ? " documento" : " documentos"}
        </span>
        <span className="analysis__figure">
          <strong>{analysis.stylesheetCount}</strong>
          {analysis.stylesheetCount === 1 ? " hoja" : " hojas"}
        </span>
        <span className="analysis__figure">
          <strong>{analysis.scriptCount}</strong>
          {analysis.scriptCount === 1 ? " script" : " scripts"}
        </span>
        <span className="analysis__figure">
          <strong>{analysis.elementCount}</strong> elementos
        </span>
        <span className="analysis__figure">
          <strong>{analysis.ruleCount}</strong>
          {analysis.ruleCount === 1 ? " regla" : " reglas"}
        </span>
        <span className="analysis__figure">
          <strong>{analysis.warningCount}</strong>
          {analysis.warningCount === 1 ? " aviso" : " avisos"}
        </span>
      </div>

      <section className="analysis__section">
        <h3 className="analysis__title">Documentos</h3>
        <ul className="analysis__list">
          {model.documents.map((document) => (
            <li key={document.id}>
              <button
                type="button"
                className={`analysis__item ${
                  document.filePath === activePath ? "analysis__item--active" : ""
                }`}
                title={document.filePath}
                onClick={() => onOpenFile(document.filePath, 1)}
              >
                <span className="analysis__itemText">
                  <span className="analysis__itemName">{document.relativePath}</span>
                  <span className="analysis__itemMeta">
                    {document.type === "blade" ? "Blade" : "HTML"} ·{" "}
                    {plural(document.elementCount, "elemento", "elementos")}
                    {document.title === null ? "" : ` · ${document.title}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="analysis__section">
        <h3 className="analysis__title">Hojas de estilo</h3>
        <ul className="analysis__list">
          {model.stylesheets.map((sheet) => (
            <li key={sheet.file.relativePath}>
              <button
                type="button"
                className={`analysis__item ${
                  sheet.file.path === activePath ? "analysis__item--active" : ""
                }`}
                title={sheet.file.path}
                onClick={() => onOpenFile(sheet.file.path, 1)}
              >
                <span className="analysis__itemText">
                  <span className="analysis__itemName">{sheet.file.relativePath}</span>
                  <span className="analysis__itemMeta">
                    {plural(sheet.ruleCount, "regla", "reglas")}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {model.stylesheets.length === 0 && (
            <li className="analysis__note">Este proyecto no tiene hojas de estilo.</li>
          )}
        </ul>
      </section>

      <section className="analysis__section">
        <h3 className="analysis__title">Scripts detectados</h3>
        <ul className="analysis__list">
          {model.scripts.map((script) => (
            <li key={script.relativePath}>
              <button
                type="button"
                className={`analysis__item ${
                  script.path === activePath ? "analysis__item--active" : ""
                }`}
                title={script.path}
                onClick={() => onOpenFile(script.path, 1)}
              >
                <span className="analysis__itemText">
                  <span className="analysis__itemName">{script.relativePath}</span>
                  <span className="analysis__itemMeta">
                    {script.type === "typescript" ? "TypeScript" : "JavaScript"} · no se analiza
                  </span>
                </span>
              </button>
            </li>
          ))}
          {model.scripts.length === 0 && (
            <li className="analysis__note">Este proyecto no tiene scripts.</li>
          )}
        </ul>
      </section>

      <section className="analysis__section">
        <h3 className="analysis__title">Avisos ({analysis.warningCount})</h3>
        <ul className="analysis__list">
          {model.warnings.map((warning) => (
            <li key={warning.id}>{renderWarning(warning, open)}</li>
          ))}
          {model.warnings.length === 0 && (
            <li className="analysis__note">No se ha encontrado ningun problema.</li>
          )}
        </ul>
      </section>

      <p className="analysis__footnote">
        Carpetas ignoradas: {DEFAULT_IGNORED_DIRS.join(", ")}. El analisis es de solo
        lectura: no cambia ningun archivo del proyecto.
      </p>
    </div>
  );
}

/**
 * Un aviso. Si no sabe de que archivo viene, como los avisos del recorrido de
 * carpetas, se muestra como texto plano porque no hay a donde saltar.
 */
function renderWarning(
  warning: AnalysisWarning,
  open: (relativePath: string, line: number) => void,
) {
  const file = warning.file;
  const where =
    file === null ? "proyecto" : `${file}${warning.line > 0 ? `:${warning.line}` : ""}`;

  const body = (
    <>
      <span className={`analysis__severity analysis__severity--${warning.severity}`} />
      <span className="analysis__itemText">
        <span className="analysis__warningMessage">{warning.message}</span>
        <span className="analysis__warningWhere">{where}</span>
      </span>
    </>
  );

  if (file === null) {
    return <div className="analysis__item analysis__item--static">{body}</div>;
  }

  return (
    <button
      type="button"
      className="analysis__item"
      title={`Abrir ${where}`}
      onClick={() => open(file, warning.line)}
    >
      {body}
    </button>
  );
}

export default AnalysisPanel;
