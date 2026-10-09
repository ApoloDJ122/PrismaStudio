import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import prismaLogo from "../../assets/prisma-logo.png";
import { useAnalysis } from "../../hooks/useAnalysis";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useDesigner } from "../../hooks/useDesigner";
import type { ProjectState } from "../../hooks/useProject";
import type { ProjectNode } from "../../types/project";
import type { ThemeName } from "../../types/preferences";
import CloseProjectDialog from "../ui/CloseProjectDialog";
import ConfirmDialog from "../ui/ConfirmDialog";
import Modal from "../ui/Modal";
import PromptDialog from "../ui/PromptDialog";
import AnalysisPanel from "./AnalysisPanel";
import CodeEditor, { type CodeEditorApi } from "./CodeEditor";
import FileTree, { type TreeCommand } from "./FileTree";
import SearchOverlay, { type PaletteMode } from "./SearchOverlay";
import { DesignCanvas, DesignPanel, PropertiesPanel } from "./design";
import { readProjectFile, saveProjectFile } from "../../services/projects";
import "./Workspace.css";

type Dialog =
  | { type: "new-file"; parentPath: string }
  | { type: "new-folder"; parentPath: string }
  | { type: "rename"; path: string; name: string }
  | { type: "delete"; path: string; name: string; isFolder: boolean; dirty: number }
  | { type: "close-project" }
  | { type: "close-tab"; path: string; name: string }
  | { type: "run-unsaved" }
  | null;

function relativeFolder(root: ProjectNode, folderPath: string): string {
  if (folderPath === root.path) {
    return "la raiz del proyecto";
  }

  return folderPath.replace(root.path, "").replace(/^[\\/]+/, "");
}

function Workspace({
  projectState,
  theme,
  onOpenSettings,
}: {
  projectState: ProjectState;
  theme: ThemeName;
  onOpenSettings: () => void;
}) {
  const {
    project,
    error: projectError,
    isBusy: projectBusy,
    runTarget,
    canExecute,
    execute,
    closeProject,
    clearError: clearProjectError,
  } = projectState;
  const {
    openTabs,
    activeTabIndex,
    activeTab,
    activePath,
    activeBuffer,
    activeCursor,
    isActiveDirty,
    dirtyPaths,
    hasUnsavedChanges,
    error: workspaceError,
    isBusy,
    isLoadingFile,
    isRestoring,
    reveal,
    query,
    results,
    isSearching,
    selectFile,
    selectTab,
    updateContent,
    moveCursor,
    saveActiveFile,
    saveBuffer,
    saveAll,
    createEntry,
    renameEntry,
    deleteEntry,
    setQuery,
    closeTab,
    isTabDirty,
    clearReveal,
    reportError,
    clearError: clearWorkspaceError,
    writeBuffer,
    buffers,
  } = useWorkspace(projectState);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteMode | null>(null);

  // M2.1.0 - Analisis de solo lectura del proyecto abierto.
  const analysis = useAnalysis(project);
  const [sidebarMode, setSidebarMode] = useState<"files" | "analysis">("files");

  // M2.2.0 - Diseñador visual. Los puentes se memoizan: objetos nuevos en cada
  // render harían recargar el documento y borrarían las ediciones sin aplicar.
  const projectPath = project?.path ?? "";
  const designerOptions = useMemo(() => ({
    getCssText: async (href: string | null) => {
      if (href === null) return null;
      try {
        const read = await readProjectFile(href, projectPath);
        return read.content;
      } catch {
        return null;
      }
    },
    writeCssText: async (href: string | null, text: string) => {
      if (href === null) return;
      await saveProjectFile(href, text, projectPath);
    },
  }), [projectPath]);
  const designerSaveBuffer = useCallback(
    (path: string) => saveBuffer(path),
    [saveBuffer],
  );
  const designerWorkspace = useMemo(() => ({
    activePath,
    writeBuffer,
    saveBuffer: designerSaveBuffer,
    buffers,
  }), [activePath, writeBuffer, designerSaveBuffer, buffers]);
  const designer = useDesigner(projectState, designerOptions, designerWorkspace);

  const editorApiRef = useRef<CodeEditorApi | null>(null);

  const searchInActiveFile = useCallback(() => {
    editorApiRef.current?.search();
  }, []);

  const error = projectError ?? workspaceError;

  const clearError = useCallback(() => {
    clearProjectError();
    clearWorkspaceError();
  }, [clearProjectError, clearWorkspaceError]);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setDialogError(null);
  }, []);

  // Buffers abiertos dentro de la carpeta o archivo que se va a eliminar.
  const dirtyInside = useCallback(
    (path: string) =>
      [...dirtyPaths].filter(
        (dirty) => dirty === path || dirty.startsWith(path + "\\") || dirty.startsWith(path + "/"),
      ).length,
    [dirtyPaths],
  );

  const handleCommand = useCallback(
    (command: TreeCommand) => {
      if (project === null) {
        return;
      }

      if (command.type === "open") {
        void selectFile(command.path);
        return;
      }

      if (command.type === "new-file" || command.type === "new-folder") {
        setDialog({
          type: command.type === "new-file" ? "new-file" : "new-folder",
          parentPath: command.isFolder ? command.path : project.tree.path,
        });
        setDialogError(null);
        return;
      }

      if (command.type === "rename") {
        setDialog({ type: "rename", path: command.path, name: command.name });
        setDialogError(null);
        return;
      }

      if (command.type === "delete") {
        setDialog({
          type: "delete",
          path: command.path,
          name: command.name,
          isFolder: command.isFolder,
          dirty: dirtyInside(command.path),
        });
        setDialogError(null);
      }
    },
    [dirtyInside, project, selectFile],
  );

  const handleConfirmDialog = useCallback(
    async (value: string) => {
      if (dialog === null || project === null || dialog.type === "close-project") {
        return;
      }

      setDialogError(null);

      let failure: string | null;

      if (dialog.type === "new-file" || dialog.type === "new-folder") {
        failure = await createEntry(
          dialog.type === "new-file" ? "file" : "folder",
          dialog.parentPath,
          value,
        );
      } else if (dialog.type === "rename") {
        if (value === dialog.name) {
          closeDialog();
          return;
        }

        failure = await renameEntry(dialog.path, value);
      } else if (dialog.type === "delete") {
        failure = await deleteEntry(dialog.path);
      } else {
        // Los di├ílogos de cierre y de ejecuci├│n no pasan por aqu├¡.
        return;
      }

      if (failure !== null) {
        setDialogError(failure);
        return;
      }

      closeDialog();
    },
    [closeDialog, createEntry, deleteEntry, dialog, project, renameEntry],
  );

  // `hasUnsavedChanges` viene del hook, que ya lleva la cuenta de los b├║feres
  // pendientes. No se vuelve a recorrer los buffers aqu├¡.
  const requestCloseProject = useCallback(() => {
    if (hasUnsavedChanges) {
      setDialog({ type: "close-project" });
      return;
    }

    closeProject();
  }, [closeProject, hasUnsavedChanges]);

  /*
   * M1.4.0 - Ejecuci├│n.
   *
   * Con cambios sin guardar se pregunta antes, para no ejecutar una versi├│n del
   * proyecto que difiere de la que el usuario est├í viendo.
   */
  const requestRun = useCallback(() => {
    if (hasUnsavedChanges) {
      setDialog({ type: "run-unsaved" });
      setDialogError(null);
      return;
    }

    void execute();
  }, [execute, hasUnsavedChanges]);

  const confirmRun = useCallback(
    async (saveFirst: boolean) => {
      setDialogError(null);

      if (saveFirst) {
        const failure = await saveAll();

        // Solo se ejecuta si todo se guard├│ bien: si no, el navegador abrir├¡a
        // una versi├│n del proyecto que difiere de la que se ve en pantalla.
        if (failure !== null) {
          setDialogError(failure);
          return;
        }
      }

      closeDialog();
      await execute();
    },
    [closeDialog, execute, saveAll],
  );

  const requestCloseTab = useCallback(
    (path: string, name: string) => {
      if (isTabDirty(path)) {
        setDialog({ type: "close-tab", path, name });
        setDialogError(null);
        return;
      }

      closeTab(path);
    },
    [closeTab, isTabDirty],
  );

  const confirmCloseTab = useCallback(
    async (saveFirst: boolean) => {
      if (dialog?.type !== "close-tab") {
        return;
      }

      const { path } = dialog;
      setDialogError(null);

      if (saveFirst) {
        const failure = await saveBuffer(path);

        // Solo se cierra si el guardado funcion├│: as├¡ no se pierde el trabajo.
        if (failure !== null) {
          setDialogError(failure);
          return;
        }
      }

      closeDialog();
      closeTab(path);
    },
    [closeDialog, dialog, saveBuffer],
  );

  // Atajos de teclado globales del workspace.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        setPalette(null);
        return;
      }

      if (!mod) {
        // F3 y Shift+F3 los gestiona el propio buscador de Monaco.
        return;
      }

      if (key === "s") {
        event.preventDefault();

        if (event.shiftKey) {
          void saveAll();
        } else {
          void saveActiveFile();
        }

        return;
      }

      // Ctrl+W cierra la pesta├▒a activa; Ctrl+Shift+W cierra el proyecto.
      if (key === "w") {
        event.preventDefault();

        if (event.shiftKey) {
          requestCloseProject();
        } else if (activePath !== null) {
          requestCloseTab(activePath, openTabs[activeTabIndex]?.name ?? "el archivo");
        }

        return;
      }

      // Ctrl+F busca dentro del archivo; Ctrl+P abre el buscador de archivos;
      // Ctrl+Shift+F busca en el contenido de todo el proyecto.
      if (key === "f" && !event.shiftKey) {
        event.preventDefault();
        searchInActiveFile();
        return;
      }

      if (key === "p" && !event.shiftKey) {
        event.preventDefault();
        setQuery("");
        setPalette("open");
        return;
      }

      if (key === "f" && event.shiftKey) {
        event.preventDefault();
        setPalette("search");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activePath,
    activeTabIndex,
    openTabs,
    requestCloseProject,
    requestCloseTab,
    saveActiveFile,
    saveAll,
    searchInActiveFile,
    setQuery,
  ]);

  // Aviso del navegador al cerrar la ventana con cambios pendientes.
  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  if (project === null) {
    return null;
  }

  const root = project.tree;

  return (
    <div className="workspace">
      <header className="workspace__header">
        <div className="workspace__identity">
          <img className="workspace__logo" src={prismaLogo} alt="" width={22} height={22} />
          <span className="workspace__name">
            {project.name}
            {dirtyPaths.size > 0 && (
              <span
                className="workspace__dirtyBadge"
                title={`${dirtyPaths.size} ${
                  dirtyPaths.size === 1
                    ? "archivo con cambios sin guardar"
                    : "archivos con cambios sin guardar"
                }`}
              >
                {dirtyPaths.size}
              </span>
            )}
          </span>
          <span className="workspace__path" title={project.path}>
            {project.path}
          </span>
        </div>

        <div className="workspace__actions">
          <button
            type="button"
            className={`button button--secondary ${designer.viewMode === "design" ? "button--primary" : ""}`}
            onClick={() => designer.setViewMode(designer.viewMode === "design" ? "code" : "design")}
          >
            {designer.viewMode === "design" ? "Código" : "Diseño"}
          </button>
          {designer.viewMode === "design" && (
            <button
              type="button"
              className="button button--primary"
              disabled={isBusy}
              title="Volcar el lienzo al búfer y guardar en disco"
              onClick={() => void designer.applyToBuffers({ writeBuffer, saveBuffer })}
            >
              Aplicar cambios
            </button>
          )}
          <button
            type="button"
            className="button button--secondary"
            disabled={!hasUnsavedChanges || isBusy}
            onClick={() => void saveAll()}
          >
            Guardar todo
          </button>
          <button
            type="button"
            className="button button--secondary"
            disabled={!isActiveDirty || isBusy}
            onClick={() => void saveActiveFile()}
          >
            Guardar
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!canExecute || projectBusy}
            title={
              runTarget === null
                ? "Este proyecto no tiene un index.html que ejecutar."
                : `Abrir ${runTarget.relativePath} en el navegador`
            }
            onClick={requestRun}
          >
            {projectBusy ? "Abriendo..." : "Ejecutar"}
          </button>
          <button
            type="button"
            className="button button--ghost"
            title="Cambiar de proyecto"
            onClick={requestCloseProject}
          >
            Cerrar proyecto
          </button>
          <button
            type="button"
            className="button button--ghost"
            title="Ajustes de la aplicaci├│n"
            onClick={onOpenSettings}
          >
            Ajustes
          </button>
        </div>
      </header>

      {designer.viewMode === "design" ? (
        <div className="designer">
          <aside className="designer__left" aria-label="Estructura y elementos">
            <DesignPanel designer={designer} />
          </aside>
          <main className="designer__main">
            <DesignCanvas designer={designer} />
          </main>
          <aside className="designer__right" aria-label="Propiedades">
            <PropertiesPanel designer={designer} />
          </aside>
        </div>
      ) : (
        <div className="workspace__body">
          <aside className="workspace__sidebar">
          <div className="workspace__sidebarHead">
            <div className="workspace__sidebarTabs" role="tablist" aria-label="Panel lateral">
              <button
                type="button"
                role="tab"
                aria-selected={sidebarMode === "files"}
                className={`workspace__sidebarTab ${
                  sidebarMode === "files" ? "workspace__sidebarTab--active" : ""
                }`}
                onClick={() => setSidebarMode("files")}
              >
                Archivos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarMode === "analysis"}
                className={`workspace__sidebarTab ${
                  sidebarMode === "analysis" ? "workspace__sidebarTab--active" : ""
                }`}
                onClick={() => setSidebarMode("analysis")}
              >
                Analisis
              </button>
            </div>

            <div className="workspace__sidebarActions">
              {sidebarMode === "files" ? (
                <>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    title="Nuevo archivo"
                    onClick={() => {
                      setDialog({ type: "new-file", parentPath: root.path });
                      setDialogError(null);
                    }}
                  >
                    + Archivo
                  </button>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    title="Nueva carpeta"
                    onClick={() => {
                      setDialog({ type: "new-folder", parentPath: root.path });
                      setDialogError(null);
                    }}
                  >
                    + Carpeta
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  title="Volver a recorrer el proyecto"
                  disabled={analysis.isBusy}
                  onClick={analysis.reanalyze}
                >
                  {analysis.isBusy ? "Analizando..." : "Reanalizar"}
                </button>
              )}
            </div>
          </div>

          {sidebarMode === "files" ? (
            <>
              <FileTree
                tree={root}
                activePath={activePath}
                dirtyPaths={[...dirtyPaths]}
                onCommand={handleCommand}
              />

              <div className="workspace__search">
                <input
                  className="workspace__searchInput"
                  type="search"
                  placeholder="Buscar en el proyecto (Ctrl+Shift+F)"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                    setPalette(event.currentTarget.value.trim() === "" ? null : "search");
                  }}
                />
                {isSearching && <span className="workspace__searchState">Buscando...</span>}
              </div>
            </>
          ) : (
            <AnalysisPanel
              model={analysis.model}
              isBusy={analysis.isBusy}
              error={analysis.error}
              activePath={activePath}
              onReanalyze={analysis.reanalyze}
              onOpenFile={(path, line) => void selectFile(path, line)}
            />
          )}
          </aside>

          <main className="workspace__main">
          <div className="workspace__tabbar" role="tablist" aria-label="Archivos abiertos">
            {openTabs.length === 0 ? (
              <span className="workspace__tab workspace__tab--active">
                {isRestoring ? "Recuperando..." : "Sin archivo"}
              </span>
            ) : (
              openTabs.map((tab, index) => {
                const isActive = index === activeTabIndex;
                const isDirty = isTabDirty(tab.path);

                return (
                  <span
                    key={tab.path}
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    title={tab.path}
                    className={`workspace__tab ${isActive ? "workspace__tab--active" : ""}`}
                    onClick={() => selectTab(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectTab(index);
                      }
                    }}
                  >
                    {tab.name}
                    {isDirty && " *"}
                    <span
                      className="workspace__tab-close"
                      role="button"
                      aria-label={`Cerrar ${tab.name}`}
                      onClick={(event) => {
                        // Sin esto el clic cerrar├¡a la pesta├▒a y la activar├¡a a la vez.
                        event.stopPropagation();
                        requestCloseTab(tab.path, tab.name);
                      }}
                      title="Cerrar pesta├▒a"
                    >
                      ├ù
                    </span>
                  </span>
                );
              })
            )}
          </div>

          <CodeEditor
            path={activeTab?.path ?? null}
            language={activeTab?.language ?? "plaintext"}
            content={activeBuffer?.content ?? ""}
            revealLine={reveal !== null && reveal.path === activeTab?.path ? reveal.line : null}
            theme={theme}
            apiRef={editorApiRef}
            onChange={updateContent}
            onRevealHandled={clearReveal}
            onCursorChange={(position) => {
              if (activePath !== null) {
                moveCursor(activePath, position);
              }
            }}
            onError={reportError}
          />
          </main>
        </div>
      )}

      {isLoadingFile && <p className="workspace__status">Abriendo archivo...</p>}

      {error !== null && (
        <div className="workspace__error" role="alert">
          <span>{error}</span>
          <button type="button" className="button button--ghost button--small" onClick={clearError}>
            Cerrar
          </button>
        </div>
      )}

      {palette !== null && (
        <SearchOverlay
          mode={palette}
          projectRoot={root}
          query={palette === "search" ? query : ""}
          results={results}
          isSearching={isSearching}
          onQueryChange={palette === "search" ? setQuery : () => undefined}
          onSelectFile={(path, line) => void selectFile(path, line)}
          onClose={() => {
            setPalette(null);
            setQuery("");
          }}
        />
      )}

      <div className="workspace__statusbar">
        <span className="workspace__statusbarLanguage">{activeTab?.language ?? "HTML"}</span>
        <span className="workspace__statusbarPosition">
          Ln {activeCursor?.line ?? 1}, Col {activeCursor?.column ?? 1}
        </span>
        <span className="workspace__statusbarSaveState">
          {isActiveDirty ? "Sin guardar" : "Guardado"}
        </span>
        {isRestoring && <span className="workspace__statusbarSaveState">Recuperando sesi├│n...</span>}
      </div>

      {dialog?.type === "new-file" && (
        <PromptDialog
          title="Nuevo archivo"
          description={`Se creara en ${relativeFolder(root, dialog.parentPath)}.`}
          label="Nombre del archivo"
          initialValue="nuevo.html"
          confirmLabel="Crear"
          error={dialogError}
          onConfirm={(value) => void handleConfirmDialog(value)}
          onCancel={closeDialog}
        />
      )}

      {dialog?.type === "new-folder" && (
        <PromptDialog
          title="Nueva carpeta"
          description={`Se creara en ${relativeFolder(root, dialog.parentPath)}.`}
          label="Nombre de la carpeta"
          initialValue="nueva-carpeta"
          confirmLabel="Crear"
          error={dialogError}
          onConfirm={(value) => void handleConfirmDialog(value)}
          onCancel={closeDialog}
        />
      )}

      {dialog?.type === "rename" && (
        <PromptDialog
          title="Renombrar"
          description="El contenido del archivo se conserva y se actualiza en el editor."
          label="Nuevo nombre"
          initialValue={dialog.name}
          confirmLabel="Renombrar"
          error={dialogError}
          onConfirm={(value) => void handleConfirmDialog(value)}
          onCancel={closeDialog}
        />
      )}

      {dialog?.type === "delete" && (
        <ConfirmDialog
          title={`Eliminar ${dialog.isFolder ? "carpeta" : "archivo"}`}
          message={
            dialog.dirty > 0
              ? `"${dialog.name}" contiene ${dialog.dirty} ${
                  dialog.dirty === 1 ? "archivo abierto con cambios sin guardar" : "archivos abiertos con cambios sin guardar"
                }. Al eliminarlo se perderan esos cambios.`
              : `Se eliminara permanentemente "${dialog.name}"${
                  dialog.isFolder ? " y todo su contenido" : ""
                }. Esta accion no se puede deshacer.`
          }
          confirmLabel="Eliminar"
          danger
          onConfirm={() => void handleConfirmDialog("")}
          onCancel={closeDialog}
        />
      )}

      {dialog?.type === "close-tab" && (
        <ConfirmDialog
          title="Cerrar pesta├▒a"
          message={`"${dialog.name}" tiene cambios sin guardar. ┬┐Qu├® quieres hacer con ellos?`}
          confirmLabel="Guardar y cerrar"
          extraLabel="No guardar"
          cancelLabel="Cancelar"
          onConfirm={() => void confirmCloseTab(true)}
          onExtra={() => void confirmCloseTab(false)}
          onCancel={closeDialog}
        />
      )}

      {dialog?.type === "run-unsaved" && (
        <Modal
          title="Ejecutar el proyecto"
          description={`Hay ${dirtyPaths.size} ${
            dirtyPaths.size === 1 ? "archivo con cambios sin guardar" : "archivos con cambios sin guardar"
          }. El navegador abrir├í los archivos del disco.`}
          onClose={closeDialog}
          width={440}
        >
          <div className="modal__footer">
            <button type="button" className="button button--secondary" onClick={closeDialog}>
              Cancelar
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={isBusy}
              onClick={() => void confirmRun(false)}
            >
              Ejecutar sin guardar
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={isBusy}
              onClick={() => void confirmRun(true)}
            >
              {isBusy ? "Guardando..." : "Guardar y ejecutar"}
            </button>
          </div>

          {dialogError !== null && <p className="modal__error">{dialogError}</p>}
        </Modal>
      )}

      {dialog?.type === "close-project" && (
        <CloseProjectDialog
          fileCount={dirtyPaths.size}
          isBusy={isBusy}
          onSaveAndClose={() => {
            void saveAll().then((failure) => {
              if (failure === null) {
                closeProject();
              }
            });
          }}
          onDiscardAndClose={closeProject}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}

export default Workspace;
