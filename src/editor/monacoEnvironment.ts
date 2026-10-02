import editorWorker from "monaco-editor/editor/editor.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";

type MonacoEnvironment = {
  getWorker: (moduleId: string, label: string) => Worker;
};

// Monaco delega el resaltado semantico y algunos servicios a workers. Vite los
// empaqueta como modulos-worker, de modo que la aplicacion funciona sin conexion.
(globalThis as unknown as { MonacoEnvironment: MonacoEnvironment }).MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "json") {
      return new jsonWorker();
    }

    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }

    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }

    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }

    return new editorWorker();
  },
};
