import { invoke } from "@tauri-apps/api/core";

export interface Brand {
  id: number;
  name: string;
  archived: boolean;
}

export interface Material {
  id: number;
  name: string;
  variant: string | null;
  archived: boolean;
}

export interface Filament {
  id: number;
  brandId: number;
  brandName: string;
  materialId: number;
  materialName: string;
  materialVariant: string | null;
  colorName: string;
  colorHex: string | null;
  diameterMm: number;
  initialWeightG: number;
  price: number | null;
  currency: "ARS" | "USD";
  purchasedAt: string | null;
  archived: boolean;
  remainingG: number;
}

export interface FilamentInput {
  brandId: number;
  materialId: number;
  colorName: string;
  colorHex: string | null;
  diameterMm: number;
  initialWeightG: number;
  price: number | null;
  currency: "ARS" | "USD";
  purchasedAt: string | null;
}

export type PrintStatus = "planned" | "printing" | "completed" | "failed" | "cancelled";

export interface PrintFilament {
  filamentId: number;
  brandName: string;
  materialName: string;
  materialVariant: string | null;
  colorName: string;
  colorHex: string | null;
  gramsUsed: number | null;
  currency: "ARS" | "USD";
  cost: number | null;
}

export interface CurrencyAmount {
  currency: "ARS" | "USD";
  amount: number;
}

export interface Print {
  id: number;
  name: string;
  description: string | null;
  status: PrintStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  filaments: PrintFilament[];
  costs: CurrencyAmount[];
}

export interface PrintFilamentInput {
  filamentId: number;
}

export interface PrintInput {
  name: string;
  description: string | null;
  filaments: PrintFilamentInput[];
}

export interface GramsUsedInput {
  filamentId: number;
  gramsUsed: number;
}

export interface CostReportRow {
  filamentId: number;
  brandName: string;
  materialName: string;
  materialVariant: string | null;
  colorName: string;
  colorHex: string | null;
  currency: "ARS" | "USD";
  invested: number;
  spent: number;
}

export interface CurrencyTotal {
  currency: "ARS" | "USD";
  invested: number;
  spent: number;
}

export interface CostReport {
  year: number;
  /** null = año completo. */
  month: number | null;
  rows: CostReportRow[];
  totals: CurrencyTotal[];
}

export interface CurrencyValue {
  currency: "ARS" | "USD";
  value: number;
}

export interface StockSummary {
  remainingG: number;
  value: CurrencyValue[];
}

export interface WasteSummary {
  grams: number;
  value: CurrencyValue[];
}

export interface DashboardSummary {
  stock: StockSummary;
  waste: WasteSummary;
  recentPrints: Print[];
}

export const api = {
  listBrands: (includeArchived: boolean) => invoke<Brand[]>("list_brands", { includeArchived }),
  saveBrand: (id: number | null, name: string) => invoke<Brand>("save_brand", { id, name }),
  setBrandArchived: (id: number, archived: boolean) => invoke<Brand>("set_brand_archived", { id, archived }),
  listMaterials: (includeArchived: boolean) => invoke<Material[]>("list_materials", { includeArchived }),
  saveMaterial: (id: number | null, name: string, variant: string | null) =>
    invoke<Material>("save_material", { id, name, variant }),
  setMaterialArchived: (id: number, archived: boolean) =>
    invoke<Material>("set_material_archived", { id, archived }),
  listFilaments: (includeArchived: boolean) => invoke<Filament[]>("list_filaments", { includeArchived }),
  createFilament: (input: FilamentInput) => invoke<Filament>("create_filament", { input }),
  updateFilament: (id: number, input: FilamentInput) => invoke<Filament>("update_filament", { id, input }),
  setFilamentArchived: (id: number, archived: boolean) =>
    invoke<Filament>("set_filament_archived", { id, archived }),
  addFilamentWaste: (id: number, grams: number) =>
    invoke<Filament>("add_filament_waste", { id, grams }),
  listPrints: () => invoke<Print[]>("list_prints"),
  createPrint: (input: PrintInput, status: PrintStatus, gramsUsed: GramsUsedInput[]) =>
    invoke<Print>("create_print", { input, status, gramsUsed }),
  updatePrint: (id: number, input: PrintInput, gramsUsed: GramsUsedInput[]) =>
    invoke<Print>("update_print", { id, input, gramsUsed }),
  changePrintStatus: (id: number, status: PrintStatus, gramsUsed: GramsUsedInput[] | null) =>
    invoke<Print>("change_print_status", { id, status, gramsUsed }),
  deletePrint: (id: number) => invoke<void>("delete_print", { id }),
  costReport: (year: number, month: number | null) => invoke<CostReport>("cost_report", { year, month }),
  dashboardSummary: () => invoke<DashboardSummary>("dashboard_summary"),
};

export function materialLabel(m: { name: string; variant: string | null }): string {
  return m.variant ? `${m.name} ${m.variant}` : m.name;
}
