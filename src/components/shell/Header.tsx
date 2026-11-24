import { Menu, Moon, PanelLeft, Sun } from "lucide-react";
import { useTheme } from "../../lib/useTheme";
import { IconButton } from "../ui";
import styles from "./Header.module.css";

interface HeaderProps {
  drawer: boolean;
  onToggleSidebar: () => void;
}

export function Header({ drawer, onToggleSidebar }: HeaderProps) {
  const { resolved, setPreference } = useTheme();
  const dark = resolved === "dark";
  return (
    <header className={styles.header}>
      <IconButton icon={drawer ? Menu : PanelLeft} label={drawer ? "Abrir menú" : "Mostrar u ocultar menú"} onClick={onToggleSidebar} />
      <div className={styles.actions}>
        <IconButton icon={dark ? Sun : Moon} label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} onClick={() => setPreference(dark ? "light" : "dark")} />
      </div>
    </header>
  );
}
