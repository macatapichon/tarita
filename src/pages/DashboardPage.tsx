import { useState } from "react";
import { BarChart3, Printer, TriangleAlert } from "lucide-react";
import {
  api,
  materialLabel,
  type CostReport,
  type DashboardSummary,
} from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { STATUS_BADGE, STATUS_LABEL } from "../lib/printStatus";
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, Select } from "../components/ui";
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
              description="Carretes no archivados. Reservado: impresiones planificadas o en curso, que todavía no descuentan."
            />
            <CardBody>
              <div className={dashboard.tiles}>
                <Tile label="Restante" value={formatGrams(summary.data.stock.remainingG)} />
                <Tile label="Reservado" value={formatGrams(summary.data.stock.reservedG)} />
                <Tile label="Libre" value={formatGrams(summary.data.stock.freeG)} />
                {summary.data.stock.value.map((v) => (
                  <Tile key={v.currency} label={`Valor ${v.currency}`} value={formatMoney(v.value, v.currency)} />
                ))}
              </div>
            </CardBody>
          </Card>

          <div className={dashboard.columns}>
            <Card>
              <CardHeader title="Stock bajo" description="Carretes por debajo de su aviso de stock bajo." />
              <CardBody flush>
                {summary.data.lowStock.length === 0 ? (
                  <EmptyState
                    icon={TriangleAlert}
                    title="Sin alertas"
                    description="Todos los carretes están por encima de su umbral."
                  />
                ) : (
                  <ul className={styles.list}>
                    {summary.data.lowStock.map((f) => (
                      <li key={f.id} className={styles.filamentRow}>
                        <span
                          className={styles.swatch}
                          style={{ background: f.colorHex ?? "transparent" }}
                          aria-hidden
                        />
                        <div className={styles.filamentInfo}>
                          <div className={styles.rowTitle}>
                            {f.brandName} · {materialLabel({ name: f.materialName, variant: f.materialVariant })} · {f.colorName}
                          </div>
                          <ProgressBar
                            value={Math.max(f.remainingG, 0)}
                            max={f.initialWeightG}
                            label={`${formatGrams(f.remainingG)} de ${formatGrams(f.initialWeightG)}`}
                            aria-label={`Stock de ${f.colorName}`}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Impresiones recientes" />
              <CardBody flush>
                {summary.data.recentPrints.length === 0 ? (
                  <EmptyState icon={Printer} title="Sin impresiones" description="Creá una impresión para verla acá." />
                ) : (
                  <ul className={styles.list}>
                    {summary.data.recentPrints.map((p) => {
                      const grams = p.filaments.reduce((sum, f) => sum + f.gramsEstimated, 0);
                      return (
                        <li key={p.id} className={styles.filamentRow}>
                          <div className={styles.filamentInfo}>
                            <div className={styles.rowTitle}>{p.name}</div>
                            <div className={styles.meta}>
                              {formatDate(p.createdAt)} · {p.filaments.length} filamento(s) · {formatGrams(grams)}
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
          <Select label="Período" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Todo el año</option>
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </Select>
          <Select label="Año" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
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
