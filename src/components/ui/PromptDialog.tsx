import { useEffect, useState, type FormEvent } from "react";

import Modal from "./Modal";

interface PromptDialogProps {
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  error?: string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

function PromptDialog({
  title,
  description,
  label,
  initialValue = "",
  confirmLabel,
  error,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialValue);
    setLocalError(null);
  }, [initialValue]);

  const message = localError ?? error ?? null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (value.trim() === "") {
      setLocalError("El nombre no puede estar vacío.");
      return;
    }

    onConfirm(value.trim());
  }

  return (
    <Modal title={title} description={description} onClose={onCancel} width={420}>
      <form onSubmit={handleSubmit}>
        <div className="modal__body">
          <label className="modal__field">
            <span className="modal__label">{label}</span>
            <input
              className="modal__input"
              type="text"
              value={value}
              autoFocus
              spellCheck={false}
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          </label>

          {message !== null && <p className="modal__error">{message}</p>}
        </div>

        <div className="modal__footer">
          <button type="button" className="button button--secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="button button--primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default PromptDialog;
