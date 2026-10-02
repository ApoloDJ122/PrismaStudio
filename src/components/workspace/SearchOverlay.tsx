import { useEffect, useMemo, useState } from "react";

import type { ProjectNode, SearchMatch } from "../../types/project";

export type PaletteMode = "open" | "search";

interface SearchOverlayProps {
  mode: PaletteMode;
  projectRoot: ProjectNode;
  query: string;
  results: SearchMatch[];
  isSearching: boolean;
  onQueryChange: (query: string) => void;
  onSelectFile: (path: string, revealLine?: number) => void;
  onClose: () => void;
}

function collectFiles(node: ProjectNode, out: ProjectNode[] = []): ProjectNode[] {
  for (const child of node.children) {
    if (child.kind === "folder") {
      collectFiles(child, out);
    } else {
      out.push(child);
    }
  }

  return out;
}

function SearchOverlay({
  mode,
  projectRoot,
  query,
  results,
  isSearching,
  onQueryChange,
  onSelectFile,
  onClose,
}: SearchOverlayProps) {
  const [highlight, setHighlight] = useState(0);
  // El texto se guarda aqui para responder al instante; en modo busqueda el
  // hook debouncea la peticion al backend.
  const [text, setText] = useState(query);

  const files = useMemo(() => collectFiles(projectRoot), [projectRoot]);
  const normalized = text.trim().toLowerCase();

  const items = useMemo(() => {
    if (mode === "open") {
      const filtered = normalized === ""
        ? files
        : files.filter((file) => file.name.toLowerCase().includes(normalized));

      return filtered.slice(0, 40).map((file) => ({
        key: file.path,
        title: file.name,
        detail: file.path,
        path: file.path,
        line: undefined as number | undefined,
      }));
    }

    return results.map((match) => ({
      key: `${match.path}:${match.line}`,
      title: match.name,
      detail: match.line === 0 ? match.preview : `${match.line}: ${match.preview}`,
      path: match.path,
      line: match.line,
    }));
  }, [mode, files, normalized, results]);

  useEffect(() => {
    setHighlight(0);
  }, [text, items.length]);

  function commit(index: number) {
    const item = items[index];

    if (item === undefined) {
      return;
    }

    onSelectFile(item.path, item.line);
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(highlight);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="palette"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="palette__panel" role="dialog" aria-modal="true" aria-label={mode === "open" ? "Abrir archivo" : "Buscar en el proyecto"}>
        <input
          className="palette__input"
          type="text"
          value={text}
          autoFocus
          spellCheck={false}
          placeholder={mode === "open" ? "Buscar archivo por nombre" : "Buscar texto en el proyecto"}
          onChange={(event) => {
            setText(event.currentTarget.value);
            onQueryChange(event.currentTarget.value);
          }}
          onKeyDown={handleKeyDown}
        />

        {mode === "search" && normalized !== "" && !isSearching && results.length === 0 && (
          <p className="palette__empty">Sin coincidencias.</p>
        )}

        {mode === "search" && isSearching && <p className="palette__empty">Buscando...</p>}

        <ul className="palette__list">
          {items.map((item, index) => (
            <li key={item.key}>
              <button
                type="button"
                className={`palette__item ${index === highlight ? "palette__item--active" : ""}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => commit(index)}
              >
                <span className="palette__title">{item.title}</span>
                <span className="palette__detail">{item.detail}</span>
              </button>
            </li>
          ))}
        </ul>

        {items.length === 0 && mode === "open" && normalized !== "" && (
          <p className="palette__empty">No hay archivos que coincidan.</p>
        )}
      </div>
    </div>
  );
}

export default SearchOverlay;
