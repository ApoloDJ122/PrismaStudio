import Modal from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  extraLabel?: string;
  onConfirm: () => void;
  onExtra?: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancelar",
  danger = false,
  extraLabel,
  onConfirm,
  onExtra,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel} width={420}>
      <p className="modal__body">{message}</p>

      <div className="modal__footer">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        {extraLabel !== undefined && onExtra !== undefined && (
          <button type="button" className="button button--secondary" onClick={onExtra}>
            {extraLabel}
          </button>
        )}
        <button
          type="button"
          className={`button ${danger ? "button--danger" : "button--primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
