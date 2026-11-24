import { useId, type ComponentProps, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "../../lib/cx";
import styles from "./Input.module.css";

interface InputProps extends Omit<ComponentProps<"input">, "prefix"> {
  label?: string;
  icon?: LucideIcon;
  error?: string;
  hint?: string;
  variant?: "default" | "amount";
  /** Prefijo de moneda dentro del input (solo variante de monto). */
  prefix?: string;
}

export function Input({ label, icon: Icon, error, hint, variant = "default", prefix, className, id, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const helpId = `${inputId}-help`;
  const isAmount = variant === "amount";
  return (
    <div className={cx(styles.field, className)}>
      {label && <label htmlFor={inputId} className={styles.label}>{label}</label>}
      <div className={styles.control}>
        {Icon && <span className={styles.icon}><Icon size={20} strokeWidth={1.5} aria-hidden /></span>}
        {isAmount && prefix && <span className={styles.prefix} aria-hidden>{prefix}</span>}
        <input
          id={inputId}
          className={cx(styles.input, Icon && styles.withIcon, isAmount && styles.amount, error && styles.invalid)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? helpId : undefined}
          inputMode={isAmount ? "decimal" : undefined}
          {...rest}
        />
      </div>
      {(error || hint) && <span id={helpId} className={error ? styles.error : styles.help}>{error ?? hint}</span>}
    </div>
  );
}

export function FieldShell({ label, htmlFor, error, hint, children }: { label?: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      {label && <label htmlFor={htmlFor} className={styles.label}>{label}</label>}
      {children}
      {(error || hint) && <span id={`${htmlFor}-help`} className={error ? styles.error : styles.help}>{error ?? hint}</span>}
    </div>
  );
}
