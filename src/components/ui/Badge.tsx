import type { ComponentProps } from "react";
import { cx } from "../../lib/cx";
import styles from "./Badge.module.css";

export type BadgeVariant = "income" | "expense" | "warning" | "brand" | "purple" | "neutral";

export function Badge({ variant = "neutral", className, ...rest }: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return <span className={cx(styles.badge, styles[variant], className)} {...rest} />;
}
