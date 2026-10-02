import { useState, type FormEvent } from "react";

interface CreateProjectDialogProps {
  isBusy: boolean;
  error: string | null;
  onCreate: (name: string, parentDir: string) => Promise<boolean>;
  onClose: () => void;
  onPickFolder: () => Promise<string | null>;
}

function CreateProjectDialog({
  isBusy,
  error,
  onCreate,
  onClose,
  onPickFolder,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handlePickFolder() {
    const selected = await onPickFolder();

    if (selected !== null) {
      setParentDir(selected);
      setLocalError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (name.trim() === "") {
      setLocalError("Escribe un nombre para el proyecto.");
      return;
    }

    if (parentDir === "") {
      setLocalError("Selecciona la ubicación donde se creará el proyecto.");
      return;
    }

    const created = await onCreate(name, parentDir);

    if (created) {
      onClose();
    }
  }

  const message = localError ?? error;

  return (
    <div className="dialog" role="presentation">
      <form className="dialog__panel" onSubmit={handleSubmit}>
        <h2 className="dialog__title">Crear proyecto web</h2>
        <p className="dialog__description">
          Prisma generará un proyecto con index.html, style.css y script.js.
        </p>

        <div className="dialog__body">
          <label className="dialog__field">
            <span className="dialog__label">Nombre del proyecto</span>
            <input
              className="dialog__input"
              type="text"
              value={name}
              placeholder="mi-proyecto"
              autoFocus
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>

          <div className="dialog__field">
            <span className="dialog__label">Ubicación</span>
            <div className="dialog__location">
              <span
                className={`dialog__path${parentDir === "" ? " dialog__path--empty" : ""}`}
                title={parentDir}
              >
                {parentDir === "" ? "Ninguna carpeta seleccionada" : parentDir}
              </span>
              <button
                type="button"
                className="button button--secondary"
                onClick={handlePickFolder}
                disabled={isBusy}
              >
                Seleccionar
              </button>
            </div>
          </div>

          {message !== null && <p className="dialog__error">{message}</p>}
        </div>

        <div className="dialog__footer">
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
            disabled={isBusy}
          >
            Cancelar
          </button>
          <button type="submit" className="button button--primary" disabled={isBusy}>
            {isBusy ? "Creando..." : "Crear proyecto"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateProjectDialog;
