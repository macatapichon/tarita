import type { ComponentProps } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cx } from "../../lib/cx";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "sm";

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({ variant = "secondary", size = "md", icon: Icon, loading, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.btn, styles[variant], size === "sm" && styles.sm, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 size={20} strokeWidth={1.5} className={styles.spin} aria-hidden /> : Icon && <Icon size={20} strokeWidth={1.5} aria-hidden />}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  icon: LucideIcon;
  label: string;
  /** Texto del tooltip. Por defecto, el mismo que `label`. */
  tooltip?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  bordered?: boolean;
}

export function IconButton({ icon: Icon, label, tooltip, variant = "ghost", size = "md", bordered = true, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={tooltip ?? label}
      className={cx(styles.btn, styles.icon, styles[variant], size === "sm" && styles.sm, bordered && styles.bordered, className)}
      {...rest}
    >
      <Icon size={20} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
