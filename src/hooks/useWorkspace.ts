import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createFile as createFileRequest,
  createFolder as createFolderRequest,
  deleteEntry as deleteEntryRequest,
  readProjectFile,
  renameEntry as renameEntryRequest,
  saveProjectFile,
  searchProjectFiles,
} from "../services/projects";
import { loadSession, saveSession } from "../services/session";
import type { FileBuffer, ProjectNode, SearchMatch } from "../types/project";
import type { SessionState } from "../types/session";
import {
  buildSessionState,
  externalChangeMessage,
  findNodeByPath,
  isSamePathOrInside,
  nextActiveIndex,
  parentOf,
  removeBuffersInside,
  removeCursorsInside,
  rekeyBuffers,
  rekeyCursors,
  rekeyTabs,
  restoredActiveIndex,
  restorableTabs,
  tabsInside,
  withoutKey,
  type Buffers,
  type CursorMap,
  type CursorPosition,
  type OpenTab,
} from "../workspace/state";
import { messageOf, type ProjectState } from "./useProject";

export type { OpenTab } from "../workspace/state";

/** Cuantas pestañas se recuperan de la sesión. Evita restaurar una lista absurda. */
const MAX_RESTORED_TABS = 30;

/** Espera antes de escribir la sesión en disco, para no escribir en cada pulsación. */
const SESSION_SAVE_DELAY = 500;

/** Estado del editor y operaciones sobre los archivos del proyecto abierto. */
export function useWorkspace(projectState: ProjectState) {
  const { project, applyTree } = projectState;
  const projectPath = project?.path ?? null;

  const [buffers, setBuffers] = useState<Buffers>({});
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const [cursors, setCursors] = useState<CursorMap>({});
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const activePath = openTabs[activeTabIndex]?.path ?? null;

  const [reveal, setReveal] = useState<{ path: string; line: number } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // El ultimo error se guarda tambien en una referencia para poder devolverlo
  // de inmediato a quien lanzo la operacion, sin esperar al siguiente render.
  const lastErrorRef = useRef<string | null>(null);

  const reportError = useCallback((message: string) => {
    lastErrorRef.current = message;
    setError(message);
  }, []);

  const clearError = useCallback(() => {
    lastErrorRef.current = null;
    setError(null);
  }, []);

  /*
   * Las pestañas y el índice activo se guardan además en referencias. Las
   * operaciones llegan desde manejadores de eventos y esperas, donde el estado
   * del render que creó la función puede ya estar obsoleto.
   */
  const projectRef = useRef(project);
  const buffersRef = useRef(buffers);
  const tabsRef = useRef(openTabs);
  const indexRef = useRef(activeTabIndex);

  const writeTabs = useCallback((tabs: OpenTab[]) => {
    tabsRef.current = tabs;
    setOpenTabs(tabs);
  }, []);

  const writeIndex = useCallback((index: number) => {
    indexRef.current = index;
    setActiveTabIndex(index);
  }, []);

  const writeBuffers = useCallback((buffers: Buffers) => {
    buffersRef.current = buffers;
    setBuffers(buffers);
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const selectFile = useCallback(
    async (path: string, revealLine?: number) => {
      const current = projectRef.current;

      if (current === null) {
        return;
      }

      clearError();

      if (revealLine !== undefined) {
        setReveal({ path, line: revealLine });
      }

      // Si ya está abierto, solo se activa su pestaña.
      const existing = tabsRef.current.findIndex((tab) => tab.path === path);

      if (existing >= 0) {
        writeIndex(existing);
        return;
      }

      const existingBuffer = buffersRef.current[path];
      if (existingBuffer !== undefined) {
        const tab: OpenTab = { path, name: existingBuffer.name, language: existingBuffer.language };
        const tabsNow = tabsRef.current;
        const next = [...tabsNow, tab];
        writeTabs(next);
        writeIndex(next.length - 1);
        return;
      }

      setIsLoadingFile(true);

      try {
        const file = await readProjectFile(path, current.path);

        // Se indexa por la ruta del arbol, no por la que devuelve Rust: en Windows
        // Rust entrega rutas canonicalizadas y no coincidirian con las del arbol.
        const buffer: FileBuffer = {
          name: file.name,
          language: file.language,
          content: file.content,
          savedContent: file.content,
        };

        const tab: OpenTab = { path, name: file.name, language: file.language };

        // Mientras se leía el archivo puede haberse abierto otro: se vuelve a mirar.
        const tabsNow = tabsRef.current;
        const alreadyOpen = tabsNow.findIndex((item) => item.path === path);

        if (alreadyOpen >= 0) {
          writeIndex(alreadyOpen);
          return;
        }

        writeBuffers({ ...buffersRef.current, [path]: buffer });

        const next = [...tabsNow, tab];
        writeTabs(next);
        writeIndex(next.length - 1);
      } catch (cause) {
        reportError(messageOf(cause, "No se pudo abrir el archivo."));
      } finally {
        setIsLoadingFile(false);
      }
    },
    [clearError, reportError, writeBuffers, writeIndex, writeTabs],
  );

  const selectTab = useCallback(
    (index: number) => {
      if (index < 0 || index >= tabsRef.current.length || index === indexRef.current) {
        return;
      }

      writeIndex(index);
    },
    [writeIndex],
  );

  const updateContent = useCallback(
    (content: string) => {
      const path = tabsRef.current[indexRef.current]?.path ?? null;

      if (path === null) {
        return;
      }

      setBuffers((current) => {
        const buffer = current[path];

        if (buffer === undefined) {
          return current;
        }

        const next = { ...current, [path]: { ...buffer, content } };
        buffersRef.current = next;
        return next;
      });
    },
    [],
  );

  const moveCursor = useCallback((path: string, position: CursorPosition) => {
    setCursors((current) => {
      const previous = current[path];

      if (
        previous !== undefined &&
        previous.line === position.line &&
        previous.column === position.column
      ) {
        return current;
      }

      return { ...current, [path]: position };
    });
  }, []);

  const dirtyPaths = useMemo(() => {
    const paths = new Set<string>();

    for (const [path, buffer] of Object.entries(buffers)) {
      if (buffer.content !== buffer.savedContent) {
        paths.add(path);
      }
    }

    return paths;
  }, [buffers]);

  const hasUnsavedChanges = dirtyPaths.size > 0;

  const activeTab = openTabs[activeTabIndex];
  const activeBuffer = activeTab ? buffers[activeTab.path] : undefined;
  const isActiveDirty =
    activeBuffer !== undefined && activeBuffer.content !== activeBuffer.savedContent;
  const activeCursor = activePath === null ? undefined : cursors[activePath];

  /** Guarda un archivo. Devuelve null si se guardo o el mensaje de error. */
  const saveBuffer = useCallback(
    async (path: string): Promise<string | null> => {
      const current = projectRef.current;
      const buffer = buffersRef.current[path];

      if (current === null || buffer === undefined || buffer.content === buffer.savedContent) {
        return null;
      }

      /*
       * M1.5.0 - Cambios externos.
       *
       * Antes de escribir se comprueba que el archivo siga igual que cuando se
       * abrió. Si otra persona o programa lo ha tocado, no se sobrescribe: se
       * avisa, porque perder el trabajo de fuera no es un precio aceptable por
       * guardar una pulsación antes. Si el archivo ya no se puede leer, se
       * intenta guardar igualmente y es Rust quien informa del problema real.
       */
      try {
        const onDisk = await readProjectFile(path, current.path);
        const conflict = externalChangeMessage({
          name: buffer.name,
          loaded: buffer.savedContent,
          onDisk: onDisk.content,
        });

        if (conflict !== null) {
          reportError(conflict);
          return conflict;
        }
      } catch {
        // Sin lectura no se puede comparar. Se deja que la escritura falle sola.
      }

      try {
        await saveProjectFile(path, buffer.content, current.path);
      } catch (cause) {
        const message = messageOf(cause, "No se pudo guardar el archivo.");
        reportError(message);
        return message;
      }

      setBuffers((buffersNow) => {
        const saved = buffersNow[path];
        return saved === undefined
          ? buffersNow
          : { ...buffersNow, [path]: { ...saved, savedContent: saved.content } };
      });

      return null;
    },
    [reportError],
  );

  const saveActiveFile = useCallback(async () => {
    const path = tabsRef.current[indexRef.current]?.path ?? null;

    if (path === null) {
      return null;
    }

    setIsBusy(true);
    try {
      return await saveBuffer(path);
    } finally {
      setIsBusy(false);
    }
  }, [saveBuffer]);

  /** Guarda todos los archivos pendientes. Devuelve null o el error que lo detuvo. */
  const saveAll = useCallback(async (): Promise<string | null> => {
    setIsBusy(true);

    try {
      for (const path of [...dirtyPaths]) {
        const failure = await saveBuffer(path);

        if (failure !== null) {
          return failure;
        }
      }

      return null;
    } finally {
      setIsBusy(false);
    }
  }, [dirtyPaths, saveBuffer]);

  const runMutation = useCallback(
    async (
      action: () => Promise<ProjectNode>,
      fallbackError: string,
    ): Promise<{ tree: ProjectNode | null; error: string | null }> => {
      setIsBusy(true);

      try {
        const tree = await action();
        clearError();
        applyTree(tree);
        return { tree, error: null };
      } catch (cause) {
        const message = messageOf(cause, fallbackError);
        reportError(message);
        return { tree: null, error: message };
      } finally {
        setIsBusy(false);
      }
    },
    [applyTree, clearError, reportError],
  );

  /** Crea un archivo o una carpeta. Devuelve null si funciono o el error. */
  const createEntry = useCallback(
    async (
      kind: "file" | "folder",
      parentPath: string,
      name: string,
    ): Promise<string | null> => {
      const current = projectRef.current;

      if (current === null) {
        return null;
      }

      const { tree, error } = await runMutation(
        () =>
          kind === "file"
            ? createFileRequest(current.path, parentPath, name)
            : createFolderRequest(current.path, parentPath, name),
        kind === "file" ? "No se pudo crear el archivo." : "No se pudo crear la carpeta.",
      );

      if (tree === null) {
        return error;
      }

      // Un archivo nuevo compatible se abre directamente en el editor.
      if (kind === "file") {
        const created = findNodeByPath(tree, parentPath)?.children.find(
          (child) => child.name === name,
        );

        if (created !== undefined && created.language !== null) {
          await selectFile(created.path);
        }
      }

      return null;
    },
    [runMutation, selectFile],
  );

  const renameEntry = useCallback(
    async (path: string, newName: string): Promise<string | null> => {
      const current = projectRef.current;

      if (current === null) {
        return null;
      }

      const { tree, error } = await runMutation(
        () => renameEntryRequest(current.path, path, newName),
        "No se pudo renombrar el elemento.",
      );

      if (tree === null) {
        return error;
      }

      // La nueva ruta se localiza en el arbol devuelto, sin reconstruirla a mano.
      const renamedNode = findNodeByPath(tree, parentOf(path))?.children.find(
        (child) => child.name === newName,
      );

      if (renamedNode === undefined) {
        return null;
      }

      const renamedPath = renamedNode.path;
      const language = renamedNode.language ?? "plaintext";

      writeBuffers(rekeyBuffers(buffersRef.current, path, renamedPath, newName));

      const tabs = tabsRef.current;

      if (tabsInside(tabs, path).length > 0) {
        writeTabs(rekeyTabs(tabs, path, renamedPath, newName, language));
      }

      setCursors((current_) => rekeyCursors(current_, path, renamedPath));

      // El índice activo no cambia: el número de pestañas sigue siendo el mismo.
      return null;
    },
    [runMutation, writeBuffers, writeTabs],
  );

  const deleteEntry = useCallback(
    async (path: string): Promise<string | null> => {
      const current = projectRef.current;

      if (current === null) {
        return null;
      }

      const { error } = await runMutation(
        () => deleteEntryRequest(current.path, path),
        "No se pudo eliminar el elemento.",
      );

      if (error !== null) {
        return error;
      }

      const tabs = tabsRef.current;
      const removed = tabsInside(tabs, path);

      writeBuffers(removeBuffersInside(buffersRef.current, path));

      if (removed.length > 0) {
        writeTabs(tabs.filter((item) => !isSamePathOrInside(item.path, path)));
        writeIndex(nextActiveIndex(tabs, removed.map((item) => item.path), indexRef.current));
      }

      setCursors((current) => removeCursorsInside(current, path));

      return null;
    },
    [runMutation, writeBuffers, writeIndex, writeTabs],
  );

  /** Cierra una pestaña y descarta su búfer. Decide antes la interfaz si hay cambios. */
  const closeTab = useCallback(
    (path: string) => {
      const tabs = tabsRef.current;

      if (!tabs.some((item) => item.path === path)) {
        return;
      }

      writeTabs(tabs.filter((item) => item.path !== path));
      writeIndex(nextActiveIndex(tabs, [path], indexRef.current));
      writeBuffers(withoutKey(buffersRef.current, path));
      setCursors((current) => withoutKey(current, path));
    },
    [writeBuffers, writeIndex, writeTabs],
  );

  const isTabDirty = useCallback(
    (path: string) => {
      const buffer = buffersRef.current[path];
      return buffer !== undefined && buffer.content !== buffer.savedContent;
    },
    [],
  );

  const resetWorkspace = useCallback(() => {
    writeBuffers({});
    writeTabs([]);
    writeIndex(-1);
    setCursors({});
    setReveal(null);
    setQuery("");
    setResults([]);
    setIsSearching(false);
    clearError();
  }, [clearError, writeBuffers, writeIndex, writeTabs]);

  useEffect(() => {
    if (project === null) {
      resetWorkspace();
    }
  }, [project, resetWorkspace]);

  // -------------------------------------------------------------------------
  // M1.4.0 - Recuperación y persistencia de la sesión
  // -------------------------------------------------------------------------

  /** Vuelve a abrir las pestañas de la sesión que sigan existiendo en el proyecto. */
  const restoreSession = useCallback(
    async (session: SessionState) => {
      const current = projectRef.current;

      if (current === null) {
        return;
      }

      const wanted = restorableTabs(session, current.tree).slice(0, MAX_RESTORED_TABS);

      if (wanted.length === 0) {
        return;
      }

      setIsRestoring(true);

      const restoredBuffers: Buffers = {};
      const restoredTabs: OpenTab[] = [];
      const restoredCursors: CursorMap = {};
      const dropped: string[] = [];

      for (const tab of wanted) {
        try {
          const file = await readProjectFile(tab.path, current.path);

          restoredBuffers[tab.path] = {
            name: file.name,
            language: file.language,
            content: file.content,
            savedContent: file.content,
          };
          restoredTabs.push({ path: tab.path, name: file.name, language: file.language });

          if (tab.line > 0) {
            restoredCursors[tab.path] = { line: tab.line, column: 1 };
          }
        } catch {
          // Un archivo que ya no se puede leer no impide recuperar el resto.
          dropped.push(tab.name);
        }
      }

      if (restoredTabs.length > 0) {
        writeBuffers(restoredBuffers);
        writeTabs(restoredTabs);

        const active = session.activePath;

        writeIndex(restoredActiveIndex(restoredTabs, session));
        setCursors(restoredCursors);

        if (active !== null && !restoredTabs.some((item) => item.path === active)) {
          const activeName = session.openTabs.find((tab) => tab.path === active)?.name;
          dropped.push(activeName ?? active);
        }
      }

      if (dropped.length > 0) {
        reportError(
          `No se pudieron recuperar estos archivos porque ya no están disponibles: ${dropped.join(", ")}.`,
        );
      }

      setIsRestoring(false);
    },
    [reportError, writeBuffers, writeIndex, writeTabs],
  );

  // Al abrir un proyecto se recupera su sesión anterior, si la hay.
  useEffect(() => {
    if (projectPath === null) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const session = await loadSession();

        if (cancelled || session === null || session.lastProject !== projectPath) {
          return;
        }

        await restoreSession(session);
      } catch (cause) {
        // Una sesión ilegible no debe impedir abrir el proyecto.
        console.warn("[prisma] no se pudo recuperar la sesion anterior:", cause);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectPath, restoreSession]);

  // Se espera a que termine la recuperación antes de guardar: si no, se guardaría la
  // lista vacía de pestañas y se perderían las de la sesión anterior.
  //
  // Abrir, cerrar o cambiar de pestaña se guarda de inmediato, porque son acciones
  // poco frecuentes y no conviene que dependan del retardo: si la ventana se cerrase
  // justo después de abrir una pestaña, esa pestaña se perdería al recuperar.
  useEffect(() => {
    if (projectPath === null || isRestoring) {
      return;
    }

    const state = buildSessionState(projectPath, openTabs, activePath, cursors);

    void saveSession(state).catch((cause: unknown) => {
      console.warn("[prisma] no se pudo guardar la sesion:", cause);
    });
  }, [projectPath, isRestoring, openTabs, activePath]);

  // La posición del cursor cambia en cada pulsación, así que ahí sí se agrupa con
  // retardo. Escribe por debajo del guardado anterior, que es la misma operación.
  useEffect(() => {
    if (projectPath === null || isRestoring) {
      return;
    }

    const timer = setTimeout(() => {
      const state = buildSessionState(projectPath, openTabs, activePath, cursors);

      void saveSession(state).catch((cause: unknown) => {
        console.warn("[prisma] no se pudo guardar la sesion:", cause);
      });
    }, SESSION_SAVE_DELAY);

    return () => clearTimeout(timer);
  }, [projectPath, isRestoring, openTabs, activePath, cursors]);

  useEffect(() => {
    const trimmed = query.trim();

    if (project === null || trimmed.length === 0) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const timer = setTimeout(() => {
      searchProjectFiles(project.path, trimmed)
        .then(setResults)
        .catch((cause: unknown) => {
          reportError(messageOf(cause, "No se pudo buscar en el proyecto."));
          setResults([]);
        })
        .finally(() => setIsSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, project, reportError]);

  const writeBuffer = useCallback(
    (path: string, content: string, options?: { name?: string; language?: string }) => {
      setBuffers((current) => {
        const existing = current[path];
        if (existing === undefined) {
          return current;
        }
        const next = {
          ...current,
          [path]: {
            ...existing,
            content,
            ...(options?.name !== undefined ? { name: options.name } : {}),
            ...(options?.language !== undefined ? { language: options.language } : {}),
          },
        };
        buffersRef.current = next;
        return next;
      });
    },
    [],
  );

  return {
    buffers,
    openTabs,
    activeTabIndex,
    activeTab,
    activePath,
    activeBuffer,
    activeCursor,
    isActiveDirty,
    dirtyPaths,
    hasUnsavedChanges,
    error,
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
    clearReveal: useCallback(() => setReveal(null), []),
    reportError,
    clearError,
    closeTab,
    isTabDirty,
    resetWorkspace,
    writeBuffer,
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspace>;
