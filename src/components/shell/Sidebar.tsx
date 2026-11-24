import { Printer } from "lucide-react";
import { cx } from "../../lib/cx";
import type { NavItem } from "./types";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  items: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  collapsed: boolean;
  drawer: boolean;
  open: boolean;
}

export function Sidebar({ items, active, onNavigate, collapsed, drawer, open }: SidebarProps) {
  const compact = collapsed && !drawer;
  return (
    <aside
      className={cx(styles.sidebar, compact && styles.collapsed, compact && styles.compact, drawer && open && styles.open)}
      inert={drawer && !open}
    >
      <div className={styles.brand}>
        <span className={styles.mark}><Printer size={24} strokeWidth={1.5} aria-hidden /></span>
        <span className={styles.name}>Tarita</span>
      </div>
      <nav aria-label="Principal">
        <p className={styles.groupLabel}>Menú</p>
        <ul className={styles.list}>
          {items.map((it) => {
            const Icon = it.icon;
            const isActive = active === it.id;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  className={cx(styles.item, isActive && styles.active)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={compact ? it.label : undefined}
                  title={compact ? it.label : undefined}
                  onClick={() => onNavigate(it.id)}
                >
                  <Icon size={24} strokeWidth={1.5} aria-hidden />
                  <span className={styles.label}>{it.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
