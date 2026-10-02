import { useEffect, useRef, useState, type RefObject } from "react";

import type * as Monaco from "monaco-editor";

import "../../editor/monacoEnvironment";

export type CursorPosition = {
  line: number;
  column: number;
};

/** Acciones del editor que la interfaz necesita disparar desde un atajo. */
export type CodeEditorApi = {
  /** Abre la búsqueda dentro del archivo. F3 y Shift+F3 los gestiona Monaco. */
  search: () => void;
};

interface CodeEditorProps {
  path: string | null | undefined;
  language: string;
  content: string;
  revealLine: number | null;
  apiRef?: RefObject<CodeEditorApi | null>;
  onChange: (content: string) => void;
  onRevealHandled: () => void;
  onCursorChange?: (position: CursorPosition) => void;
  onError: (message: string) => void;
}

/** Detecta el lenguaje de Monaco basado en la extensión del archivo. */
function detectLanguage(path: string | null | undefined): string {
  if (path === null || path === undefined || path === "") {
    return "plaintext";
  }

  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();

  switch (ext) {
    case ".html":
    case ".htm":
      return "html";
    case ".css":
      return "css";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".json":
      return "json";
    default:
      return "plaintext";
  }
}

/**
 * Monaco se carga bajo demanda la primera vez que se abre un archivo, de modo
 * que la pantalla inicial no descarga el paquete del editor.
 */
function CodeEditor({
  path,
  language,
  content,
  revealLine,
  apiRef,
  onChange,
  onRevealHandled,
  onCursorChange,
  onError,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<Monaco.editor.ITextModel | null>(null);
  const onChangeRef = useRef(onChange);
  const onRevealRef = useRef(onRevealHandled);
  const onCursorRef = useRef(onCursorChange);
  const onErrorRef = useRef(onError);

  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  onChangeRef.current = onChange;
  onRevealRef.current = onRevealHandled;
  onCursorRef.current = onCursorChange;
  onErrorRef.current = onError;

  // Detectar lenguaje si no se proporciona o si la extensión coincide
  const effectiveLanguage = detectLanguage(path) !== "plaintext" ? detectLanguage(path) : language;

  useEffect(() => {
    if (path === null || path === undefined || editorRef.current !== null) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    import("monaco-editor")
      .then((monaco) => {
        if (cancelled || containerRef.current === null) {
          return;
        }

        monacoRef.current = monaco;
        editorRef.current = monaco.editor.create(containerRef.current, {
          theme: "vs-dark",
          automaticLayout: true,
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          tabSize: 2,
          renderWhitespace: "selection",
          smoothScrolling: true,
        });

        setIsReady(true);
      })
      .catch(() => {
        onErrorRef.current(
          "No se pudo cargar el editor. Reinicia la aplicacion e intentalo de nuevo.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      editorRef.current?.dispose();
      editorRef.current = null;
      modelRef.current?.dispose();
      modelRef.current = null;
      monacoRef.current = null;
      setIsReady(false);
    };
  }, [path]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;

    if (monaco === null || editor === null || path === null || path === undefined || !isReady) {
      return;
    }

    const uri = monaco.Uri.parse(`inmemory://model/${path}`);
    const existing = modelRef.current;
    const isSame = existing !== null && existing.uri.toString() === uri.toString();

    let model: Monaco.editor.ITextModel;

    if (existing !== null && isSame) {
      model = existing;
    } else {
      existing?.dispose();
      model = monaco.editor.createModel(content, effectiveLanguage, uri);
      modelRef.current = model;
    }

    editor.setModel(model);

    // Un cambio que no viene del editor (por ejemplo, al descartar) se aplica aqui.
    if (model.getValue() !== content) {
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: content }],
        () => null,
      );
    }

    if (revealLine !== null) {
      editor.revealLineInCenter(revealLine);
      editor.setPosition({ lineNumber: revealLine, column: 1 });
      editor.focus();
      onRevealRef.current();
    }
  }, [content, isReady, effectiveLanguage, path, revealLine]);

  useEffect(() => {
    const editor = editorRef.current;

    if (editor === null) {
      return;
    }

    const subscription = editor.onDidChangeModelContent(() => {
      const model = modelRef.current;

      if (model !== null) {
        onChangeRef.current(model.getValue());
      }
    });

    return () => subscription.dispose();
  }, [isReady]);

  // La posición del cursor alimenta la barra de estado y se recuerda en la sesión.
  useEffect(() => {
    const editor = editorRef.current;

    if (editor === null || onCursorRef.current === undefined) {
      return;
    }

    function report() {
      const current = editorRef.current;
      const handler = onCursorRef.current;

      if (current === null || handler === undefined) {
        return;
      }

      const position = current.getPosition();

      if (position === null) {
        return;
      }

      handler({ line: position.lineNumber, column: position.column });
    }

    report();

    const subscriptions = [
      editor.onDidChangeCursorPosition(report),
      editor.onDidChangeCursorSelection(report),
    ];

    return () => {
      for (const subscription of subscriptions) {
        subscription.dispose();
      }
    };
  }, [isReady, path]);

  // Publica las acciones del editor para que los atajos puedan dispararlas.
  useEffect(() => {
    if (apiRef === undefined) {
      return;
    }

    apiRef.current = {
      search: () => {
        const editor = editorRef.current;

        if (editor === null) {
          return;
        }

        editor.focus();
        editor.trigger("prisma", "actions.find", {});
      },
    };

    return () => {
      apiRef.current = null;
    };
  }, [apiRef, isReady, path]);

  if (path === null || path === undefined) {
    return (
      <div className="editor editor--empty">
        <p className="editor__placeholder">
          Selecciona un archivo del arbol para editarlo.
        </p>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor__host" ref={containerRef} />
      {isLoading && <p className="editor__loading">Cargando editor...</p>}
    </div>
  );
}

export default CodeEditor;