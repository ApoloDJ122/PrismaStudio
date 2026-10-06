/**
 * M2.1.0 - Recogida de advertencias de analisis.
 *
 * Un archivo roto o raro nunca para el analisis: se anota y se sigue. Para que
 * un archivo lleno de etiquetas desconocidas no convierta el panel en un muro
 * de texto, cada documento tiene un tope de advertencias; al llegar a el se deja
 * constancia de cuantas se han dejado fuera y ya no se anotan mas.
 *
 * Los identificadores no se ponen aqui. Se asignan al final, sobre la lista
 * completa del proyecto, para que cada `id` sea unico sin tener que llevar
 * contadores por documento.
 */

import type { AnalysisWarning, AnalysisWarningType, WarningSeverity } from "./types.ts";

/** Maximo de advertencias que se guardan por documento. */
export const MAX_WARNINGS_PER_DOCUMENT = 40;

/** Datos de una advertencia antes de que se le asigne su identificador. */
export interface WarningDraft {
  type: AnalysisWarningType;
  /** Frase corta y legible, escrita para quien mira la interfaz. */
  message: string;
  /** Ruta relativa del archivo, o `null` si es del proyecto entero. */
  file: string | null;
  /** Linea 1based. `0` si se desconoce. */
  line: number;
  severity: WarningSeverity;
}

export interface WarningList {
  /** Advertencias recogidas hasta ahora, en orden. */
  readonly warnings: AnalysisWarning[];
  /** Cantidad de advertencias que se han dejado fuera por el tope. */
  readonly omitted: number;
  /**
   * Anota una advertencia si cabe. Devuelve la advertencia creada, o `null` si
   * el tope ya se ha alcanzado.
   */
  add(draft: WarningDraft): AnalysisWarning | null;
  /**
   * Cierra la lista. Si se dejo alguna fuera, anade un unico aviso que dice
   * cuantas. Se puede llamar mas de una vez sin duplicar nada.
   */
  finish(): void;
}

/**
 * Crea una lista de advertencias con tope.
 *
 * `file` es la ruta relativa que llevan las advertencias de esta lista; con
 * `null` se recogen avisos del proyecto entero.
 */
export function createWarningList(
  file: string | null,
  limit: number = MAX_WARNINGS_PER_DOCUMENT,
): WarningList {
  const warnings: AnalysisWarning[] = [];
  let omitted = 0;
  let finished = false;

  function add(draft: WarningDraft): AnalysisWarning | null {
    if (warnings.length >= limit) {
      omitted += 1;
      return null;
    }

    const created: AnalysisWarning = { id: "", ...draft };
    warnings.push(created);
    return created;
  }

  function finish(): void {
    if (finished) {
      return;
    }

    finished = true;

    if (omitted > 0) {
      warnings.push({
        id: "",
        type: "unsupported-markup",
        file,
        line: 0,
        severity: "info",
        message: `Se han omitido ${omitted} advertencias mas de este documento por el limite de ${limit}.`,
      });
    }
  }

  return {
    warnings,
    get omitted(): number {
      return omitted;
    },
    add,
    finish,
  };
}

/**
 * Reparte las advertencias del proyecto en una sola lista ordenada y les pone
 * identificador.
 *
 * El orden es el que va a ver la persona: primero los avisos generales del
 * proyecto y despues, documento a documento, los suyos. Como el identificador
 * sale de la posicion, es estable mientras el analisis no cambie y sirve
 * perfectamente como clave de interfaz.
 */
export function assignWarningIds(warnings: AnalysisWarning[]): void {
  warnings.forEach((warning, index) => {
    warning.id = `${warning.file ?? "project"}#${index}`;
  });
}
