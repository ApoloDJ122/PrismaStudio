import { useCallback, useEffect, useState } from "react";

import { useWorkspace } from "../../hooks/useWorkspace";
import type { ProjectState } from "../../hooks/useProject";
import type { ProjectNode } from "../../types/project";
import CloseProjectDialog from "../ui/CloseProjectDialog";
import ConfirmDialog from "../ui/ConfirmDialog";
import PromptDialog from "../ui/PromptDialog";
import CodeEditor from "./CodeEditor";
import FileTree, { type TreeCommand } from "./FileTree";
import SearchOverlay, { type PaletteMode } from "./SearchOverlay";
import "./Workspace.css";

type Dialog =
  | { type: "new-file"; parentPath: string }
  | { type: "new-folder"; parentPath: string }
  | { type: "rename"; path: string; name: string }
  | { type: "delete"; path: string; name: string; isFolder: boolean; dirty: number }
  | { type: "close-project" }
  | null;

function relativeFolder(root: ProjectNode, folderPath: string): string {
  if (folderPath === root.path) {
    return "la raiz del proyecto";
  }

  return folderPath.replace(root.path, "").replace(/^[\\/]+/, "");
}

function Workspace({ projectState }: { projectState: ProjectState }) {
  const {
    project,
    error: projectError,
    isBusy: projectBusy,
    canExecute,
    execute,
    closeProject,
    clearError: clearProjectError,
  } = projectState;
  const {
    activePath,
    activeBuffer,
    isActiveDirty,
    dirtyPaths,
    hasUnsavedChanges,
    error: workspaceError,
    isBusy,
    isLoadingFile,
    reveal,
    query,
    results,
    isSearching,
    selectFile,
    updateContent,
    saveActiveFile,
    saveAll,
    createEntry,
    renameEntry,
    deleteEntry,
    setQuery,
    clearReveal,
    reportError,
    clearError: clearWorkspaceError,
  } = useWorkspace(projectState);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteMode | null>(null);

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
      } else {
        failure = await deleteEntry(dialog.path);
      }

      if (failure !== null) {
        setDialogError(failure);
        return;
      }

      closeDialog();
    },
    [closeDialog, createEntry, deleteEntry, dialog, project, renameEntry],
  );

  const requestCloseProject = useCallback(() => {
    if (hasUnsavedChanges) {
      setDialog({ type: "close-project" });
      return;
    }

    closeProject();
  }, [closeProject, hasUnsavedChanges]);

  // Atajos de teclado globales del workspace.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();

        if (event.shiftKey) {
          void saveAll();
        } else {
          void saveActiveFile();
        }
      } else if (mod && !event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPalette("open");
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setQuery("");
        setPalette("search");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveActiveFile, saveAll, setQuery]);

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
  const relativePath =
    activePath === null ? null : activePath.replace(root.path, "").replace(/^[\\/]+/, "");

  return (
    <div className="workspace">
      <header className="workspace__header">
        <div className="workspace__identity">
          <span className="workspace__name">{project.name}</span>
          <span className="workspace__path" title={project.path}>
            {project.path}
          </span>
        </div>

        <div className="workspace__actions">
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
            onClick={() => void execute()}
          >
            Ejecutar
          </button>
          <button type="button" className="button button--ghost" onClick={requestCloseProject}>
            Cerrar
          </button>
        </div>
      </header>

      <div className="workspace__body">
        <aside className="workspace__sidebar">
          <div className="workspace__sidebarHead">
            <span className="workspace__sidebarTitle">Archivos</span>
            <div className="workspace__sidebarActions">
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
            </div>
          </div>

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
        </aside>

        <main className="workspace__main">
          <div className="workspace__tabbar">
            <span className="workspace__tab workspace__tab--active">
              {activeBuffer?.name ?? "Sin archivo"}
              {isActiveDirty ? " *" : ""}
            </span>
            {relativePath !== null && <span className="workspace__tabPath">{relativePath}</span>}
          </div>

          <CodeEditor
            path={activePath}
            language={activeBuffer?.language ?? "plaintext"}
            content={activeBuffer?.content ?? ""}
            revealLine={reveal !== null && reveal.path === activePath ? reveal.line : null}
            onChange={updateContent}
            onRevealHandled={clearReveal}
            onError={reportError}
          />
        </main>
      </div>

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
