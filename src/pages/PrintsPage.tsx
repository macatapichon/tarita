import { useEffect, useRef, useState, type FormEvent } from "react";
import { Ban, Eye, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
  api,
  materialLabel,
  type Filament,
  type GramsUsedInput,
  type Print,
  type PrintInput,
  type PrintStatus,
} from "../lib/api";
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
  Select,
} from "../components/ui";
import { STATUS_BADGE, STATUS_LABEL } from "../lib/printStatus";
import styles from "./Pages.module.css";

const STATUSES: PrintStatus[] = ["planned", "printing", "completed", "failed", "cancelled"];

type ActionKind = "complete" | "fail" | "cancel" | "delete";
type Dialog =
  | { kind: "form"; print?: Print }
  | { kind: "detail"; print: Print }
  | { kind: "action"; print: Print; action: ActionKind };

const formatGrams = (g: number) => `${Math.round(g).toLocaleString("es-AR")} g`;
const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount);
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("es-AR");
const parseGrams = (s: string) => Number(s.trim().replace(",", "."));

export function PrintsPage() {
  const prints = useLoad(() => api.listPrints(), []);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const start = async (p: Print) => {
    setActionError(null);
    try {
      await api.changePrintStatus(p.id, "printing", null);
      prints.reload();
    } catch (e) {
      setActionError(String(e));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <span />
        <Button variant="primary" icon={Plus} onClick={() => setDialog({ kind: "form" })}>
          Nueva impresión
        </Button>
      </div>
      {actionError && <p className={styles.error} role="alert">{actionError}</p>}
      {prints.error && <p className={styles.error} role="alert">{prints.error}</p>}

      <Card>
        <CardBody flush>
          {prints.data && prints.data.length === 0 && (
            <EmptyState
              icon={Plus}
              title="Todavía no hay impresiones"
              description="Cargá una impresión y los filamentos que va a usar para reservar su stock."
            />
          )}
          <ul className={styles.list}>
            {prints.data?.map((p) => {
              const open = p.status === "planned" || p.status === "printing";
              return (
                <li key={p.id} className={styles.filamentRow}>
                  <div className={styles.filamentInfo}>
                    <div className={styles.rowTitle}>
                      {p.name}
                      <Badge variant={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </div>
                    {p.description && <p className={styles.description}>{p.description}</p>}
                    <div className={styles.meta}>
                      {p.filaments.map((f) => (
                        <span key={f.filamentId} className={styles.usage}>
                          <span
                            className={styles.swatchSm}
                            style={{ background: f.colorHex ?? "transparent" }}
                            aria-hidden
                          />
                          {f.colorName} · {f.gramsUsed != null ? formatGrams(f.gramsUsed) : `${formatGrams(f.gramsEstimated)} estimados`}
                        </span>
                      ))}
                      <span>Creada {formatDate(p.createdAt)}</span>
                      {p.finishedAt && <span>Terminada {formatDate(p.finishedAt)}</span>}
                    </div>
                  </div>
                  <span className={styles.rowActions}>
                    <IconButton icon={Eye} label={`Ver detalle de ${p.name}`} onClick={() => setDialog({ kind: "detail", print: p })} />
                    {p.status === "planned" && (
                      <Button size="sm" icon={Play} onClick={() => start(p)}>Iniciar</Button>
                    )}
                    {open && (
                      <>
                        <Button size="sm" onClick={() => setDialog({ kind: "action", print: p, action: "complete" })}>
                          Completar
                        </Button>
                        <Button size="sm" onClick={() => setDialog({ kind: "action", print: p, action: "fail" })}>
                          Fallar
                        </Button>
                        <Button size="sm" variant="ghost" icon={Ban} onClick={() => setDialog({ kind: "action", print: p, action: "cancel" })}>
                          Cancelar
                        </Button>
                        <IconButton icon={Pencil} label={`Editar ${p.name}`} onClick={() => setDialog({ kind: "form", print: p })} />
                      </>
                    )}
                    {p.status === "planned" && (
                      <IconButton
                        icon={Trash2}
                        label={`Eliminar ${p.name}`}
                        onClick={() => setDialog({ kind: "action", print: p, action: "delete" })}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {dialog?.kind === "form" && (
        <PrintModal
          print={dialog.print}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            prints.reload();
          }}
        />
      )}
      {dialog?.kind === "detail" && <PrintDetailModal print={dialog.print} onClose={() => setDialog(null)} />}
      {dialog?.kind === "action" && (
        <ActionModal
          print={dialog.print}
          action={dialog.action}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            prints.reload();
          }}
        />
      )}
    </div>
  );
}

interface FilamentRow {
  key: number;
  filamentId: string;
  grams: string;
  used: string;
}

interface PrintFormState {
  name: string;
  description: string;
  status: PrintStatus;
  rows: FilamentRow[];
}

function initialForm(print?: Print): PrintFormState {
  return {
    name: print?.name ?? "",
    description: print?.description ?? "",
    status: "planned",
    rows: print
      ? print.filaments.map((f, i) => ({ key: i, filamentId: String(f.filamentId), grams: String(f.gramsEstimated), used: "" }))
      : [{ key: 0, filamentId: "", grams: "", used: "" }],
  };
}

function toInput(form: PrintFormState): PrintInput {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    filaments: form.rows.map((r) => {
      if (r.filamentId === "") throw new Error("Elegí un filamento en cada fila");
      const gramsEstimated = parseGrams(r.grams);
      if (!Number.isFinite(gramsEstimated)) throw new Error("Ingresá los gramos estimados de cada filamento");
      return { filamentId: Number(r.filamentId), gramsEstimated };
    }),
  };
}

/// Solo aplica al crear como completada o fallida. Al completar, vacío = estimados.
function toGramsUsed(form: PrintFormState): GramsUsedInput[] {
  if (form.status !== "completed" && form.status !== "failed") return [];
  return form.rows.flatMap((r) => {
    const raw = r.used.trim();
    if (raw === "") {
      if (form.status === "failed") throw new Error("Ingresá los gramos usados de cada filamento");
      return [];
    }
    const value = parseGrams(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error("Los gramos usados no son válidos");
    return [{ filamentId: Number(r.filamentId), gramsUsed: value }];
  });
}

function PrintModal({ print, onClose, onSaved }: { print?: Print; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<PrintFormState>(() => initialForm(print));
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(form.rows.length);
  const showUsed = !print && (form.status === "completed" || form.status === "failed");

  useEffect(() => {
    api.listFilaments(true).then(setFilaments, (e: unknown) => setError(String(e)));
  }, []);

  const set = <K extends keyof PrintFormState>(key: K, value: PrintFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setRow = (key: number, patch: Partial<FilamentRow>) =>
    set("rows", form.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Al editar, la reserva actual de la propia impresión vuelve a estar disponible.
  const ownReserved = (filamentId: number) =>
    print?.filaments.find((f) => f.filamentId === filamentId)?.gramsEstimated ?? 0;
  const freeOf = (f: Filament) => f.freeG + ownReserved(f.id);

  const optionsFor = (row: FilamentRow) =>
    filaments.filter((f) => {
      const inUseElsewhere = form.rows.some((o) => o.key !== row.key && o.filamentId === String(f.id));
      const keepArchived = !f.archived || print?.filaments.some((pf) => pf.filamentId === f.id);
      return keepArchived && !inUseElsewhere;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input = toInput(form);
      if (print) {
        await api.updatePrint(print.id, input);
      } else {
        await api.createPrint(input, form.status, toGramsUsed(form));
      }
      onSaved();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };


  return (
    <Modal
      title={print ? "Editar impresión" : "Nueva impresión"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="print-form" loading={saving}>Guardar</Button>
        </>
      }
    >
      <form id="print-form" onSubmit={submit} className={styles.form}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Input label="Nombre" value={form.name} onChange={(e) => set("name", e.target.value)} required />
        <Input
          label="Descripción"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Opcional"
        />

        {!print && (
          <Select label="Estado" value={form.status} onChange={(e) => set("status", e.target.value as PrintStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>
        )}

        <div className={styles.filamentsBlock}>
          <span className={styles.sectionLabel}>Filamentos</span>
          {form.rows.map((row) => {
            const selected = filaments.find((f) => String(f.id) === row.filamentId);
            const grams = parseGrams(row.grams);
            const over = selected && Number.isFinite(grams) && grams > freeOf(selected);
            return (
              <div
                key={row.key}
                className={`${styles.filamentFields} ${showUsed ? styles.filamentFieldsWithUsed : ""}`}
              >
                <Select
                  label="Filamento"
                  value={row.filamentId}
                  onChange={(e) => setRow(row.key, { filamentId: e.target.value })}
                  required
                >
                  <option value="" disabled>Elegí un filamento</option>
                  {optionsFor(row).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.colorName} · {f.brandName} {materialLabel({ name: f.materialName, variant: f.materialVariant })}
                      {f.archived ? " (archivado)" : ""} — libre {formatGrams(freeOf(f))}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Gramos estimados"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={row.grams}
                  onChange={(e) => setRow(row.key, { grams: e.target.value })}
                  error={over ? `Supera lo libre (${formatGrams(freeOf(selected))})` : undefined}
                  required
                />
                {showUsed && (
                  <Input
                    label="Gramos usados"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={row.used}
                    onChange={(e) => setRow(row.key, { used: e.target.value })}
                    hint={form.status === "completed" ? "Vacío = estimados" : "Gramos realmente gastados"}
                    required={form.status === "failed"}
                  />
                )}
                <IconButton
                  icon={Trash2}
                  label="Quitar filamento"
                  disabled={form.rows.length === 1}
                  onClick={() => set("rows", form.rows.filter((r) => r.key !== row.key))}
                />
              </div>
            );
          })}
          <div>
            <Button
              size="sm"
              icon={Plus}
              onClick={() =>
                set("rows", [...form.rows, { key: nextKey.current++, filamentId: "", grams: "", used: "" }])
              }
            >
              Agregar filamento
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function PrintDetailModal({ print, onClose }: { print: Print; onClose: () => void }) {
  return (
    <Modal
      title={print.name}
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className={styles.form}>
        <div className={styles.meta}>
          <Badge variant={STATUS_BADGE[print.status]}>{STATUS_LABEL[print.status]}</Badge>
          <span>Creada {formatDate(print.createdAt)}</span>
          {print.startedAt && <span>Iniciada {formatDate(print.startedAt)}</span>}
          {print.finishedAt && <span>Terminada {formatDate(print.finishedAt)}</span>}
        </div>
        {print.description && <p className={styles.description}>{print.description}</p>}

        <div className={styles.filamentsBlock}>
          <span className={styles.sectionLabel}>Filamentos</span>
          <ul className={styles.list}>
            {print.filaments.map((f) => (
              <li key={f.filamentId} className={styles.filamentRow}>
                <div className={styles.filamentInfo}>
                  <div className={styles.usage}>
                    <span
                      className={styles.swatchSm}
                      style={{ background: f.colorHex ?? "transparent" }}
                      aria-hidden
                    />
                    <strong>{f.colorName}</strong> · {f.brandName} {materialLabel({ name: f.materialName, variant: f.materialVariant })}
                  </div>
                  <div className={styles.meta}>
                    <span>Estimado {formatGrams(f.gramsEstimated)}</span>
                    <span>Usado {f.gramsUsed != null ? formatGrams(f.gramsUsed) : "—"}</span>
                  </div>
                </div>
                <span className={styles.rowActions}>
                  {f.cost != null ? formatMoney(f.cost, f.currency) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.meta}>
          {print.costs.length === 0 && <span>Sin costo registrado</span>}
          {print.costs.map((c) => (
            <span key={c.currency}>
              <strong>Costo total:</strong> {formatMoney(c.amount, c.currency)}
            </span>
          ))}
        </div>
      </div>
    </Modal>
  );
}


function ActionModal({
  print,
  action,
  onClose,
  onDone,
}: {
  print: Print;
  action: ActionKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const [grams, setGrams] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      print.filaments.map((f) => [f.filamentId, action === "complete" ? String(f.gramsEstimated) : ""]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsGrams = action === "complete" || action === "fail";

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (action === "delete") {
        await api.deletePrint(print.id);
      } else if (action === "cancel") {
        await api.changePrintStatus(print.id, "cancelled", null);
      } else {
        const gramsUsed: GramsUsedInput[] = print.filaments.map((f) => {
          const raw = (grams[f.filamentId] ?? "").trim();
          if (raw === "") throw new Error(`Ingresá los gramos usados de ${f.colorName}`);
          const value = parseGrams(raw);
          if (!Number.isFinite(value)) throw new Error(`Los gramos de ${f.colorName} no son válidos`);
          return { filamentId: f.filamentId, gramsUsed: value };
        });
        await api.changePrintStatus(print.id, action === "complete" ? "completed" : "failed", gramsUsed);
      }
      onDone();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  const title = {
    complete: "Completar impresión",
    fail: "Registrar impresión fallida",
    cancel: "Cancelar impresión",
    delete: "Eliminar impresión",
  }[action];

  const confirmLabel = {
    complete: "Completar",
    fail: "Registrar fallo",
    cancel: "Cancelar impresión",
    delete: "Eliminar",
  }[action];

  const description = {
    complete: "Confirmá los gramos realmente usados. Por defecto son los estimados.",
    fail: "Indicá cuántos gramos se gastaron realmente antes de la falla.",
    cancel: "La impresión se cancela y no descuenta stock.",
    delete: "Se elimina la impresión planificada y se libera su reserva.",
  }[action];

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Volver</Button>
          <Button
            variant={action === "complete" ? "primary" : "danger"}
            loading={saving}
            onClick={submit}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <p className={styles.description}>
          <strong>{print.name}</strong>. {description}
        </p>
        {needsGrams &&
          print.filaments.map((f) => (
            <Input
              key={f.filamentId}
              label={`Gramos usados · ${f.colorName}`}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={grams[f.filamentId] ?? ""}
              onChange={(e) => setGrams((prev) => ({ ...prev, [f.filamentId]: e.target.value }))}
              hint={`Estimados: ${formatGrams(f.gramsEstimated)}`}
              required={action === "fail"}
            />
          ))}
      </div>
    </Modal>
  );
}
