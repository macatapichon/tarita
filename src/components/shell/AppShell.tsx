import { useEffect, useState, type ReactNode } from "react";
import styles from "./AppShell.module.css";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import type { NavItem } from "./types";
import { useMediaQuery } from "./useMediaQuery";

interface AppShellProps {
  items: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  children: ReactNode;
}

export function AppShell({ items, active, onNavigate, children }: AppShellProps) {
  const drawer = useMediaQuery("(max-width: 1023px)");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "1");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawer) setDrawerOpen(false);
  }, [drawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const toggle = () => {
    if (drawer) return setDrawerOpen((v) => !v);
    setCollapsed((v) => {
      localStorage.setItem("sidebarCollapsed", v ? "0" : "1");
      return !v;
    });
  };

  const go = (id: string) => {
    onNavigate(id);
    setDrawerOpen(false);
  };

  const item = items.find((i) => i.id === active);

  return (
    <div className={styles.shell}>
      <Sidebar items={items} active={active} onNavigate={go} collapsed={collapsed} drawer={drawer} open={drawerOpen} />
      {drawer && drawerOpen && <div className={styles.overlay} onClick={() => setDrawerOpen(false)} aria-hidden />}
      <div className={styles.column}>
        <Header drawer={drawer} onToggleSidebar={toggle} />
        <main className={styles.main}>
          <div className={styles.content}>
            <h1 className={styles.title}>{item?.label ?? ""}</h1>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
