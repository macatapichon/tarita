import type { BadgeVariant } from "../components/ui";
import type { PrintStatus } from "./api";

export const STATUS_LABEL: Record<PrintStatus, string> = {
  planned: "Planificada",
  printing: "Imprimiendo",
  completed: "Completada",
  failed: "Fallida",
  cancelled: "Cancelada",
};

export const STATUS_BADGE: Record<PrintStatus, BadgeVariant> = {
  planned: "neutral",
  printing: "purple",
  completed: "income",
  failed: "expense",
  cancelled: "neutral",
};
