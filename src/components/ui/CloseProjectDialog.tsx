import Modal from "./Modal";

interface CloseProjectDialogProps {
  fileCount: number;
  isBusy: boolean;
  onSaveAndClose: () => void;
  onDiscardAndClose: () => void;
  onCancel: () => void;
}

function pluralFiles(count: number): string {
  return count === 1 ? "1 archivo" : `${count} archivos`;
}

function CloseProjectDialog({
  fileCount,
  isBusy,
  onSaveAndClose,
  onDiscardAndClose,
  onCancel,
}: CloseProjectDialogProps) {
  return (
    <Modal
      title="Cerrar proyecto"
      description={`Tienes ${pluralFiles(fileCount)} con cambios sin guardar.`}
      onClose={onCancel}
      width={430}
    >
      <div className="modal__footer">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={onDiscardAndClose}
          disabled={isBusy}
        >
          Descartar cambios
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={onSaveAndClose}
          disabled={isBusy}
        >
          {isBusy ? "Guardando..." : "Guardar y cerrar"}
        </button>
      </div>
    </Modal>
  );
}

export default CloseProjectDialog;
