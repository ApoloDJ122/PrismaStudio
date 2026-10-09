import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import type { PrismaId, PrismaNode } from "../../../designer/types";
import { linkedStylesheets } from "../../../designer/edit";
import { readAttribute } from "../../../designer/attributes";
import { isContainerTag, isVoidTag } from "../../../designer/html";
import { scopeCss } from "../../../designer/cssEdit";
import { displayLabel, visualChildren } from "../../../designer/visual";
import type { DesignerState } from "../../../hooks/useDesigner";
import "./design.css";

/** Ámbito con el que se inyecta la hoja del autor dentro de la página. */
const CANVAS_SCOPE = ".ds-page";

function clampZoom(value: number): number {
  return Math.min(2, Math.max(0.25, Math.round(value * 100) / 100));
}

/** `style="..."` del autor a objeto React (`kebab` -> `camelCase`). */
function parseInlineStyle(value: string): CSSProperties {
  const out: Record<string, string> = {};
  let cursor = 0;
  let start = 0;
  let depth = 0;
  let quote: string | null = null;

  const push = (end: number): void => {
    const raw = value.slice(start, end).trim();
    start = end + 1;
    if (raw === "") {
      return;
    }
    const colon = raw.indexOf(":");
    if (colon < 0) {
      return;
    }
    const name = raw
      .slice(0, colon)
      .trim()
      .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (name !== "") {
      out[name] = raw.slice(colon + 1).trim();
    }
  };

  while (cursor < value.length) {
    const char = value[cursor];
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (char === ";" && depth === 0) {
      push(cursor);
    }
    cursor += 1;
  }
  push(value.length);
  return out as CSSProperties;
}

interface NodeViewProps {
  node: PrismaNode;
  selectedId: PrismaId | null;
  dropTargetId: PrismaId | null;
  draggingId: PrismaId | null;
  dragActive: boolean;
  onSelect: (id: PrismaId | null) => void;
  onDragStart: (id: PrismaId, x: number, y: number) => void;
  onDragEnter: (id: PrismaId) => void;
  onDragLeave: () => void;
  onDrop: (id: PrismaId) => void;
}

function ImgView({
  node,
  props,
}: {
  node: PrismaNode;
  props: Record<string, unknown>;
}) {
  const [failed, setFailed] = useState(false);
  const src = readAttribute(node, "src");
  const alt = readAttribute(node, "alt") ?? "Imagen";

  if (failed || src === null || src.trim() === "") {
    return (
      <div {...props} className={`${props.className ?? ""} ds-img-fallback`.trim()}>
        <span className="ds-img-fallback__icon" aria-hidden="true">
          ◧
        </span>
        <span>{alt}</span>
      </div>
    );
  }

  return <img {...props} src={src} alt={alt} onError={() => setFailed(true)} />;
}

function NodeView({
  node,
  selectedId,
  dropTargetId,
  draggingId,
  dragActive,
  onSelect,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDrop,
}: NodeViewProps) {
  const ref = useRef<any>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (node.kind !== "element") {
        return;
      }
      e.stopPropagation();
      onSelect(node.id);
      onDragStart(node.id, e.clientX, e.clientY);
    },
    [node, onSelect, onDragStart],
  );

  if (node.kind !== "element" || node.tag === null) {
    if (node.kind === "text") {
      return <>{node.content ?? ""}</>;
    }
    if (node.kind === "dynamic" || node.kind === "directive") {
      return <span className="ds-blade">{displayLabel(node)}</span>;
    }
    return null;
  }

  const selected = selectedId === node.id;
  const isDrop = dropTargetId === node.id;
  const isDragging = dragActive && draggingId === node.id;
  const kids = visualChildren(node);
  const empty = kids.length === 0 && isContainerTag(node.tag);

  const attrs: Record<string, unknown> = {};
  let authorClass = "";
  let inline: CSSProperties | undefined;
  for (const a of node.attributes) {
    const name = a.name.toLowerCase();
    const value = a.value ?? "";
    if (name === "class") {
      authorClass = value;
    } else if (name === "style") {
      inline = parseInlineStyle(value);
    } else if (name === "for" && node.tag === "label") {
      attrs.htmlFor = value;
    } else {
      attrs[a.name] = value;
    }
  }

  const className = [
    authorClass,
    "ds-node",
    selected ? "ds-selected" : "",
    isDrop ? "ds-drop" : "",
    isDragging ? "ds-dragging" : "",
    empty ? "ds-empty" : "",
  ]
    .filter((part) => part !== "")
    .join(" ");

  const common = {
    ...attrs,
    className,
    "data-prisma-id": node.id,
    "data-ds-tag": node.tag,
    ref,
    onPointerDown: handlePointerDown,
    style: inline,
  };

  if (isVoidTag(node.tag)) {
    // Los void no admiten hijos en React: se dibujan autocerrados.
    if (node.tag === "img") {
      return <ImgView node={node} props={common} />;
    }
    const Tag: any = node.tag;
    return <Tag {...common} />;
  }

  if (node.tag === "input") {
    return <input {...common} readOnly />;
  }

  if (node.tag === "textarea") {
    return <textarea {...common} readOnly value={node.children.map((c) => c.content ?? "").join("")} />;
  }

  const Tag: any = node.tag;
  return (
    <Tag
      {...common}
      onPointerOver={(e: React.PointerEvent) => {
        e.stopPropagation();
        if (draggingId !== null && draggingId !== node.id && isContainerTag(node.tag as string)) {
          onDragEnter(node.id);
        }
      }}
      onPointerOut={(e: React.PointerEvent) => {
        e.stopPropagation();
        onDragLeave();
      }}
      onPointerUp={(e: React.PointerEvent) => {
        e.stopPropagation();
        if (draggingId !== null) {
          onDrop(draggingId);
        }
      }}
    >
      {kids.map((child) => (
        <NodeView
          key={child.id}
          node={child}
          selectedId={selectedId}
          dropTargetId={dropTargetId}
          draggingId={draggingId}
          dragActive={dragActive}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        />
      ))}
    </Tag>
  );
}

// Si un nodo no se puede dibujar, se muestra un aviso en el lienzo en lugar de
// tumbar la aplicación entera. Los archivos del proyecto no se tocan.
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <p className="ds-error">
          No se pudo dibujar este documento en el lienzo. Puedes seguir editándolo en modo
          Código.
        </p>
      );
    }
    return this.props.children;
  }
}

/** La hoja de estilos es del documento, no del componente: barra fija y visible. */
function DocumentBar({ designer }: { designer: DesignerState }) {
  const [draft, setDraft] = useState("styles.css");
  const links = linkedStylesheets(designer.roots);
  const value =
    designer.cssTarget?.kind === "external"
      ? designer.cssTarget.href
      : designer.cssTarget?.kind === "internal"
        ? "__internal__"
        : "";
  const shown = links.includes(value) || value === "__internal__" ? value : "";
  const path = designer.document?.filePath ?? null;
  const name = path === null ? "Sin documento HTML" : (path.split(/[\\/]/).pop() ?? path);

  const create = (): void => {
    const clean = draft.trim() === "" ? "styles.css" : draft.trim();
    designer.ensureExternalCss(clean.includes(".") ? clean : `${clean}.css`);
  };

  return (
    <div className="ds-docbar">
      <span className="ds-docbar__doc" title={path ?? ""}>
        {name}
      </span>
      <label className="ds-docbar__field" title="Hoja de estilo del documento">
        <span>Hoja</span>
        <select
          className="ds-field__input ds-docbar__select"
          value={shown}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "__internal__") {
              designer.selectCssTarget({ kind: "internal" });
            } else if (next !== "") {
              designer.selectCssTarget({ kind: "external", href: next });
            }
          }}
        >
          <option value="" disabled>
            Elegir…
          </option>
          {links.map((href) => (
            <option key={href} value={href}>
              {href}
            </option>
          ))}
          <option value="__internal__">{"<style> interno"}</option>
        </select>
      </label>
      <input
        className="ds-field__input ds-docbar__new"
        value={draft}
        placeholder="styles.css"
        title="Nombre de la nueva hoja"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            create();
          }
        }}
      />
      <button
        type="button"
        className="ds-mini-btn"
        title="Crea el fichero y lo enlaza con <link>"
        onClick={create}
      >
        Nueva hoja
      </button>
    </div>
  );
}

export function DesignCanvas({ designer }: { designer: DesignerState }) {
  const [zoom, setZoom] = useState(1);
  const [draggingId, setDraggingId] = useState<PrismaId | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<PrismaId | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  // Dónde se pulsó: por debajo del umbral es un clic (selecciona) y no un
  // arrastre (mueve). Sin esto, cada clic teletransportaba el elemento.
  const pressPos = useRef<{ x: number; y: number } | null>(null);

  // La hoja del autor, con ámbito para no pintar la UI de Prisma. Solo
  // previsualización: el archivo real nunca pasa por este texto.
  const scopedCss = useMemo(() => scopeCss(designer.cssText, CANVAS_SCOPE), [designer.cssText]);

  const beginPress = useCallback((id: PrismaId, x: number, y: number) => {
    pressPos.current = { x, y };
    setDragActive(false);
    setDraggingId(id);
  }, []);

  useEffect(() => {
    if (draggingId === null) {
      setDragPos(null);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const start = pressPos.current;
      if (start === null) {
        return;
      }
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) {
        return;
      }
      setDragActive(true);
      setDragPos({ x: e.clientX, y: e.clientY });
    };
    const onUp = () => {
      pressPos.current = null;
      setDragActive(false);
      setDraggingId(null);
      setDropTargetId(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingId]);

  const handleDrop = useCallback(
    (nodeId: PrismaId) => {
      pressPos.current = null;
      setDraggingId(null);
      setDropTargetId(null);
      setDragActive(false);
      // Clic sin arrastre: solo selecciona, no toca el modelo.
      if (!dragActive || dragPos === null) {
        return;
      }
      // Sin contenedor bajo el cursor, el fondo de la página (el `<body>`).
      const targetId = dropTargetId ?? designer.containerId;
      let x = 0;
      let y = 0;
      const pageRect = pageRef.current?.getBoundingClientRect() ?? null;

      if (targetId !== null) {
        const el = pageRef.current?.querySelector(
          `[data-prisma-id="${targetId}"]`,
        ) as HTMLElement | null;
        const rect = el?.getBoundingClientRect() ?? null;
        if (rect !== null) {
          x = Math.round((dragPos.x - rect.left) / zoom);
          y = Math.round((dragPos.y - rect.top) / zoom);
        } else if (pageRect !== null) {
          x = Math.round((dragPos.x - pageRect.left) / zoom);
          y = Math.round((dragPos.y - pageRect.top) / zoom);
        }
      } else if (pageRect !== null) {
        x = Math.round((dragPos.x - pageRect.left) / zoom);
        y = Math.round((dragPos.y - pageRect.top) / zoom);
      }

      designer.moveNode(nodeId, targetId, Math.max(0, x), Math.max(0, y));
    },
    [dragPos, dropTargetId, designer, zoom, dragActive],
  );

  const centerPage = useCallback(() => {
    const wrap = wrapRef.current;
    if (wrap === null) {
      return;
    }
    wrap.scrollTo({
      left: Math.max(0, (wrap.scrollWidth - wrap.clientWidth) / 2),
      top: 0,
    });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      return;
    }
    e.preventDefault();
    const step = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((current) => clampZoom(current + step));
  }, []);

  const empty = designer.canvasNodes.length === 0;

  return (
    <div className="ds-canvas-col">
      <DocumentBar designer={designer} />
      <div className="ds-canvas" ref={wrapRef} onWheel={onWheel}>
      <div className="ds-canvas__toolbar" role="toolbar" aria-label="Vista del lienzo">
        <button
          type="button"
          className="ds-zoom__btn"
          title="Reducir zoom"
          onClick={() => setZoom((current) => clampZoom(current - 0.1))}
        >
          −
        </button>
        <button
          type="button"
          className="ds-zoom__value"
          title="Restablecer zoom al 100%"
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="ds-zoom__btn"
          title="Ampliar zoom"
          onClick={() => setZoom((current) => clampZoom(current + 0.1))}
        >
          +
        </button>
        <button type="button" className="ds-zoom__btn" title="Centrar lienzo" onClick={centerPage}>
          ◎
        </button>
      </div>

      <div className="ds-page-wrap">
        <div
          ref={pageRef}
          className="ds-page"
          style={{ transform: `scale(${zoom})` }}
          onPointerDown={() => designer.setSelectedId(null)}
          onPointerUp={() => {
            if (draggingId !== null) {
              handleDrop(draggingId);
            }
          }}
        >
          <style>{scopedCss}</style>
          <CanvasBoundary>
            {designer.canvasNodes.map((node) => (
              <NodeView
                key={node.id}
                node={node}
                selectedId={designer.selectedId}
                dropTargetId={dropTargetId}
                draggingId={draggingId}
                dragActive={dragActive}
                onSelect={designer.setSelectedId}
                onDragStart={beginPress}
                onDragEnter={setDropTargetId}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={handleDrop}
              />
            ))}
          </CanvasBoundary>
          {empty && (
            <div className="ds-empty-hint">
              <p className="ds-empty-hint__title">Canvas vacío</p>
              <p className="ds-empty-hint__sub">Usa la paleta para añadir el primer elemento</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

export default DesignCanvas;
