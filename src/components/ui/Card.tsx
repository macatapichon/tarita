import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Card.module.css";

export function Card({ className, ...rest }: ComponentProps<"section">) {
  return <section className={cx(styles.card, className)} {...rest} />;
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function CardHeader({ title, description, actions }: CardHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <h3 className={styles.title}>{title}</h3>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

/** `flush` quita el padding para tablas que llegan de borde a borde. */
export function CardBody({ flush, className, ...rest }: ComponentProps<"div"> & { flush?: boolean }) {
  return <div className={cx(styles.body, flush && styles.flush, className)} {...rest} />;
}
