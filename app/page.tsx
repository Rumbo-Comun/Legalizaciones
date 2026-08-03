"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Expense = {
  id: string;
  date: string;
  category: string;
  vendor: string;
  invoice: string;
  description: string;
  amountCents: number;
  taxCents: number;
  paymentMethod: string;
};

type Evidence = {
  id: string;
  settlementId: string;
  expenseId: string | null;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};

type Settlement = {
  id: string;
  employee: string;
  department: string;
  fundCode: string;
  depositDate: string;
  depositReference: string;
  depositSource: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  advanceCents: number;
  cashReturnedCents: number;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
  expenses: Expense[];
  evidences: Evidence[];
};

const emptyExpense = (): Expense => ({
  id: crypto.randomUUID(),
  date: new Date().toISOString().slice(0, 10),
  category: "Transporte",
  vendor: "",
  invoice: "",
  description: "",
  amountCents: 0,
  taxCents: 0,
  paymentMethod: "Efectivo",
});

const emptySettlement = (): Settlement => ({
  id: crypto.randomUUID(),
  employee: "",
  department: "",
  fundCode: "",
  depositDate: new Date().toISOString().slice(0, 10),
  depositReference: "",
  depositSource: "",
  periodStart: new Date().toISOString().slice(0, 10),
  periodEnd: new Date().toISOString().slice(0, 10),
  status: "consignacion creada",
  advanceCents: 0,
  cashReturnedCents: 0,
  notes: "",
  expenses: [],
  evidences: [],
});

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function parseMoney(value: string) {
  const numeric = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function formatMoney(cents: number) {
  return money.format(Math.round(cents / 100));
}

export default function Home() {
  const [records, setRecords] = useState<Settlement[]>([]);
  const [draft, setDraft] = useState<Settlement>(emptySettlement);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState("");

  const totals = useMemo(() => {
    const subtotal = draft.expenses.reduce((sum, item) => sum + item.amountCents, 0);
    const tax = draft.expenses.reduce((sum, item) => sum + item.taxCents, 0);
    const spent = subtotal + tax;
    const balance = draft.advanceCents - spent - draft.cashReturnedCents;
    return { subtotal, tax, spent, balance };
  }, [draft]);
  const hasConsignation = Boolean(activeId);

  useEffect(() => {
    void loadRecords();
  }, []);

  async function loadRecords() {
    setLoading(true);
    try {
      const response = await fetch("/api/settlements");
      const data = await response.json();
      setRecords(data.settlements ?? []);
    } catch {
      setNotice("No pude cargar los registros. Revisa la conexion e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft<K extends keyof Settlement>(key: K, value: Settlement[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateExpense(id: string, patch: Partial<Expense>) {
    setDraft((current) => ({
      ...current,
      expenses: current.expenses.map((expense) =>
        expense.id === id ? { ...expense, ...patch } : expense,
      ),
    }));
  }

  async function saveSettlement(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.employee.trim()) {
      setNotice("Ingresa el responsable de la consignacion.");
      return null;
    }
    if (draft.advanceCents <= 0) {
      setNotice("Ingresa el valor consignado para abrir la caja menor.");
      return null;
    }

    const method = activeId ? "PUT" : "POST";
    const url = activeId ? `/api/settlements/${activeId}` : "/api/settlements";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json();

    if (!response.ok) {
      setNotice(data.error ?? "No se pudo guardar la legalizacion.");
      return null;
    }

    setDraft(data.settlement);
    setActiveId(data.settlement.id);
    setNotice(activeId ? "Movimiento guardado correctamente." : "Consignacion creada. Ya puedes registrar gastos.");
    await loadRecords();
    return data.settlement as Settlement;
  }

  async function uploadEvidence(event: ChangeEvent<HTMLInputElement>, expenseId: string | null) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const saved = await saveSettlement();
    if (!saved) return;
    const settlementId = saved.id;
    const form = new FormData();
    form.append("settlementId", settlementId);
    if (expenseId) form.append("expenseId", expenseId);
    form.append("file", file);

    setUploading(expenseId ?? "general");
    const response = await fetch("/api/evidences", { method: "POST", body: form });
    const data = await response.json();
    setUploading("");

    if (!response.ok) {
      setNotice(data.error ?? "No se pudo cargar la evidencia.");
      return;
    }

    setDraft(data.settlement);
    setActiveId(data.settlement.id);
    setNotice("Evidencia cargada y asociada.");
    await loadRecords();
  }

  async function deleteEvidence(id: string) {
    const response = await fetch(`/api/evidences/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDraft((current) => ({
        ...current,
        evidences: current.evidences.filter((evidence) => evidence.id !== id),
      }));
      await loadRecords();
    }
  }

  async function removeRecord(id: string) {
    const response = await fetch(`/api/settlements/${id}`, { method: "DELETE" });
    if (response.ok) {
      setNotice("Registro eliminado.");
      setDraft(emptySettlement());
      setActiveId("");
      await loadRecords();
    }
  }

  function exportFile(type: "csv" | "json") {
    const payload =
      type === "json"
        ? JSON.stringify(records, null, 2)
        : [
            "id,responsable,area,caja,referencia_consignacion,estado,consignado,gastado,devuelto,saldo",
            ...records.map((record) => {
              const spent = record.expenses.reduce(
                (sum, item) => sum + item.amountCents + item.taxCents,
                0,
              );
              const balance = record.advanceCents - spent - record.cashReturnedCents;
              return [
                record.id,
                record.employee,
                record.department,
                record.fundCode,
                record.depositReference,
                record.status,
                record.advanceCents / 100,
                spent / 100,
                record.cashReturnedCents / 100,
                balance / 100,
              ]
                .map((value) => `"${String(value).replaceAll('"', '""')}"`)
                .join(",");
            }),
          ].join("\n");

    const blob = new Blob([payload], {
      type: type === "json" ? "application/json" : "text/csv",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `legalizaciones-caja-menor.${type}`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="app-shell">
      <section className="workbench">
        <div className="topbar">
          <div>
            <p className="eyebrow">Caja menor</p>
            <h1>Consignacion y gastos</h1>
          </div>
          <div className="actions">
            <button type="button" onClick={() => exportFile("csv")} title="Exportar CSV">
              CSV
            </button>
            <button type="button" onClick={() => exportFile("json")} title="Exportar JSON">
              JSON
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setDraft(emptySettlement());
                setActiveId("");
              }}
            >
              +
            </button>
          </div>
        </div>

        <div className="summary-grid">
          <Metric label="Consignado" value={formatMoney(draft.advanceCents)} />
          <Metric label="Gastado" value={formatMoney(totals.spent)} />
          <Metric label="Devuelto" value={formatMoney(draft.cashReturnedCents)} />
          <Metric
            label={totals.balance >= 0 ? "Disponible" : "Excedido"}
            value={formatMoney(Math.abs(totals.balance))}
            tone={totals.balance < 0 ? "warn" : "ok"}
          />
        </div>

        <form className="editor" onSubmit={saveSettlement}>
          <section className="panel details-panel">
            <div className="section-title">
              <h2>1. Crear consignacion</h2>
              <select
                value={draft.status}
                onChange={(event) => updateDraft("status", event.target.value)}
                aria-label="Estado"
              >
                <option value="consignacion creada">Consignacion creada</option>
                <option value="registrando gastos">Registrando gastos</option>
                <option value="en revision">En revision</option>
                <option value="aprobado">Aprobado</option>
                <option value="rechazado">Rechazado</option>
              </select>
            </div>

            <div className="form-grid">
              <label>
                Responsable de caja
                <input
                  value={draft.employee}
                  onChange={(event) => updateDraft("employee", event.target.value)}
                  placeholder="Nombre completo"
                />
              </label>
              <label>
                Area
                <input
                  value={draft.department}
                  onChange={(event) => updateDraft("department", event.target.value)}
                  placeholder="Administrativa"
                />
              </label>
              <label>
                Codigo de caja
                <input
                  value={draft.fundCode}
                  onChange={(event) => updateDraft("fundCode", event.target.value)}
                  placeholder="CM-001"
                />
              </label>
              <label>
                Valor consignado
                <input
                  inputMode="numeric"
                  value={draft.advanceCents ? draft.advanceCents / 100 : ""}
                  onChange={(event) => updateDraft("advanceCents", parseMoney(event.target.value))}
                  placeholder="0"
                />
              </label>
              <label>
                Fecha consignacion
                <input
                  type="date"
                  value={draft.depositDate}
                  onChange={(event) => updateDraft("depositDate", event.target.value)}
                />
              </label>
              <label>
                Referencia
                <input
                  value={draft.depositReference}
                  onChange={(event) => updateDraft("depositReference", event.target.value)}
                  placeholder="Comprobante o recibo"
                />
              </label>
              <label>
                Origen
                <input
                  value={draft.depositSource}
                  onChange={(event) => updateDraft("depositSource", event.target.value)}
                  placeholder="Banco o caja principal"
                />
              </label>
              <label>
                Desde
                <input
                  type="date"
                  value={draft.periodStart}
                  onChange={(event) => updateDraft("periodStart", event.target.value)}
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={draft.periodEnd}
                  onChange={(event) => updateDraft("periodEnd", event.target.value)}
                />
              </label>
            </div>

            <label className="full">
              Observaciones
              <textarea
                value={draft.notes}
                onChange={(event) => updateDraft("notes", event.target.value)}
                placeholder="Notas de revision, aprobacion o pendientes"
              />
            </label>
          </section>

          <section className="panel expense-panel">
            <div className="section-title">
              <h2>2. Registrar gastos</h2>
              <button
                type="button"
                className="ghost"
                disabled={!hasConsignation}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    status:
                      current.status === "consignacion creada"
                        ? "registrando gastos"
                        : current.status,
                    expenses: [...current.expenses, emptyExpense()],
                  }))
                }
              >
                + Gasto
              </button>
            </div>

            <div className="expense-list">
              {!hasConsignation && (
                <div className="empty-state">
                  Guarda primero la consignacion para activar el registro de gastos.
                </div>
              )}
              {hasConsignation && draft.expenses.length === 0 && (
                <div className="empty-state">
                  Aun no hay gastos. Agrega el primero para empezar a restar saldo.
                </div>
              )}
              {draft.expenses.map((expense, index) => {
                const linked = draft.evidences.filter((item) => item.expenseId === expense.id);
                return (
                  <article className="expense-row" key={expense.id}>
                    <div className="row-number">{index + 1}</div>
                    <label>
                      Fecha
                      <input
                        type="date"
                        value={expense.date}
                        onChange={(event) => updateExpense(expense.id, { date: event.target.value })}
                      />
                    </label>
                    <label>
                      Categoria
                      <select
                        value={expense.category}
                        onChange={(event) => updateExpense(expense.id, { category: event.target.value })}
                      >
                        <option>Transporte</option>
                        <option>Alimentacion</option>
                        <option>Papeleria</option>
                        <option>Mensajeria</option>
                        <option>Mantenimiento</option>
                        <option>Otro</option>
                      </select>
                    </label>
                    <label>
                      Proveedor
                      <input
                        value={expense.vendor}
                        onChange={(event) => updateExpense(expense.id, { vendor: event.target.value })}
                        placeholder="Nombre o NIT"
                      />
                    </label>
                    <label>
                      Factura
                      <input
                        value={expense.invoice}
                        onChange={(event) => updateExpense(expense.id, { invoice: event.target.value })}
                        placeholder="FV-000"
                      />
                    </label>
                    <label className="wide">
                      Descripcion
                      <input
                        value={expense.description}
                        onChange={(event) =>
                          updateExpense(expense.id, { description: event.target.value })
                        }
                        placeholder="Concepto del gasto"
                      />
                    </label>
                    <label>
                      Base
                      <input
                        inputMode="numeric"
                        value={expense.amountCents ? expense.amountCents / 100 : ""}
                        onChange={(event) =>
                          updateExpense(expense.id, { amountCents: parseMoney(event.target.value) })
                        }
                        placeholder="0"
                      />
                    </label>
                    <label>
                      IVA
                      <input
                        inputMode="numeric"
                        value={expense.taxCents ? expense.taxCents / 100 : ""}
                        onChange={(event) =>
                          updateExpense(expense.id, { taxCents: parseMoney(event.target.value) })
                        }
                        placeholder="0"
                      />
                    </label>
                    <label>
                      Medio
                      <select
                        value={expense.paymentMethod}
                        onChange={(event) =>
                          updateExpense(expense.id, { paymentMethod: event.target.value })
                        }
                      >
                        <option>Efectivo</option>
                        <option>Transferencia</option>
                        <option>Tarjeta</option>
                      </select>
                    </label>
                    <div className="file-tools">
                      <label className="upload">
                        {uploading === expense.id ? "Subiendo..." : "Adjuntar"}
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(event) => uploadEvidence(event, expense.id)}
                        />
                      </label>
                      <button
                        type="button"
                        className="icon danger"
                        title="Eliminar gasto"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            expenses:
                              current.expenses.length === 1
                                ? []
                                : current.expenses.filter((item) => item.id !== expense.id),
                          }))
                        }
                      >
                        x
                      </button>
                    </div>
                    {linked.length > 0 && (
                      <div className="evidence-strip">
                        {linked.map((evidence) => (
                          <span key={evidence.id}>
                            {evidence.fileName}
                            <button
                              type="button"
                              onClick={() => deleteEvidence(evidence.id)}
                              title="Quitar evidencia"
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel balance-panel">
            <div className="section-title">
              <h2>Saldo de caja</h2>
              <label className="upload">
                {uploading === "general" ? "Subiendo..." : "Soporte general"}
                <input type="file" accept="image/*,.pdf" onChange={(event) => uploadEvidence(event, null)} />
              </label>
            </div>
            <div className="calc-list">
              <span>Subtotal</span>
              <strong>{formatMoney(totals.subtotal)}</strong>
              <span>IVA</span>
              <strong>{formatMoney(totals.tax)}</strong>
              <span>Total gastado</span>
              <strong>{formatMoney(totals.spent)}</strong>
              <label>
                Efectivo devuelto
                <input
                  inputMode="numeric"
                  value={draft.cashReturnedCents ? draft.cashReturnedCents / 100 : ""}
                  onChange={(event) =>
                    updateDraft("cashReturnedCents", parseMoney(event.target.value))
                  }
                  placeholder="0"
                />
              </label>
              <strong className={totals.balance < 0 ? "negative" : "positive"}>
                {totals.balance < 0 ? "Excedido " : "Disponible "}
                {formatMoney(Math.abs(totals.balance))}
              </strong>
            </div>

            <button type="submit" className="save">
              {hasConsignation ? "Guardar gastos" : "Crear consignacion"}
            </button>
            {notice && <p className="notice">{notice}</p>}
          </section>
        </form>
      </section>

      <aside className="history">
        <div className="section-title">
          <h2>Historial</h2>
          <span>{records.length}</span>
        </div>
        {loading && <p className="muted">Cargando...</p>}
        {!loading && records.length === 0 && <p className="muted">Aun no hay consignaciones.</p>}
        {records.map((record) => {
          const spent = record.expenses.reduce((sum, item) => sum + item.amountCents + item.taxCents, 0);
          const balance = record.advanceCents - spent - record.cashReturnedCents;
          return (
            <article className="history-item" key={record.id}>
              <button
                type="button"
                onClick={() => {
                  setDraft(record);
                  setActiveId(record.id);
                }}
              >
                <strong>{record.employee || "Sin responsable"}</strong>
                <span>{record.fundCode || "Sin codigo"} - {record.status}</span>
                <span>{formatMoney(record.advanceCents)} consignado - {formatMoney(spent)} gastado</span>
                <span>{record.evidences.length} soportes</span>
              </button>
              <div className="history-footer">
                <span className={balance < 0 ? "negative" : "positive"}>{formatMoney(Math.abs(balance))}</span>
                <button type="button" onClick={() => removeRecord(record.id)} title="Eliminar registro">
                  x
                </button>
              </div>
            </article>
          );
        })}
      </aside>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
