import { useState } from "react";
import { LayoutDashboard, Package, Printer, Tags } from "lucide-react";
import { AppShell } from "./components/shell/AppShell";
import type { NavItem } from "./components/shell/types";
import { CatalogsPage } from "./pages/CatalogsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FilamentsPage } from "./pages/FilamentsPage";
import { PrintsPage } from "./pages/PrintsPage";

const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "filaments", label: "Filamentos", icon: Package },
  { id: "prints", label: "Impresiones", icon: Printer },
  { id: "catalogs", label: "Marcas y materiales", icon: Tags },
];

function App() {
  const [active, setActive] = useState(NAV[0].id);
  return (
    <AppShell items={NAV} active={active} onNavigate={setActive}>
      {active === "dashboard" && <DashboardPage />}
      {active === "filaments" && <FilamentsPage />}
      {active === "catalogs" && <CatalogsPage />}
      {active === "prints" && <PrintsPage />}
    </AppShell>
  );
}

export default App;
