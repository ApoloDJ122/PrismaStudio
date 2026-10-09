import { useEffect, useMemo, useState } from "react";

import type { PrismaId, PrismaNode } from "../../../designer/types";
import { htmlId } from "../../../designer/tree";
import { displayLabel, visualChildren } from "../../../designer/visual";
import type { DesignerState } from "../../../hooks/useDesigner";
import "./design.css";

interface Props {
  designer: DesignerState;
}

function TreeNode({
  node,
  depth,
  designer,
  collapsed,
  onToggle,
  register,
}: {
  node: PrismaNode;
  depth: number;
  designer: DesignerState;
  collapsed: Set<PrismaId>;
  onToggle: (id: PrismaId) => void;
  register: (id: PrismaId, el: HTMLDivElement | null) => void;
}) {
  const kids = useMemo(() => visualChildren(node), [node]);
  const isCollapsed = collapsed.has(node.id);
  const selected = designer.selectedId === node.id;
  const id = node.kind === "element" ? htmlId(node) : null;

  return (
    <>
      <div
        ref={(el) => register(node.id, el)}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={kids.length > 0 ? !isCollapsed : undefined}
        tabIndex={0}
        className={`ds-tree__row${selected ? " ds-tree__row--selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => designer.setSelectedId(node.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            designer.setSelectedId(node.id);
          }
        }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            className="ds-tree__chevron"
            aria-label={isCollapsed ? "Expandir" : "Contraer"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="ds-tree__chevron ds-tree__chevron--leaf" aria-hidden="true" />
        )}
        <span className="ds-tree__tag">{displayLabel(node)}</span>
        {id !== null && <span className="ds-tree__hint">#{id}</span>}
      </div>
      {!isCollapsed &&
        kids.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            designer={designer}
            collapsed={collapsed}
            onToggle={onToggle}
            register={register}
          />
        ))}
    </>
  );
}

export function DesignTree({ designer }: Props) {
  const [collapsed, setCollapsed] = useState<Set<PrismaId>>(new Set());
  const rowRefs = useMemo(() => new Map<PrismaId, HTMLDivElement>(), [designer.roots]);

  const toggle = (id: PrismaId): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Al seleccionar en el lienzo, el árbol sigue: abre los padres y lo muestra.
  useEffect(() => {
    if (designer.selectedId === null) {
      return;
    }
    const el = rowRefs.get(designer.selectedId);
    el?.scrollIntoView({ block: "nearest" });
  }, [designer.selectedId, rowRefs]);

  const register = (id: PrismaId, el: HTMLDivElement | null): void => {
    if (el === null) {
      rowRefs.delete(id);
    } else {
      rowRefs.set(id, el);
    }
  };

  return (
    <div className="ds-tree" role="tree" aria-label="Estructura">
      {designer.canvasNodes.length === 0 && (
        <p className="ds-tree__empty">Sin elementos: añade el primero desde ELEMENTOS.</p>
      )}
      {designer.canvasNodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          designer={designer}
          collapsed={collapsed}
          onToggle={toggle}
          register={register}
        />
      ))}
    </div>
  );
}

export default DesignTree;
