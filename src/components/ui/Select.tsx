import { useId, type ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "../../lib/cx";
import { FieldShell } from "./Input";
import styles from "./Input.module.css";

interface SelectProps extends ComponentProps<"select"> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Select({ label, error, hint, className, id, children, ...rest }: SelectProps) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <FieldShell label={label} htmlFor={selectId} error={error} hint={hint}>
      <div className={cx(styles.control, className)}>
        <select
          id={selectId}
          className={cx(styles.input, styles.select, error && styles.invalid)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${selectId}-help` : undefined}
          {...rest}
        >
          {children}
        </select>
        <span className={styles.chevron}><ChevronDown size={20} strokeWidth={1.5} aria-hidden /></span>
      </div>
    </FieldShell>
  );
}
