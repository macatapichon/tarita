import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "../../lib/cx";
import { IconButton } from "./Button";
import styles from "./Modal.module.css";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Botones alineados a la derecha (secundario + primario). */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

export function Modal({ title, onClose, children, footer, size = "md" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // <dialog> modal aporta atrapar el foco, Esc e inertizar el fondo.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("input, select, textarea")?.focus();
    }
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={cx(styles.panel, size === "sm" && styles.sm, size === "lg" && styles.lg)}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <IconButton icon={X} label="Cerrar" size="sm" bordered={false} onClick={onClose} />
        </div>
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </dialog>
  );
}
