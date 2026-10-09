import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  analyzeProject,
  type AnalyzeProjectInput,
  type ReadFailure,
} from "../analysis/analyze";
import {
  DEFAULT_IGNORED_DIRS,
  buildFileModels,
  groupFiles,
  readableFiles,
} from "../analysis/scan";
import type { DocumentModel, ProjectModel } from "../analysis/types";
import {
  applyMove,
  deleteNode as deleteNodePure,
  insertElement,
  positionSelector,
  reorderNode,
  setNodeAttribute as setNodeAttributePure,
  setNodeText as setNodeTextPure,
} from "../designer/edit";
import { ensurePositionRelative, readBox, readDeclaration, writeDeclaration } from "../designer/cssEdit";
import { designClassOf } from "../designer/class";
import { findById, serialize } from "../designer/tree";
import { canvasContainerId, canvasNodes as visualCanvasNodes } from "../designer/visual";
import { createIdFactory } from "../designer/identity";

type IdFactory = { next: () => PrismaId };
import type { PrismaId, PrismaNode } from "../designer/types";
import { parseMarkup } from "../designer/parse";
import {
  linkedStylesheets,
  readInternalStyle,
  ensureStylesheetLink,
  ensureStyleNode,
} from "../designer/edit";
import { readProjectFile, scanProjectFiles } from "../services/projects";
import type { ProjectState } from "./useProject";
import { messageOf } from "./useProject";

export type DesignViewMode = "code" | "design";

export type CssTarget =
  | { kind: "external"; href: string }
  | { kind: "internal" };

export interface DesignerOptions {
  getCssText: (hrefOrNull: string | null) => Promise<string | null>;
  writeCssText: (hrefOrNull: string | null, text: string) => Promise<void>;
}

export interface DesignerState {
  viewMode: DesignViewMode;
  document: DocumentModel | null;
  roots: PrismaNode[];
  cssTarget: CssTarget | null;
  cssText: string;
  selectedId: PrismaId | null;
  /** Nodo seleccionado, o `null`. */
  selectedNode: PrismaNode | null;
  /** Nodos dibujables de primer nivel (sin `head`, `meta`, `script`, ...). */
  canvasNodes: PrismaNode[];
  /** Dónde cae lo soltado en el fondo: el `<body>` o `null` en fragmentos. */
  containerId: PrismaId | null;
  isBusy: boolean;
  error: string | null;
  projectModel: ProjectModel | null;
  setViewMode: (mode: DesignViewMode) => void;
  setSelectedId: (id: PrismaId | null) => void;
  setCssTarget: (target: CssTarget | null) => void;
  insertTag: (tag: string, parentId: PrismaId | null) => void;
  moveNode: (nodeId: PrismaId, parentId: PrismaId | null, x: number, y: number) => void;
  reorder: (nodeId: PrismaId, direction: "up" | "down") => void;
  /** Cambia de hoja y carga su contenido (externo o `<style>` interno). */
  selectCssTarget: (target: CssTarget) => void;
  deleteNode: (nodeId: PrismaId) => void;
  updateText: (nodeId: PrismaId, text: string) => void;
  setNodeAttr: (nodeId: PrismaId, name: string, value: string) => void;
  setNodeStyle: (nodeId: PrismaId, property: string, value: string) => void;
  /** Valor CSS de una propiedad para el nodo, o `null` si no tiene. */
  nodeStyle: (nodeId: PrismaId, property: string) => string | null;
  /** Posición `left/top` del nodo, o `null` si está en flujo. */
  nodeBox: (nodeId: PrismaId) => { x: number; y: number } | null;
  ensureExternalCss: (href: string) => void;
  applyToBuffers: (workspace: {
    writeBuffer: (path: string, content: string) => void;
    saveBuffer?: (path: string) => Promise<string | null>;
  }) => Promise<void>;
  refresh: () => void;
}

function shallowCloneRoots(roots: PrismaNode[]): PrismaNode[] {
  return roots.map((r) => structuredClone(r));
}

export function useDesigner(
  projectState: ProjectState,
  options: DesignerOptions,
  workspace?: {
    activePath: string | null;
    writeBuffer: (path: string, content: string) => void;
    saveBuffer?: (path: string) => Promise<string | null>;
    buffers?: Record<string, any>;
  },
): DesignerState {
  const { project } = projectState;
  const rootPath = project?.path ?? null;
  const [viewMode, setViewMode] = useState<DesignViewMode>("code");
  const [roots, setRoots] = useState<PrismaNode[]>([]);
  const [factory, setFactory] = useState<IdFactory>(() => createIdFactory());
  const [document, setDocument] = useState<DocumentModel | null>(null);
  const [cssTarget, setCssTarget] = useState<CssTarget | null>(null);
  const [cssText, setCssText] = useState<string>("");
  const [selectedId, setSelectedId] = useState<PrismaId | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectModel, setProjectModel] = useState<ProjectModel | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Los puentes `options`/`workspace` llegan como objetos nuevos en cada render.
  // Se guardan en referencias para que la recarga solo dependa del archivo
  // activo (primitiva estable): si dependiera de su identidad, cada selección
  // o edición re-renderizaría, re-leería el disco y borraría lo editado.
  const activePath = workspace?.activePath ?? null;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const activePathRef = useRef<string | null>(activePath);
  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // El CSS vive también en una referencia: varias operaciones lo leen y lo
  // escriben encadenadas, y el valor del render puede ir una jugada por detrás.
  const cssTextRef = useRef(cssText);
  useEffect(() => {
    cssTextRef.current = cssText;
  }, [cssText]);

  const writeCssText = useCallback((next: string) => {
    cssTextRef.current = next;
    setCssText(next);
  }, []);

  const loadFromActive = useCallback(async () => {
    const ws = workspaceRef.current;
    const opts = optionsRef.current;
    const path = ws?.activePath ?? null;
    activePathRef.current = path;
    if (rootPath === null || path === null) {
      setDocument(null);
      setRoots([]);
      setFactory(createIdFactory());
      setCssText("");
      setCssTarget(null);
      return;
    }
    const isHtmlLike = /\.html?$|\.blade\.php$/i.test(path);
    if (!isHtmlLike) {
      setDocument(null);
      setRoots([]);
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      let content = "";
      try {
        const buf = ws?.buffers?.[path];
        if (buf?.content !== undefined) {
          content = buf.content;
        }
      } catch {}
      if (content === "") {
        const read = await readProjectFile(path, rootPath);
        content = read.content;
      }
      const doc = parseMarkup(content, path);
      setDocument({
        id: path,
        filePath: path,
        relativePath: path.replace(rootPath, "").replace(/^[\\/]+/, "").replace(/\\\\/g, "/"),
        type: path.endsWith(".blade.php") ? "blade" : "html",
        title: null,
        root: doc.roots,
        linkedStylesheets: [],
        linkedScripts: [],
        inlineStylesheets: 0,
        elementCount: doc.roots.length,
        inlineStyleCount: 0,
        warnings: [],
        elementWarnings: {},
      } as unknown as DocumentModel);
      setRoots(doc.roots);
      setFactory(createIdFactory());
      const links = linkedStylesheets(doc.roots);
      if (links.length > 0) {
        const href = links[0];
        if (href) {
          setCssTarget({ kind: "external", href });
          const ct = await opts.getCssText(href);
          writeCssText(ct ?? "");
        }
      } else {
        const internal = readInternalStyle(doc.roots);
        if (internal !== null) {
          setCssTarget({ kind: "internal" });
          writeCssText(internal);
        } else {
          setCssTarget(null);
          writeCssText("");
        }
      }
    } catch (e) {
      setError(messageOf(e, "No se pudo cargar el documento para diseño"));
    } finally {
      setIsBusy(false);
    }
  }, [rootPath, activePath, writeCssText]);

  // Solo se recarga al cambiar de proyecto/archivo o al pedirlo (`refresh`).
  // Recargar en cada render borraría las ediciones aún no aplicadas.
  useEffect(() => {
    void loadFromActive();
  }, [loadFromActive, attempt]);

  useEffect(() => {
    if (rootPath === null) {
      setProjectModel(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const scan = await scanProjectFiles(rootPath, DEFAULT_IGNORED_DIRS);
        if (cancelled) return;
        const files = buildFileModels(scan.files);
        const contents: Record<string, string> = {};
        const readFailures: ReadFailure[] = [];
        for (const file of readableFiles(groupFiles(files))) {
          try {
            const read = await readProjectFile(file.path, rootPath);
            if (cancelled) return;
            contents[file.path] = read.content;
          } catch (cause) {
            readFailures.push({
              path: file.path,
              relativePath: file.relativePath,
              message: messageOf(cause, "no se pudo leer"),
            });
          }
        }
        if (cancelled) return;
        const input: AnalyzeProjectInput = {
          rootPath,
          name: project?.name ?? "",
          files,
          contents,
          readFailures,
          scanWarnings: scan.warnings,
          truncated: scan.truncated,
        };
        setProjectModel(analyzeProject(input));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [rootPath, project?.name, attempt]);

  const insertTag = useCallback(
    (tag: string, parentId: PrismaId | null) => {
      setError(null);
      const next = shallowCloneRoots(roots);
      const res = insertElement(next, factory, tag, parentId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      // Regla base propia desde el primer momento (`.div-1 { position: relative; }`):
      // el elemento ya es contexto de posicionamiento para sus futuros hijos.
      const selector = positionSelector(next, res.value);
      if (selector !== null) {
        writeCssText(ensurePositionRelative(cssTextRef.current, selector));
      }
      setRoots(next);
      setSelectedId(res.value.id);
    },
    [roots, factory, writeCssText],
  );

  const moveNode = useCallback(
    (nodeId: PrismaId, parentId: PrismaId | null, x: number, y: number) => {
      setError(null);
      const next = shallowCloneRoots(roots);
      const res = applyMove(next, cssTextRef.current, { nodeId, parentId, box: { x, y } });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      writeCssText(res.value.cssText);
      setRoots(next);
    },
    [roots, writeCssText],
  );

  const reorder = useCallback(
    (nodeId: PrismaId, direction: "up" | "down") => {
      setError(null);
      const next = shallowCloneRoots(roots);
      const res = reorderNode(next, nodeId, direction);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRoots(next);
    },
    [roots],
  );

  const deleteNode = useCallback(
    (nodeId: PrismaId) => {
      setError(null);
      const next = shallowCloneRoots(roots);
      const res = deleteNodePure(next, nodeId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRoots(next);
      setSelectedId((current) => (current === nodeId ? null : current));
    },
    [roots],
  );

  const updateText = useCallback(
    (nodeId: PrismaId, text: string) => {
      setError(null);
      const next = shallowCloneRoots(roots);
      const res = setNodeTextPure(next, factory, nodeId, text);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRoots(next);
    },
    [roots, factory],
  );

  const setNodeAttr = useCallback(
    (nodeId: PrismaId, name: string, value: string) => {
      setError(null);
      const next = shallowCloneRoots(roots);
      const res = setNodeAttributePure(next, nodeId, name, value);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRoots(next);
    },
    [roots],
  );

  const setNodeStyle = useCallback(
    (nodeId: PrismaId, property: string, value: string) => {
      if (value.trim() === "") {
        return;
      }
      setError(null);
      const next = shallowCloneRoots(roots);
      const node = findById(next, nodeId);
      if (node === null) {
        setError("El elemento ya no está en el documento.");
        return;
      }
      const selector = positionSelector(next, node);
      if (selector === null) {
        setError("Este nodo no se puede posicionar con CSS.");
        return;
      }
      writeCssText(writeDeclaration(cssTextRef.current, selector, property, value.trim()));
      setRoots(next);
    },
    [roots, writeCssText],
  );

  /** Selector con el que el lienzo escribe el CSS de un nodo, sin crearlo. */
  const styleSelectorOf = useCallback(
    (nodeId: PrismaId): string | null => {
      const node = findById(roots, nodeId);
      if (node === null) {
        return null;
      }
      const unique = designClassOf(roots, node);
      if (unique !== null) {
        return `.${unique}`;
      }
      if (node.kind === "element" && (node.tag === "body" || node.tag === "html")) {
        return node.tag;
      }
      return null;
    },
    [roots],
  );

  const nodeStyle = useCallback(
    (nodeId: PrismaId, property: string): string | null => {
      const selector = styleSelectorOf(nodeId);
      return selector === null ? null : readDeclaration(cssText, selector, property);
    },
    [cssText, styleSelectorOf],
  );

  const nodeBox = useCallback(
    (nodeId: PrismaId): { x: number; y: number } | null => {
      const selector = styleSelectorOf(nodeId);
      return selector === null ? null : readBox(cssText, selector);
    },
    [cssText, styleSelectorOf],
  );

  const selectedNode = useMemo(
    () => (selectedId === null ? null : findById(roots, selectedId)),
    [roots, selectedId],
  );

  const visibleCanvasNodes = useMemo(() => visualCanvasNodes(roots), [roots]);
  const containerId = useMemo(() => canvasContainerId(roots), [roots]);

  const selectCssTarget = useCallback(
    (target: CssTarget) => {
      setError(null);
      setCssTarget(target);
      void (async () => {
        if (target.kind === "external") {
          const ct = await optionsRef.current.getCssText(target.href);
          writeCssText(ct ?? "");
        } else {
          writeCssText(readInternalStyle(roots) ?? "");
        }
      })();
    },
    [roots, writeCssText],
  );

  const ensureExternalCss = useCallback(
    (href: string) => {
      const clean = href.trim();
      if (clean === "") {
        setError("Indica el nombre de la hoja de estilo.");
        return;
      }
      setError(null);
      const next = shallowCloneRoots(roots);
      const res = ensureStylesheetLink(next, factory, clean);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRoots(next);
      setCssTarget({ kind: "external", href: clean });
      void (async () => {
        const ct = await optionsRef.current.getCssText(clean);
        if (ct === null) {
          // Crear significa crear: el fichero aparece en el árbol desde ya,
          // no solo al pulsar Aplicar.
          try {
            await optionsRef.current.writeCssText(clean, "");
          } catch (cause) {
            setError(messageOf(cause, "No se pudo crear la hoja de estilo."));
            return;
          }
          writeCssText("");
        } else {
          writeCssText(ct);
        }
      })();
    },
    [roots, factory, writeCssText],
  );

  const applyToBuffers = useCallback(
    async (ws: {
      writeBuffer: (path: string, content: string) => void;
      saveBuffer?: (path: string) => Promise<string | null>;
    }) => {
      const path = activePathRef.current;
      if (path === null || document === null) return;
      // El `<style>` interno se materializa aquí, sobre una copia local: así el
      // HTML volcado ya lo contiene y no depende del estado pendiente de React.
      let current = roots;
      if (cssTarget === null && cssTextRef.current.trim() !== "") {
        const next = shallowCloneRoots(roots);
        const ensured = ensureStyleNode(next, factory, cssTextRef.current);
        if (!ensured.ok) {
          setError(ensured.message);
          return;
        }
        current = next;
        setRoots(next);
        setCssTarget({ kind: "internal" });
      } else if (cssTarget?.kind === "internal") {
        const next = shallowCloneRoots(roots);
        const ensured = ensureStyleNode(next, factory, cssTextRef.current);
        if (!ensured.ok) {
          setError(ensured.message);
          return;
        }
        current = next;
        setRoots(next);
      }
      const html = serialize(current);
      ws.writeBuffer(path, html);
      if (cssTarget?.kind === "external") {
        await optionsRef.current.writeCssText(cssTarget.href, cssTextRef.current);
        if (ws.saveBuffer) {
          try {
            await ws.saveBuffer(path);
          } catch {}
          try {
            await ws.saveBuffer(cssTarget.href);
          } catch {}
        }
      } else {
        if (ws.saveBuffer) {
          try {
            await ws.saveBuffer(path);
          } catch {}
        }
      }
    },
    [roots, cssTarget, document, factory],
  );

  const refresh = useCallback(() => setAttempt((v) => v + 1), []);

  return {
    viewMode,
    setViewMode,
    document,
    roots,
    cssTarget,
    cssText,
    selectedId,
    selectedNode,
    canvasNodes: visibleCanvasNodes,
    containerId,
    setSelectedId,
    setCssTarget,
    isBusy,
    error,
    projectModel,
    insertTag,
    moveNode,
    reorder,
    deleteNode,
    updateText,
    setNodeAttr,
    setNodeStyle,
    nodeStyle,
    nodeBox,
    selectCssTarget,
    ensureExternalCss,
    applyToBuffers,
    refresh,
  };
}
