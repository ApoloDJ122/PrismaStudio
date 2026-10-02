import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title: string;
  description?: string;
  children?: ReactNode;
  onClose: () => void;
  width?: number;
}

function Modal({ title, description, children, onClose, width }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal__panel" role="dialog" aria-modal="true" style={width ? { width } : undefined}>
        <h2 className="modal__title">{title}</h2>
        {description !== undefined && <p className="modal__description">{description}</p>}
        {children}
      </div>
    </div>
  );
}

export default Modal;
