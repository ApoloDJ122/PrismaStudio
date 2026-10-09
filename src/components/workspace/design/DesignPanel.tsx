import { useMemo, useState } from "react";

import { ELEMENT_PALETTE, type PaletteItem } from "../../../designer/palette";
import { isContainerTag } from "../../../designer/html";
import type { DesignerState } from "../../../hooks/useDesigner";
import { DesignTree } from "./DesignTree";
import "./design.css";

interface Props {
  designer: DesignerState;
}

const GROUP_ORDER = ["Contenedores", "Texto", "Interacción", "Media", "Enlaces", "Listas"];

export function DesignPanel({ designer }: Props) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of ELEMENT_PALETTE) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return GROUP_ORDER.filter((group) => map.has(group)).map((group) => ({
      group,
      items: map.get(group) ?? [],
    }));
  }, []);

  const needle = query.trim().toLowerCase();
  const visible = groups
    .map(({ group, items }) => ({
      group,
      items:
        needle === ""
          ? items
          : items.filter(
              (item) =>
                item.tag.includes(needle) || item.label.toLowerCase().includes(needle),
            ),
    }))
    .filter(({ items }) => items.length > 0);

  // El nuevo elemento entra en el contenedor seleccionado, o en el fondo
  // del lienzo (el `<body>`) cuando no hay ninguno.
  const insertParent = (() => {
    const selected = designer.selectedNode;
    if (
      selected !== null &&
      selected.kind === "element" &&
      selected.tag !== null &&
      isContainerTag(selected.tag)
    ) {
      return selected.id;
    }
    return designer.containerId;
  })();

  return (
    <div className="ds-side">
      <section className="ds-section" aria-label="Librería">
        <h2 className="ds-section__title">Librería</h2>
        <input
          className="ds-search"
          type="search"
          placeholder="Buscar elemento"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {visible.length === 0 && <p className="ds-lib__empty">Sin resultados.</p>}
        {visible.map(({ group, items }) => (
          <details key={group} className="ds-lib__group" open>
            <summary className="ds-lib__group-head">{group}</summary>
            {items.map((item) => (
              <button
                key={item.tag}
                type="button"
                className="ds-lib__item"
                title={`Añadir <${item.tag}>`}
                onClick={() => designer.insertTag(item.tag, insertParent)}
              >
                {item.label}
              </button>
            ))}
          </details>
        ))}
      </section>

      <section className="ds-section ds-section--grow" aria-label="Jerarquía">
        <h2 className="ds-section__title">Jerarquía</h2>
        <DesignTree designer={designer} />
      </section>
    </div>
  );
}

export default DesignPanel;
