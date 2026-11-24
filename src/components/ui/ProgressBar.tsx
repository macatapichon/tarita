import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  value: number;
  max: number;
  /** Texto "$ gastado de $ total". */
  label?: ReactNode;
  "aria-label"?: string;
}

// Umbrales de presupuesto: ámbar desde 80 %, rojo al superar 100 %.
export function ProgressBar({ value, max, label, "aria-label": ariaLabel }: ProgressBarProps) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const tone = pct > 100 ? styles.over : pct >= 80 ? styles.warn : undefined;
  return (
    <div className={styles.wrap}>
      <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={ariaLabel}>
        <div className={cx(styles.fill, tone)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
