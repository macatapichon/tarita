import { useEffect, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { api, materialLabel, type Brand, type Filament, type FilamentInput, type Material } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  Select,
} from "../components/ui";
import styles from "./Pages.module.css";

const DEFAULT_WEIGHT_G = 1000;
const DEFAULT_LOW_STOCK_G = 100;
const DEFAULT_DIAMETER_MM = 1.75;
const CURRENCY_PREFIX: Record<"ARS" | "USD", string> = { ARS: "$", USD: "US$" };

const formatGrams = (g: number) => `${Math.round(g).toLocaleString("es-AR")} g`;

export function FilamentsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Filament | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const filaments = useLoad(() => api.listFilaments(showArchived), [showArchived]);

  const toggleArchive = async (f: Filament) => {
    setActionError(null);
    try {
      await api.setFilamentArchived(f.id, !f.archived);
      filaments.reload();
    } catch (e) {
      setActionError(String(e));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Mostrar archivados
        </label>
        <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
          Nuevo filamento
        </Button>
      </div>
      {actionError && <p className={styles.error} role="alert">{actionError}</p>}
      {filaments.error && <p className={styles.error} role="alert">{filaments.error}</p>}

      <Card>
        <CardBody flush>
          {filaments.data && filaments.data.length === 0 && (
            <EmptyState
              icon={Plus}
              title="Todavía no hay filamentos"
              description="Dá de alta tu primer carrete para empezar a llevar el stock."
            />
          )}
          <ul className={styles.list}>
            {filaments.data?.map((f) => (
              <li key={f.id} className={styles.filamentRow}>
                <span
                  className={styles.swatch}
                  style={{ background: f.colorHex ?? "transparent" }}
                  aria-hidden
                />
                <div className={styles.filamentInfo}>
                  <div className={styles.rowTitle}>
                    {f.colorName} · {f.brandName} {materialLabel({ name: f.materialName, variant: f.materialVariant })}
                    {f.archived && <Badge variant="neutral">Archivado</Badge>}
                  </div>
                  <ProgressBar
                    value={Math.max(f.remainingG, 0)}
                    max={f.initialWeightG}
                    label={`${formatGrams(f.remainingG)} restantes de ${formatGrams(f.initialWeightG)}`}
                    aria-label={`Stock de ${f.colorName}`}
                  />
                  <div className={styles.meta}>
                    {f.reservedG > 0 && <span>{formatGrams(f.reservedG)} reservados</span>}
                    <span>Libre: {formatGrams(f.freeG)}</span>
                    {f.remainingG <= f.lowStockThresholdG && <Badge variant="warning">Stock bajo</Badge>}
                  </div>
                </div>
                <span className={styles.rowActions}>
                  <IconButton icon={Pencil} label={`Editar ${f.colorName}`} onClick={() => setEditing(f)} />
                  <IconButton
                    icon={f.archived ? ArchiveRestore : Archive}
                    label={f.archived ? `Desarchivar ${f.colorName}` : `Archivar ${f.colorName}`}
                    onClick={() => toggleArchive(f)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {editing && (
        <FilamentModal
          filament={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            filaments.reload();
          }}
        />
      )}
    </div>
  );
}

interface FormState {
  brandId: string;
  materialId: string;
  colorName: string;
  colorHex: string;
  diameterMm: string;
  initialWeightG: string;
  lowStockThresholdG: string;
  currency: "ARS" | "USD";
  price: string;
  purchasedAt: string;
}

function initialForm(f?: Filament): FormState {
  return {
    brandId: f ? String(f.brandId) : "",
    materialId: f ? String(f.materialId) : "",
    colorName: f?.colorName ?? "",
    colorHex: f?.colorHex ?? "#FFFFFF",
    diameterMm: String(f?.diameterMm ?? DEFAULT_DIAMETER_MM),
    initialWeightG: String(f?.initialWeightG ?? DEFAULT_WEIGHT_G),
    lowStockThresholdG: String(f?.lowStockThresholdG ?? DEFAULT_LOW_STOCK_G),
    currency: f?.currency ?? "ARS",
    price: f?.price != null ? String(f.price) : "",
    purchasedAt: f?.purchasedAt ?? "",
  };
}

function toInput(form: FormState): FilamentInput {
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
  const price = form.price.trim() === "" ? null : num(form.price);
  return {
    brandId: Number(form.brandId),
    materialId: Number(form.materialId),
    colorName: form.colorName,
    colorHex: form.colorHex || null,
    diameterMm: num(form.diameterMm),
    initialWeightG: num(form.initialWeightG),
    lowStockThresholdG: num(form.lowStockThresholdG),
    price,
    currency: form.currency,
    purchasedAt: form.purchasedAt || null,
  };
}

function FilamentModal({ filament, onClose, onSaved }: { filament?: Filament; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(() => initialForm(filament));
  const [brands, setBrands] = useState<Brand[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Solo activos en los selectores; un filamento existente con marca/material archivados conserva su valor.
    Promise.all([api.listBrands(false), api.listMaterials(false)]).then(([b, m]) => {
      setBrands(b);
      setMaterials(m);
    }, (e: unknown) => setError(String(e)));
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input = toInput(form);
      if (filament) await api.updateFilament(filament.id, input);
      else await api.createFilament(input);
      onSaved();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={filament ? "Editar filamento" : "Nuevo filamento"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="filament-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="filament-form" onSubmit={submit} className={styles.form}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.grid2}>
          <Select label="Marca" value={form.brandId} onChange={(e) => set("brandId", e.target.value)} required>
            <option value="" disabled>Elegí una marca</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select label="Material" value={form.materialId} onChange={(e) => set("materialId", e.target.value)} required>
            <option value="" disabled>Elegí un material</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{materialLabel(m)}</option>)}
          </Select>
        </div>
        <div className={styles.grid2}>
          <Input label="Color" value={form.colorName} onChange={(e) => set("colorName", e.target.value)} required />
          <label className={styles.colorField}>
            <span>Color (muestra)</span>
            <input type="color" value={form.colorHex} onChange={(e) => set("colorHex", e.target.value)} />
          </label>
        </div>
        <div className={styles.grid2}>
          <Select label="Diámetro" value={form.diameterMm} onChange={(e) => set("diameterMm", e.target.value)}>
            <option value="1.75">1.75 mm</option>
            <option value="2.85">2.85 mm</option>
          </Select>
          <Input
            label="Peso inicial (g)"
            type="number"
            min="1"
            step="any"
            inputMode="decimal"
            value={form.initialWeightG}
            onChange={(e) => set("initialWeightG", e.target.value)}
            hint="Los filamentos suelen venderse por kilo: 1000 g sin carrete."
            required
          />
        </div>
        <div className={styles.grid2}>
          <Select label="Moneda" value={form.currency} onChange={(e) => set("currency", e.target.value as "ARS" | "USD")}>
            <option value="ARS">Pesos (ARS)</option>
            <option value="USD">Dólares (USD)</option>
          </Select>
          <Input
            label="Precio"
            variant="amount"
            prefix={CURRENCY_PREFIX[form.currency]}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className={styles.grid2}>
          <Input
            label="Aviso de stock bajo (g)"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={form.lowStockThresholdG}
            onChange={(e) => set("lowStockThresholdG", e.target.value)}
          />
          <Input label="Fecha de compra" type="date" value={form.purchasedAt} onChange={(e) => set("purchasedAt", e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
