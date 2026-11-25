import { useEffect, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, Eraser, Pencil, Plus } from "lucide-react";
import { api, materialLabel, type Brand, type Filament, type FilamentInput, type Material } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Combobox,
  EmptyState,
  IconButton,
  Input,
  Modal,
  ProgressBar,
} from "../components/ui";
import styles from "./Pages.module.css";

const DEFAULT_WEIGHT_G = 1000;
const DEFAULT_DIAMETER_MM = 1.75;
const CURRENCY_PREFIX: Record<"ARS" | "USD", string> = { ARS: "$", USD: "US$" };

const formatGrams = (g: number) => `${Math.round(g).toLocaleString("es-AR")} g`;

export function FilamentsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Filament | "new" | null>(null);
  const [wasting, setWasting] = useState<Filament | null>(null);
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
                </div>
                <span className={styles.rowActions}>
                  <IconButton icon={Pencil} label={`Editar ${f.colorName}`} tooltip="Editar" onClick={() => setEditing(f)} />
                  {!f.archived && (
                    <IconButton
                      icon={Eraser}
                      label={`Agregar residuo de ${f.colorName}`}
                      tooltip="Agregar residuo"
                      onClick={() => setWasting(f)}
                    />
                  )}
                  <IconButton
                    icon={f.archived ? ArchiveRestore : Archive}
                    label={f.archived ? `Desarchivar ${f.colorName}` : `Archivar ${f.colorName}`}
                    tooltip={f.archived ? "Desarchivar" : "Archivar"}
                    onClick={() => toggleArchive(f)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {wasting && (
        <WasteModal
          filament={wasting}
          onClose={() => setWasting(null)}
          onSaved={() => {
            setWasting(null);
            filaments.reload();
          }}
        />
      )}

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
    if (!form.brandId || !form.materialId) {
      setError("Elegí una marca y un material");
      return;
    }
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
          <Combobox
            label="Marca"
            value={form.brandId}
            onChange={(v) => set("brandId", v)}
            options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
            placeholder="Buscar marca…"
          />
          <Combobox
            label="Material"
            value={form.materialId}
            onChange={(v) => set("materialId", v)}
            options={materials.map((m) => ({ value: String(m.id), label: materialLabel(m) }))}
            placeholder="Buscar material…"
          />
        </div>
        <div className={styles.grid2}>
          <Input label="Color" value={form.colorName} onChange={(e) => set("colorName", e.target.value)} required />
          <label className={styles.colorField}>
            <span>Color (muestra)</span>
            <input type="color" value={form.colorHex} onChange={(e) => set("colorHex", e.target.value)} />
          </label>
        </div>
        <div className={styles.grid2}>
          <Combobox
            label="Diámetro"
            value={form.diameterMm}
            onChange={(v) => set("diameterMm", v)}
            options={[
              { value: "1.75", label: "1.75 mm" },
              { value: "2.85", label: "2.85 mm" },
            ]}
          />
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
          <Combobox
            label="Moneda"
            value={form.currency}
            onChange={(v) => set("currency", v as "ARS" | "USD")}
            options={[
              { value: "ARS", label: "Pesos (ARS)" },
              { value: "USD", label: "Dólares (USD)" },
            ]}
          />
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
          <Input label="Fecha de compra" type="date" value={form.purchasedAt} onChange={(e) => set("purchasedAt", e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

function WasteModal({ filament, onClose, onSaved }: { filament: Filament; onClose: () => void; onSaved: () => void }) {
  const [grams, setGrams] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = grams.trim() === "" ? NaN : Number(grams.replace(",", "."));
    if (!(value > 0)) {
      setError("Ingresá una cantidad de gramos mayor a 0");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.addFilamentWaste(filament.id, value);
      onSaved();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Agregar residuo"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="waste-form" loading={saving}>Descontar</Button>
        </>
      }
    >
      <form id="waste-form" onSubmit={submit} className={styles.form}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <p>
          {filament.colorName} · {filament.brandName}. Quedan {formatGrams(filament.remainingG)}.
        </p>
        <Input
          label="Gramos descartados"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          hint="Lo que la impresora no toma y usás para otra cosa. Se descuenta del stock."
          autoFocus
          required
        />
      </form>
    </Modal>
  );
}
