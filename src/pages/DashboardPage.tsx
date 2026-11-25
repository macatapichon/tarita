import { useState } from "react";
import { BarChart3, Printer } from "lucide-react";
import {
  api,
  materialLabel,
  type CostReport,
  type DashboardSummary,
} from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { STATUS_BADGE, STATUS_LABEL } from "../lib/printStatus";
import { Badge, Card, CardBody, CardHeader, Combobox, EmptyState } from "../components/ui";
import styles from "./Pages.module.css";
import dashboard from "./DashboardPage.module.css";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount);
const formatOrDash = (amount: number, currency: string) =>
  amount === 0 ? "—" : formatMoney(amount, currency);
const formatGrams = (g: number) => `${Math.round(g).toLocaleString("es-AR")} g`;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("es-AR");

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={dashboard.tile}>
      <span className={dashboard.label}>{label}</span>
      <span className={dashboard.value}>{value}</span>
    </div>
  );
}

export function DashboardPage() {
  const summary = useLoad<DashboardSummary>(() => api.dashboardSummary(), []);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState("");
  const report = useLoad<CostReport>(
    () => api.costReport(year, month ? Number(month) : null),
    [year, month],
  );
  const period = month ? `${MONTHS[Number(month) - 1]} ${year}` : `${year}`;

  return (
    <div className={styles.page}>
      {summary.error && <p className={styles.error} role="alert">{summary.error}</p>}

      {summary.data && (
        <>
          <Card>
            <CardHeader
              title="Stock"
              description="Carretes no archivados, con lo que queda según las impresiones registradas."
            />
            <CardBody>
              <div className={dashboard.tiles}>
                <Tile label="Restante" value={formatGrams(summary.data.stock.remainingG)} />
                {summary.data.stock.value.map((v) => (
                  <Tile key={v.currency} label={`Valor ${v.currency}`} value={formatMoney(v.value, v.currency)} />
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Residuo"
              description="Gramos descartados porque la impresora no los toma. Histórico, incluye filamentos archivados."
            />
            <CardBody>
              <div className={dashboard.tiles}>
                <Tile label="Descartado" value={formatGrams(summary.data.waste.grams)} />
                {summary.data.waste.value.map((v) => (
                  <Tile key={v.currency} label={`Valor ${v.currency}`} value={formatMoney(v.value, v.currency)} />
                ))}
              </div>
            </CardBody>
          </Card>

          <div className={dashboard.columns}>
            <Card>
              <CardHeader title="Impresiones recientes" />
              <CardBody flush>
                {summary.data.recentPrints.length === 0 ? (
                  <EmptyState icon={Printer} title="Sin impresiones" description="Creá una impresión para verla acá." />
                ) : (
                  <ul className={styles.list}>
                    {summary.data.recentPrints.map((p) => {
                      const used = p.filaments.reduce((sum, f) => sum + (f.gramsUsed ?? 0), 0);
                      const hasUsed = p.filaments.some((f) => f.gramsUsed != null);
                      return (
                        <li key={p.id} className={styles.filamentRow}>
                          <div className={styles.filamentInfo}>
                            <div className={styles.rowTitle}>{p.name}</div>
                            <div className={styles.meta}>
                              {formatDate(p.createdAt)} · {p.filaments.length} filamento(s)
                              {hasUsed && ` · ${formatGrams(used)} usados`}
                            </div>
                          </div>
                          <Badge variant={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <div className={styles.toolbar}>
        <span />
        <div className={dashboard.filters}>
          <Combobox
            label="Período"
            value={month}
            onChange={setMonth}
            options={[{ value: "", label: "Todo el año" }, ...MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))]}
          />
          <Combobox
            label="Año"
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
      </div>
      {report.error && <p className={styles.error} role="alert">{report.error}</p>}

      {report.data && (
        <>
          <Card>
            <CardHeader
              title="Costos del período"
              description={`Invertido: carretes comprados en ${period}. Gastado: filamento consumido en impresiones terminadas en ${period}.`}
            />
            <CardBody>
              {report.data.totals.length === 0 ? (
                <p className={styles.description}>Sin movimientos en este período.</p>
              ) : (
                <div className={dashboard.totals}>
                  {report.data.totals.map((t) => (
                    <div key={t.currency} className={dashboard.totalGroup}>
                      <span className={dashboard.currency}>{t.currency}</span>
                      <div className={dashboard.stat}>
                        <span className={dashboard.label}>Invertido</span>
                        <span className={dashboard.value}>{formatMoney(t.invested, t.currency)}</span>
                      </div>
                      <div className={dashboard.stat}>
                        <span className={dashboard.label}>Gastado</span>
                        <span className={dashboard.value}>{formatMoney(t.spent, t.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Por filamento" />
            <CardBody flush>
              {report.data.rows.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sin costos en este período"
                  description="Aparecen filamentos comprados o consumidos en el período elegido."
                />
              ) : (
                <ul className={styles.list}>
                  {report.data.rows.map((r) => (
                    <li key={r.filamentId} className={styles.filamentRow}>
                      <span
                        className={styles.swatch}
                        style={{ background: r.colorHex ?? "transparent" }}
                        aria-hidden
                      />
                      <div className={styles.filamentInfo}>
                        <div className={styles.rowTitle}>
                          {r.brandName} · {materialLabel({ name: r.materialName, variant: r.materialVariant })}
                        </div>
                        <div className={styles.meta}>{r.colorName}</div>
                      </div>
                      <div className={dashboard.amounts}>
                        <span>Invertido {formatOrDash(r.invested, r.currency)}</span>
                        <span>Gastado {formatOrDash(r.spent, r.currency)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
