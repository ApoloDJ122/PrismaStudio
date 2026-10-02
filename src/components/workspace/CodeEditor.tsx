import { useEffect, useRef, useState } from "react";

import type * as Monaco from "monaco-editor";

import "../../editor/monacoEnvironment";

interface CodeEditorProps {
  path: string | null;
  language: string;
  content: string;
  revealLine: number | null;
  onChange: (content: string) => void;
  onRevealHandled: () => void;
  onError: (message: string) => void;
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
  onChange,
  onRevealHandled,
  onError,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<Monaco.editor.ITextModel | null>(null);
  const onChangeRef = useRef(onChange);
  const onRevealRef = useRef(onRevealHandled);
  const onErrorRef = useRef(onError);

  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  onChangeRef.current = onChange;
  onRevealRef.current = onRevealHandled;
  onErrorRef.current = onError;

  useEffect(() => {
    if (path === null || editorRef.current !== null) {
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

    if (monaco === null || editor === null || path === null || !isReady) {
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
      model = monaco.editor.createModel(content, language, uri);
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
  }, [content, isReady, language, path, revealLine]);

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

  if (path === null) {
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
