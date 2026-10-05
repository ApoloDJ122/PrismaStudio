/**
 * M2.0.0 - Clasificacion de archivos del proyecto.
 *
 * El modelo visual solo trabaja con estructura y apariencia. Esta funcion decide
 * que archivo entra y que archivo no, sin leerlo: es solo el nombre.
 *
 * La idea de fondo es que Prisma no debe dar por hecho que el proyecto lo creo
 * el. Un proyecto de VS Code, uno de Laravel o uno creado en Prisma se tratan
 * exactamente igual, porque aqui solo mira la extension.
 *
 * JavaScript se clasifica aparte a proposito. `script.js` sigue siendo un archivo
 * normal del proyecto, editable en el editor de codigo, pero no forma parte del
 * modelo visual: el disenador representa estructura y apariencia, no
 * comportamiento.
 */

/** Que papel juega un archivo en el modelo visual. */
export type DesignFileKind =
  /** HTML o Blade: estructura. */
  | "markup"
  /** CSS: apariencia. */
  | "style"
  /** JavaScript: comportamiento. Fuera del modelo visual. */
  | "script"
  /** Cualquier otra cosa. */
  | "other";

/** Un archivo del proyecto ya clasificado. */
export interface ProjectFilePlan {
  path: string;
  kind: DesignFileKind;
  /** `true` si el modelo visual debe leerlo. */
  participates: boolean;
}

const MARKUP_EXTENSIONS = new Set(["html", "htm", "php"]);
const STYLE_EXTENSIONS = new Set(["css"]);
const SCRIPT_EXTENSIONS = new Set(["js", "mjs", "cjs", "jsx", "ts", "tsx", "vue", "svelte"]);

/** Devuelve la extension en minusculas, sin el punto. */
export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");

  if (dot < 0) {
    return "";
  }

  return name.slice(dot + 1).toLowerCase();
}

/** `true` si el archivo es una plantilla Blade, como `perfil.blade.php`. */
export function isBladeFile(path: string): boolean {
  return path.toLowerCase().endsWith(".blade.php");
}

/** Clasifica un archivo por su nombre. */
export function classifyPath(path: string): DesignFileKind {
  if (MARKUP_EXTENSIONS.has(extensionOf(path))) {
    return "markup";
  }

  if (STYLE_EXTENSIONS.has(extensionOf(path))) {
    return "style";
  }

  if (SCRIPT_EXTENSIONS.has(extensionOf(path))) {
    return "script";
  }

  return "other";
}

/** Clasifica un archivo y dice si entra en el modelo visual. */
export function planFile(path: string): ProjectFilePlan {
  const kind = classifyPath(path);

  return {
    path,
    kind,
    participates: kind === "markup" || kind === "style",
  };
}

/** Reparto de un proyecto en las tres familias que necesita el modelo. */
export interface ProjectPlan {
  /** HTML y Blade: los que generan la estructura. */
  markup: string[];
  /** CSS: los que aportan la apariencia. */
  style: string[];
  /** JavaScript y demas scripts: se conservan como archivos normales. */
  script: string[];
  /** El resto, que no participa en el modelo visual. */
  other: string[];
}

/**
 * Reparte una lista de archivos sin leer ninguno.
 *
 * Es el punto de entrada previsto para M2.1.0, que hara la lectura de verdad. Aqui
 * solo se decide quien participa, y `script` se aparta aparte para que quede
 * explicito que no se ha olvidado, sino que se ha dejado fuera a proposito.
 */
export function planProject(paths: string[]): ProjectPlan {
  const plan: ProjectPlan = { markup: [], style: [], script: [], other: [] };

  for (const path of paths) {
    plan[planFile(path).kind].push(path);
  }

  return plan;
}
