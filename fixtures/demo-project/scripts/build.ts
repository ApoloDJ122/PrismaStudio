export interface Tarea {
  titulo: string;
  hecha: boolean;
}

export function pendientes(tareas: Tarea[]): string[] {
  return tareas.filter((tarea) => !tarea.hecha).map((tarea) => tarea.titulo);
}
