import { memo, useCallback, useEffect, useMemo, useState } from "react";

import type { ProjectNode } from "../../types/project";

export interface TreeCommand {
  type: "new-file" | "new-folder" | "rename" | "delete" | "open";
  path: string;
  name: string;
  isFolder: boolean;
}

interface FileTreeProps {
  tree: ProjectNode;
  activePath: string | null;
  dirtyPaths: string[];
  onCommand: (command: TreeCommand) => void;
}

interface Row {
  node: ProjectNode;
  depth: number;
}

interface MenuState {
  x: number;
  y: number;
  node: ProjectNode;
}

function collectVisible(
  node: ProjectNode,
  expanded: Set<string>,
  depth: number,
  out: Row[],
): Row[] {
  for (const child of node.children) {
    out.push({ node: child, depth });

    if (child.kind === "folder" && expanded.has(child.path)) {
      collectVisible(child, expanded, depth + 1, out);
    }
  }

  return out;
}

function sameOrInside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(parent + "\\") || path.startsWith(parent + "/");
}

function everyFolder(node: ProjectNode, out: string[] = []): string[] {
  for (const child of node.children) {
    if (child.kind === "folder") {
      out.push(child.path);
      everyFolder(child, out);
    }
  }

  return out;
}

/** Carpetas que contienen al archivo indicado, de la mas externa a la mas interna. */
function ancestorsOf(node: ProjectNode, path: string, chain: string[]): string[] | null {
  for (const child of node.children) {
    if (child.path === path) {
      return chain;
    }

    if (child.kind === "folder" && sameOrInside(path, child.path)) {
      return ancestorsOf(child, path, [...chain, child.path]);
    }
  }

  return null;
}

const TreeRow = memo(function TreeRow({
  node,
  depth,
  isOpen,
  isActive,
  isDirty,
  isHighlighted,
  onToggle,
  onActivate,
  onContextMenu,
}: {
  node: ProjectNode;
  depth: number;
  isOpen: boolean;
  isActive: boolean;
  isDirty: boolean;
  isHighlighted: boolean;
  onToggle: (path: string) => void;
  onActivate: (node: ProjectNode) => void;
  onContextMenu: (node: ProjectNode, x: number, y: number) => void;
}) {
  const classes = [
    "tree__row",
    isOpen && "tree__row--open",
    isActive && "tree__row--active",
    isHighlighted && "tree__row--highlighted",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{ paddingLeft: `${depth * 12 + 6}px` }}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isOpen}
      aria-current={isActive ? "true" : undefined}
      title={node.path}
      onClick={() => onActivate(node)}
      onDoubleClick={() => onActivate(node)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(node, event.clientX, event.clientY);
      }}
    >
      <button
        type="button"
        className={`tree__chevron ${node.kind === "file" ? "tree__chevron--hidden" : ""}`}
        tabIndex={-1}
        aria-label={isOpen ? "Contraer carpeta" : "Expandir carpeta"}
        onClick={(event) => {
          event.stopPropagation();
          if (node.kind === "folder") {
            onToggle(node.path);
          }
        }}
      >
        {isOpen ? "▾" : "▸"}
      </button>

      <span className={`tree__icon tree__icon--${node.kind}`} aria-hidden="true">
        {node.kind === "folder" ? (isOpen ? "▬" : "▭") : "▪"}
      </span>

      <span className="tree__name">{node.name}</span>

      {isDirty && <span className="tree__dirty" aria-label="Cambios sin guardar">*</span>}
    </div>
  );
});

function FileTree({ tree, activePath, dirtyPaths, onCommand }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(everyFolder(tree)));
  const [highlight, setHighlight] = useState(0);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const rows = useMemo(() => collectVisible(tree, expanded, 0, []), [tree, expanded]);

  // Al abrir un archivo se despliegan sus carpetas padre para que sea visible.
  useEffect(() => {
    if (activePath === null) {
      return;
    }

    const chain = ancestorsOf(tree, activePath, []);

    if (chain === null || chain.length === 0) {
      return;
    }

    setExpanded((current) => {
      if (chain.every((path) => current.has(path))) {
        return current;
      }

      return new Set([...current, ...chain]);
    });
  }, [activePath, tree]);

  // Una carpeta queda marcada si alguno de sus archivos abiertos tiene cambios.
  const dirtySet = useMemo(() => {
    const set = new Set<string>();

    for (const path of dirtyPaths) {
      set.add(path);

      for (const row of rows) {
        if (row.node.kind === "folder" && sameOrInside(path, row.node.path)) {
          set.add(row.node.path);
        }
      }
    }

    return set;
  }, [dirtyPaths, rows]);

  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const emit = useCallback(
    (type: TreeCommand["type"], node: ProjectNode) =>
      onCommand({ type, path: node.path, name: node.name, isFolder: node.kind === "folder" }),
    [onCommand],
  );

  const activate = useCallback(
    (node: ProjectNode) => {
      if (node.kind === "folder") {
        toggle(node.path);
      } else {
        onCommand({ type: "open", path: node.path, name: node.name, isFolder: false });
      }
    },
    [onCommand, toggle],
  );

  const openContextMenu = useCallback((node: ProjectNode, x: number, y: number) => {
    setMenu({ x, y, node });
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (menu !== null) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeMenu();
        }
        return;
      }

      const row = rows[highlight];

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((current) => Math.min(current + 1, rows.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((current) => Math.max(current - 1, 0));
      } else if (event.key === "ArrowRight" && row?.node.kind === "folder") {
        event.preventDefault();
        if (!expanded.has(row.node.path)) {
          toggle(row.node.path);
        }
      } else if (event.key === "ArrowLeft" && row?.node.kind === "folder") {
        event.preventDefault();
        if (expanded.has(row.node.path)) {
          toggle(row.node.path);
        }
      } else if (event.key === "Enter" && row !== undefined) {
        event.preventDefault();
        activate(row.node);
      } else if (event.key === "F2" && row !== undefined) {
        event.preventDefault();
        emit("rename", row.node);
      } else if ((event.key === "Delete" || event.key === "Backspace") && row !== undefined) {
        event.preventDefault();
        emit("delete", row.node);
      }
    },
    [activate, closeMenu, emit, expanded, highlight, menu, rows, toggle],
  );

  return (
    <div className="tree" onKeyDown={handleKeyDown}>
      <div
        className="tree__list"
        role="tree"
        tabIndex={0}
        aria-label="Archivos del proyecto"
        onContextMenu={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            openContextMenu(tree, event.clientX, event.clientY);
          }
        }}
      >
        {rows.map((row, index) => (
          <TreeRow
            key={row.node.path}
            node={row.node}
            depth={row.depth}
            isOpen={row.node.kind === "folder" ? expanded.has(row.node.path) : activePath === row.node.path}
            isActive={activePath === row.node.path}
            isDirty={dirtySet.has(row.node.path)}
            isHighlighted={index === highlight}
            onToggle={toggle}
            onActivate={activate}
            onContextMenu={openContextMenu}
          />
        ))}
      </div>

      {menu !== null && (
        <>
          <div className="menu__backdrop" onClick={closeMenu} onContextMenu={closeMenu} />
          <div className="menu" style={{ left: menu.x, top: menu.y }} role="menu">
            {menu.node.kind === "file" && (
              <button
                type="button"
                className="menu__item"
                role="menuitem"
                onClick={() => {
                  emit("open", menu.node);
                  closeMenu();
                }}
              >
                Abrir
              </button>
            )}
            <button
              type="button"
              className="menu__item"
              role="menuitem"
              onClick={() => {
                emit("new-file", menu.node);
                closeMenu();
              }}
            >
              Nuevo archivo
            </button>
            <button
              type="button"
              className="menu__item"
              role="menuitem"
              onClick={() => {
                emit("new-folder", menu.node);
                closeMenu();
              }}
            >
              Nueva carpeta
            </button>
            <button
              type="button"
              className="menu__item"
              role="menuitem"
              onClick={() => {
                emit("rename", menu.node);
                closeMenu();
              }}
            >
              Renombrar
            </button>
            <button
              type="button"
              className="menu__item menu__item--danger"
              role="menuitem"
              onClick={() => {
                emit("delete", menu.node);
                closeMenu();
              }}
            >
              Eliminar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default FileTree;
