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

type AccessGrant = {
  id: string;
  userId: string;
  permission: string;
  name: string;
  email: string;
  role: string;
};

type ReviewComment = {
  id: string;
  userId: string;
  userName: string;
  comment: string;
  createdAt: string;
};

type AppUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active?: number;
};

type Settlement = {
  id: string;
  ownerId?: string | null;
  employee: string;
  department: string;
  fundCode: string;
  fundType: string;
  projectName: string;
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
  access?: AccessGrant[];
  comments?: ReviewComment[];
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
  fundType: "Caja menor",
  projectName: "",
  depositDate: new Date().toISOString().slice(0, 10),
  depositReference: "",
  depositSource: "",
  periodStart: "",
  periodEnd: "",
  status: "borrador",
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

function parseUtcTimestamp(value: string) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: string) {
  const date = parseUtcTimestamp(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Bogota",
  }).format(date);
}

function isSystemLog(comment: ReviewComment) {
  return (
    comment.comment.startsWith("[LOG]") ||
    (comment.userName === "Administrador" &&
      (comment.comment.startsWith("Correo de aprobacion") ||
        comment.comment.startsWith("No se pudo enviar correo") ||
        comment.comment.startsWith("Notificacion de correo")))
  );
}

function cleanLogMessage(value: string) {
  return value.replace(/^\[LOG\]\s*/, "");
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginEmail, setLoginEmail] = useState("proyectos@uscom.net.co");
  const [loginPassword, setLoginPassword] = useState("andres123");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [newUser, setNewUser] = useState({
    name: "WILLIAM",
    email: "william@local",
    role: "solicitante",
    password: "william123",
  });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpReason, setTopUpReason] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [records, setRecords] = useState<Settlement[]>([]);
  const [draft, setDraft] = useState<Settlement>(emptySettlement);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [activeView, setActiveView] = useState<"dashboard" | "new" | "status" | "reports" | "admin">("dashboard");

  const totals = useMemo(() => {
    const subtotal = draft.expenses.reduce((sum, item) => sum + item.amountCents, 0);
    const tax = draft.expenses.reduce((sum, item) => sum + item.taxCents, 0);
    const spent = subtotal + tax;
    const balance = draft.advanceCents - spent - draft.cashReturnedCents;
    return { subtotal, tax, spent, balance };
  }, [draft]);
  const hasConsignation = Boolean(activeId);
  const canEdit = Boolean(currentUser && (currentUser.role === "admin" || draft.ownerId === currentUser.id || !activeId));
  const canReviewFund = Boolean(
    currentUser &&
      (currentUser.role === "admin" ||
        (currentUser.role === "revisor" && (draft.access ?? []).some((access) => access.userId === currentUser.id))),
  );
  const canAttachSupport = canEdit || canReviewFund;
  const canSave = canEdit || canReviewFund;
  const canAdmin = currentUser?.role === "admin";
  const adminStats = useMemo(() => {
    const activeUsers = users.filter((user) => user.active !== 0).length;
    const requesters = users.filter((user) => user.role === "solicitante").length;
    const reviewers = users.filter((user) => user.role === "revisor").length;
    const admins = users.filter((user) => user.role === "admin").length;
    return { activeUsers, requesters, reviewers, admins };
  }, [users]);
  const expensesEnabled = ["consignado", "registrando gastos", "aprobado", "solicitud ampliacion"].includes(
    draft.status,
  );
  const dashboardStats = useMemo(() => {
    const totalRequested = records.reduce((sum, record) => sum + record.advanceCents, 0);
    const totalSpent = records.reduce(
      (sum, record) => sum + record.expenses.reduce((expenseSum, item) => expenseSum + item.amountCents + item.taxCents, 0),
      0,
    );
    const pending = records.filter((record) => record.status === "pendiente aprobacion").length;
    const active = records.filter((record) =>
      ["consignado", "registrando gastos", "solicitud ampliacion"].includes(record.status),
    ).length;
    const completed = records.filter((record) => record.status === "aprobado").length;
    const supportCount = records.reduce((sum, record) => sum + record.evidences.length, 0);
    return { totalRequested, totalSpent, pending, active, completed, supportCount };
  }, [records]);
  const reportRows = useMemo(() => {
    const categories = new Map<string, { category: string; count: number; amount: number; tax: number }>();
    for (const record of records) {
      for (const expense of record.expenses) {
        const key = expense.category || "Sin categoria";
        const current = categories.get(key) ?? { category: key, count: 0, amount: 0, tax: 0 };
        current.count += 1;
        current.amount += expense.amountCents;
        current.tax += expense.taxCents;
        categories.set(key, current);
      }
    }
    return [...categories.values()].sort((left, right) => right.amount + right.tax - (left.amount + left.tax));
  }, [records]);

  useEffect(() => {
    void loadMe();
  }, []);

  async function loadMe() {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    setCurrentUser(data.user ?? null);
    setAuthChecked(true);
    if (data.user) {
      await loadRecords();
      if (data.user.role === "admin") await loadUsers();
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "No se pudo iniciar sesion.");
      return;
    }
    setCurrentUser(data.user);
    setNotice("");
    await loadRecords();
    if (data.user.role === "admin") await loadUsers();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setRecords([]);
    setDraft(emptySettlement());
    setActiveId("");
  }

  async function loadUsers() {
    const response = await fetch("/api/users");
    if (response.ok) {
      const data = await response.json();
      setUsers(data.users ?? []);
    }
  }

  async function loadRecords() {
    setLoading(true);
    try {
      const response = await fetch("/api/settlements");
      if (response.status === 401) {
        setCurrentUser(null);
        return [];
      }
      const data = await response.json();
      const nextRecords = data.settlements ?? [];
      setRecords(nextRecords);
      return nextRecords as Settlement[];
    } catch {
      setNotice("No pude cargar los registros. Revisa la conexion e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
    return [];
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

  async function saveSettlement(event?: FormEvent, override: Partial<Settlement> = {}) {
    event?.preventDefault();
    if (!canSave) {
      setNotice("Este usuario puede revisar y comentar, pero no guardar cambios.");
      return null;
    }
    const payload = { ...draft, ...override };
    if (!payload.employee.trim()) {
      setNotice("Ingresa el responsable de la consignacion.");
      return null;
    }
    if (payload.advanceCents <= 0) {
      setNotice("Ingresa el valor solicitado para abrir el fondo.");
      return null;
    }

    const method = activeId ? "PUT" : "POST";
    const url = activeId ? `/api/settlements/${activeId}` : "/api/settlements";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      setNotice(data.error ?? "No se pudo guardar el fondo.");
      return null;
    }

    setDraft(data.settlement);
    setActiveId(data.settlement.id);
    setNotice(activeId ? "Movimiento guardado correctamente." : "Solicitud creada.");
    await loadRecords();
    return data.settlement as Settlement;
  }

  async function uploadEvidence(event: ChangeEvent<HTMLInputElement>, expenseId: string | null) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!canAttachSupport) {
      setNotice("Este usuario no puede cargar soportes en este fondo.");
      return;
    }

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
    if (!canEdit) return;
    const response = await fetch(`/api/evidences/${id}`, { method: "DELETE" });
    if (response.ok) {
      setDraft((current) => ({
        ...current,
        evidences: current.evidences.filter((evidence) => evidence.id !== id),
      }));
      await loadRecords();
    }
  }

  async function submitForApproval() {
    const saved = await saveSettlement(undefined, { status: "pendiente aprobacion" });
    if (saved) setNotice("Solicitud enviada a aprobacion. Los revisores autorizados ya pueden verla.");
  }

  async function approveConsignation() {
    const saved = await saveSettlement(undefined, { status: "consignado" });
    if (saved) setNotice("Consignacion aprobada. Ya se pueden registrar gastos.");
  }

  async function requestMoreFunds() {
    if (!activeId || !topUpAmount.trim()) {
      setNotice("Ingresa el valor adicional solicitado.");
      return;
    }
    const amount = parseMoney(topUpAmount);
    const reason = topUpReason.trim() || "Fondo por agotarse";
    const response = await fetch(`/api/settlements/${activeId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: `Solicitud de ampliacion de fondos por ${formatMoney(amount)}. Motivo: ${reason}`,
      }),
    });
    if (!response.ok) {
      setNotice("No se pudo registrar la solicitud de ampliacion.");
      return;
    }
    await saveSettlement(undefined, { status: "solicitud ampliacion" });
    setTopUpAmount("");
    setTopUpReason("");
    setNotice("Solicitud de ampliacion enviada a revision.");
  }

  async function removeRecord(id: string) {
    if (!canEdit) return;
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
            "id,tipo,responsable,area,proyecto_o_objeto,codigo,referencia_consignacion,estado,consignado,gastado,devuelto,saldo",
            ...records.map((record) => {
              const spent = record.expenses.reduce(
                (sum, item) => sum + item.amountCents + item.taxCents,
                0,
              );
              const balance = record.advanceCents - spent - record.cashReturnedCents;
              return [
                record.id,
                record.fundType,
                record.employee,
                record.department,
                record.projectName,
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

  async function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function imageSize(dataUrl: string) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  async function downloadPdf() {
    const saved = canEdit ? await saveSettlement() : draft;
    if (!saved || !activeId) return;

    setPdfBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 42;
      let y = margin;
      const spent = saved.expenses.reduce((sum, item) => sum + item.amountCents + item.taxCents, 0);
      const balance = saved.advanceCents - spent - saved.cashReturnedCents;

      const addLine = (label: string, value: string) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(value || "-", margin + 160, y);
        y += 18;
      };
      const addWrapped = (text: string, x: number, maxWidth: number) => {
        const lines = doc.splitTextToSize(text || "-", maxWidth);
        doc.text(lines, x, y);
        y += Math.max(16, lines.length * 13);
      };
      const ensureRoom = (height: number) => {
        if (y + height > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Informe de legalizacion de fondos", margin, y);
      y += 28;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, margin, y);
      y += 24;

      doc.setFontSize(11);
      addLine("Tipo", saved.fundType);
      addLine("Proyecto / objeto", saved.projectName);
      addLine("Responsable", saved.employee);
      addLine("Area", saved.department);
      addLine("Codigo", saved.fundCode);
      addLine("Fecha consignacion", saved.depositDate);
      addLine("Referencia", saved.depositReference);
      addLine("Origen", saved.depositSource);
      addLine("Estado", saved.status);
      y += 10;
      addLine("Consignado", formatMoney(saved.advanceCents));
      addLine("Gastado", formatMoney(spent));
      addLine("Devuelto", formatMoney(saved.cashReturnedCents));
      addLine(balance < 0 ? "Excedido" : "Disponible", formatMoney(Math.abs(balance)));

      y += 16;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Gastos", margin, y);
      y += 20;
      doc.setFontSize(9);
      if (saved.expenses.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.text("No hay gastos registrados.", margin, y);
        y += 18;
      }
      saved.expenses.forEach((expense, index) => {
        ensureRoom(64);
        doc.setFont("helvetica", "bold");
        doc.text(`${index + 1}. ${expense.date} - ${expense.category}`, margin, y);
        doc.text(formatMoney(expense.amountCents + expense.taxCents), pageWidth - margin - 90, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        addWrapped(
          `${expense.vendor || "Proveedor sin registrar"} | Factura: ${expense.invoice || "-"} | ${expense.description || "-"}`,
          margin,
          pageWidth - margin * 2,
        );
      });

      if (saved.notes) {
        ensureRoom(70);
        y += 12;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("Observaciones", margin, y);
        y += 18;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        addWrapped(saved.notes, margin, pageWidth - margin * 2);
      }

      doc.addPage();
      y = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Anexos", margin, y);
      y += 24;
      doc.setFontSize(10);

      if (saved.evidences.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.text("No hay evidencias cargadas.", margin, y);
      }

      for (const [index, evidence] of saved.evidences.entries()) {
        ensureRoom(80);
        doc.setFont("helvetica", "bold");
        doc.text(`Anexo ${index + 1}: ${evidence.fileName}`, margin, y);
        y += 16;
        doc.setFont("helvetica", "normal");

        if (!evidence.contentType.startsWith("image/")) {
          doc.text("Archivo adjunto registrado. No es imagen, por eso no se incrusta en el PDF.", margin, y);
          y += 24;
          continue;
        }

        try {
          const response = await fetch(`/api/evidences/${evidence.id}`);
          const blob = await response.blob();
          const dataUrl = await blobToDataUrl(blob);
          const size = await imageSize(dataUrl);
          const maxWidth = pageWidth - margin * 2;
          const maxHeight = pageHeight - margin * 2 - 40;
          const ratio = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
          const width = size.width * ratio;
          const height = size.height * ratio;
          ensureRoom(height + 28);
          doc.addImage(
            dataUrl,
            evidence.contentType.includes("png") ? "PNG" : "JPEG",
            margin,
            y,
            width,
            height,
          );
          y += height + 28;
        } catch {
          doc.text("No se pudo incrustar esta imagen en el PDF.", margin, y);
          y += 24;
        }
      }

      const fileName = `${saved.fundType}-${saved.fundCode || saved.projectName || saved.id}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      doc.save(`informe-${fileName || "fondo"}.pdf`);
      setNotice("Informe PDF generado.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "No se pudo guardar el usuario.");
      return;
    }
    setNotice("Usuario guardado.");
    await loadUsers();
  }

  async function grantAccess() {
    if (!activeId || !selectedUserId) return;
    const response = await fetch(`/api/settlements/${activeId}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "No se pudo asignar acceso.");
      return;
    }
    setNotice("Acceso asignado.");
    const nextRecords = await loadRecords();
    const refreshed = nextRecords.find((record) => record.id === activeId);
    if (refreshed) setDraft(refreshed);
  }

  async function addComment() {
    if (!activeId || !commentDraft.trim()) return;
    const response = await fetch(`/api/settlements/${activeId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: commentDraft }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "No se pudo guardar la observacion.");
      return;
    }
    setCommentDraft("");
    setNotice("Observacion guardada.");
    const nextRecords = await loadRecords();
    const refreshed = nextRecords.find((record) => record.id === activeId);
    if (refreshed) setDraft(refreshed);
  }

  if (!authChecked) {
    return <main className="login-shell"><p className="muted">Cargando...</p></main>;
  }

  if (!currentUser) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={login}>
          <div className="login-logo">
            <img src="/uscom-logo.png" alt="USCOM SAS" />
          </div>
          <p className="eyebrow">Acceso privado</p>
          <h1>Legalizaciones</h1>
          <label>
            Usuario
            <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
          </label>
          <label>
            Clave
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
            />
          </label>
          <button className="save" type="submit">Entrar</button>
          <p className="muted">Local: proyectos@uscom.net.co / andres123 · canales@uscom.net.co / otto123 · admin@local / admin123</p>
          {notice && <p className="notice">{notice}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <img src="/uscom-logo.png" alt="USCOM SAS" />
          <span>Legalizaciones</span>
        </div>
        <nav className="crm-nav" aria-label="Menu principal">
          <button type="button" className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")}>
            <span>Resumen analitico</span>
            <strong>{records.length}</strong>
          </button>
          <button
            type="button"
            className={activeView === "new" ? "active" : ""}
            onClick={() => {
              setDraft(emptySettlement());
              setActiveId("");
              setActiveView("new");
            }}
          >
            <span>Solicitud nueva</span>
            <strong>+</strong>
          </button>
          <button type="button" className={activeView === "status" ? "active" : ""} onClick={() => setActiveView("status")}>
            <span>Estado actual</span>
            <strong>{dashboardStats.pending}</strong>
          </button>
          <button type="button" className={activeView === "reports" ? "active" : ""} onClick={() => setActiveView("reports")}>
            <span>Reportes</span>
            <strong>{reportRows.length}</strong>
          </button>
          {canAdmin && (
            <button type="button" className={activeView === "admin" ? "active" : ""} onClick={() => setActiveView("admin")}>
              <span>Administrador</span>
              <strong>{users.length}</strong>
            </button>
          )}
        </nav>
        <div className="sidebar-summary">
          <span>Solicitado</span>
          <strong>{formatMoney(dashboardStats.totalRequested)}</strong>
          <span>Gastado</span>
          <strong>{formatMoney(dashboardStats.totalSpent)}</strong>
        </div>
      </aside>

      <section className="workbench crm-content">
        <div className="topbar">
          <div>
            <p className="eyebrow">Fondos operativos</p>
            <h1>
              {activeView === "dashboard" && "Resumen analitico"}
              {activeView === "new" && "Solicitud nueva"}
              {activeView === "status" && "Estado actual"}
              {activeView === "reports" && "Reportes"}
              {activeView === "admin" && "Administrador"}
            </h1>
          </div>
          <div className="actions">
            <span className="user-pill">{currentUser.name} · {currentUser.role}</span>
            <button type="button" onClick={() => exportFile("csv")} title="Exportar CSV">
              CSV
            </button>
            <button type="button" onClick={() => exportFile("json")} title="Exportar JSON">
              JSON
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canEdit}
              onClick={() => {
                setDraft(emptySettlement());
                setActiveId("");
                setActiveView("new");
              }}
            >
              +
            </button>
            <button type="button" onClick={logout}>Salir</button>
          </div>
        </div>

        {activeView === "dashboard" && (
          <>
            <div className="summary-grid">
              <Metric label="Total solicitado" value={formatMoney(dashboardStats.totalRequested)} />
              <Metric label="Total gastado" value={formatMoney(dashboardStats.totalSpent)} />
              <Metric label="Pendientes OTTO" value={String(dashboardStats.pending)} tone={dashboardStats.pending ? "warn" : undefined} />
              <Metric label="Soportes cargados" value={String(dashboardStats.supportCount)} tone="ok" />
            </div>

            <section className="panel crm-dashboard">
              <div className="section-title">
                <h2>Resumen por estado</h2>
                <span>{records.length} solicitudes</span>
              </div>
              <div className="pipeline-grid">
                <div>
                  <span>En tramite</span>
                  <strong>{dashboardStats.active}</strong>
                </div>
                <div>
                  <span>Pendientes aprobacion</span>
                  <strong>{dashboardStats.pending}</strong>
                </div>
                <div>
                  <span>Aprobadas</span>
                  <strong>{dashboardStats.completed}</strong>
                </div>
              </div>
            </section>
          </>
        )}

        {activeView === "new" && (
          <>
            <div className="summary-grid">
              <Metric label="Solicitado / consignado" value={formatMoney(draft.advanceCents)} />
              <Metric label="Gastado" value={formatMoney(totals.spent)} />
              <Metric label="Devuelto" value={formatMoney(draft.cashReturnedCents)} />
              <Metric
                label={totals.balance >= 0 ? "Disponible" : "Excedido"}
                value={formatMoney(Math.abs(totals.balance))}
                tone={totals.balance < 0 ? "warn" : "ok"}
              />
            </div>

        <section className="workflow-panel">
          <div className={`workflow-step ${draft.status === "borrador" ? "active" : ""}`}>
            <strong>1</strong>
            <span>Solicitud</span>
          </div>
          <div className={`workflow-step ${draft.status === "pendiente aprobacion" ? "active" : ""}`}>
            <strong>2</strong>
            <span>Aprobacion OTTO</span>
          </div>
          <div className={`workflow-step ${["consignado", "registrando gastos", "aprobado"].includes(draft.status) ? "active" : ""}`}>
            <strong>3</strong>
            <span>Consignado</span>
          </div>
          <div className={`workflow-step ${draft.status === "solicitud ampliacion" ? "active" : ""}`}>
            <strong>4</strong>
            <span>Ampliacion</span>
          </div>
          <div className="workflow-actions">
            <button type="button" className="ghost" disabled={!canEdit} onClick={() => void saveSettlement()}>
              Guardar borrador
            </button>
            <button type="button" className="save compact" disabled={!canEdit} onClick={submitForApproval}>
              Enviar a aprobacion
            </button>
            <button type="button" className="pdf-button compact" disabled={!canReviewFund || !activeId} onClick={approveConsignation}>
              Aprobar consignacion
            </button>
          </div>
        </section>

        <form className="editor" onSubmit={saveSettlement}>
          <section className="panel details-panel">
            <div className="section-title">
              <h2>1. Solicitud de consignacion</h2>
              <span className={`request-status ${draft.status.replaceAll(" ", "-")}`}>{draft.status}</span>
            </div>

            <div className="form-grid">
              <label>
                Tipo
                <select
                  value={draft.fundType}
                  disabled={!canEdit}
                  onChange={(event) => updateDraft("fundType", event.target.value)}
                >
                  <option>Caja menor</option>
                  <option>Proyecto</option>
                  <option>Viaticos</option>
                  <option>Otro fondo</option>
                </select>
              </label>
              <label>
                Proyecto / objeto
                <input
                  value={draft.projectName}
                  readOnly={!canSave}
                  onChange={(event) => updateDraft("projectName", event.target.value)}
                  placeholder="Nombre del proyecto o viaje"
                />
              </label>
              <label>
                Responsable
                <input
                  value={draft.employee}
                  readOnly={!canEdit}
                  onChange={(event) => updateDraft("employee", event.target.value)}
                  placeholder="Nombre completo"
                />
              </label>
              <label>
                Area
                <input
                  value={draft.department}
                  readOnly={!canEdit}
                  onChange={(event) => updateDraft("department", event.target.value)}
                  placeholder="Administrativa"
                />
              </label>
              <label>
                Codigo
                <input
                  value={draft.fundCode}
                  readOnly={!canEdit}
                  onChange={(event) => updateDraft("fundCode", event.target.value)}
                  placeholder="CM-001, PR-042, VIA-007"
                />
              </label>
              <label>
                Valor solicitado / consignado
                <input
                  inputMode="numeric"
                  readOnly={!canSave}
                  value={draft.advanceCents ? draft.advanceCents / 100 : ""}
                  onChange={(event) => updateDraft("advanceCents", parseMoney(event.target.value))}
                  placeholder="0"
                />
              </label>
              <label>
                Fecha consignacion
                <input
                  type="date"
                  readOnly={!canSave}
                  value={draft.depositDate}
                  onChange={(event) => updateDraft("depositDate", event.target.value)}
                />
              </label>
              <label>
                Referencia
                <input
                  value={draft.depositReference}
                  readOnly={!canSave}
                  onChange={(event) => updateDraft("depositReference", event.target.value)}
                  placeholder="Comprobante o recibo"
                />
              </label>
              <label>
                Origen / cuenta
                <input
                  value={draft.depositSource}
                  readOnly={!canEdit}
                  onChange={(event) => updateDraft("depositSource", event.target.value)}
                  placeholder="Banco o caja principal"
                />
              </label>
              <label>
                Desde opcional
                <input
                  type="date"
                  readOnly={!canEdit}
                  value={draft.periodStart}
                  onChange={(event) => updateDraft("periodStart", event.target.value)}
                />
              </label>
              <label>
                Hasta opcional
                <input
                  type="date"
                  readOnly={!canEdit}
                  value={draft.periodEnd}
                  onChange={(event) => updateDraft("periodEnd", event.target.value)}
                />
              </label>
            </div>

            <label className="full">
              Observaciones
              <textarea
                value={draft.notes}
                readOnly={!canEdit}
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
                disabled={!hasConsignation || !expensesEnabled || !canEdit}
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
                  Crea la solicitud y enviala a aprobacion. Los gastos se habilitan cuando OTTO marque la consignacion.
                </div>
              )}
              {hasConsignation && !expensesEnabled && (
                <div className="empty-state">
                  Solicitud en aprobacion. Esperando consignacion para registrar gastos.
                </div>
              )}
              {hasConsignation && expensesEnabled && draft.expenses.length === 0 && (
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
                        readOnly={!canEdit}
                        value={expense.date}
                        onChange={(event) => updateExpense(expense.id, { date: event.target.value })}
                      />
                    </label>
                    <label>
                      Categoria
                      <select
                        value={expense.category}
                        disabled={!canEdit}
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
                        readOnly={!canEdit}
                        onChange={(event) => updateExpense(expense.id, { vendor: event.target.value })}
                        placeholder="Nombre o NIT"
                      />
                    </label>
                    <label>
                      Factura
                      <input
                        value={expense.invoice}
                        readOnly={!canEdit}
                        onChange={(event) => updateExpense(expense.id, { invoice: event.target.value })}
                        placeholder="FV-000"
                      />
                    </label>
                    <label className="wide">
                      Descripcion
                      <input
                        value={expense.description}
                        readOnly={!canEdit}
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
                        readOnly={!canEdit}
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
                        readOnly={!canEdit}
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
                        disabled={!canEdit}
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
                          disabled={!canEdit}
                          accept="image/*,.pdf"
                          onChange={(event) => uploadEvidence(event, expense.id)}
                        />
                      </label>
                      <button
                        type="button"
                        className="icon danger"
                        disabled={!canEdit}
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
                              disabled={!canEdit}
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
              <h2>Saldo del fondo</h2>
              <label className="upload">
                {uploading === "general" ? "Subiendo..." : "Soporte consignacion"}
                <input type="file" accept="image/*,.pdf" disabled={!canAttachSupport} onChange={(event) => uploadEvidence(event, null)} />
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
                  readOnly={!canEdit}
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

            <button type="submit" className="save" disabled={!canSave}>
              {hasConsignation ? "Guardar cambios" : "Crear solicitud"}
            </button>
            <button
              type="button"
              className="pdf-button"
              disabled={!hasConsignation || pdfBusy}
              onClick={downloadPdf}
            >
              {pdfBusy ? "Generando PDF..." : "Descargar informe PDF"}
            </button>
            {notice && <p className="notice">{notice}</p>}
            {hasConsignation && expensesEnabled && (
              <div className="topup-box">
                <h3>Fondo por acabar</h3>
                <label>
                  Valor adicional
                  <input value={topUpAmount} onChange={(event) => setTopUpAmount(event.target.value)} placeholder="0" />
                </label>
                <label>
                  Motivo
                  <textarea value={topUpReason} onChange={(event) => setTopUpReason(event.target.value)} placeholder="Ej. quedan pocos recursos para terminar el proyecto" />
                </label>
                <button type="button" className="ghost" disabled={!canEdit} onClick={requestMoreFunds}>Solicitar mas fondos</button>
              </div>
            )}
          </section>
        </form>

        {hasConsignation && (
          <section className="panel review-panel">
            <div className="section-title">
              <h2>Accesos y revision</h2>
              <span>{draft.access?.length ?? 0} revisores</span>
            </div>
            {canAdmin && (
              <div className="review-grid">
                <label>
                  Permitir revision a
                  <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                    <option value="">Seleccionar usuario</option>
                    {users.map((user) => (
                      <option value={user.id} key={user.id}>
                        {user.name} - {user.email}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ghost" onClick={grantAccess}>Dar acceso</button>
              </div>
            )}
            <div className="access-list">
              {(draft.access ?? []).map((access) => (
                <span key={access.id}>{access.name} · {access.permission}</span>
              ))}
            </div>
            <label className="full novelty-box">
              Novedad
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Registra una novedad, observacion o comentario de revision"
              />
            </label>
            <button type="button" className="pdf-button novelty-action" onClick={addComment}>Registrar novedad</button>
            <div className="comment-list">
              {(draft.comments ?? []).filter((comment) => !isSystemLog(comment)).map((comment) => (
                <article key={comment.id}>
                  <strong>{comment.userName}</strong>
                  <span>{formatDateTime(comment.createdAt)}</span>
                  <p>{comment.comment}</p>
                </article>
              ))}
            </div>
            <div className="system-log-panel">
              <div className="section-title compact-title">
                <h2>Logs del sistema</h2>
                <span>{(draft.comments ?? []).filter(isSystemLog).length}</span>
              </div>
              <div className="log-list">
                {(draft.comments ?? []).filter(isSystemLog).map((comment) => (
                  <article key={comment.id}>
                    <span>{formatDateTime(comment.createdAt)}</span>
                    <p>{cleanLogMessage(comment.comment)}</p>
                  </article>
                ))}
                {(draft.comments ?? []).filter(isSystemLog).length === 0 && (
                  <div className="empty-state">Aun no hay logs registrados para esta solicitud.</div>
                )}
              </div>
            </div>
          </section>
        )}
          </>
        )}

        {activeView === "status" && (
          <section className="panel status-board">
            <div className="section-title">
              <h2>Solicitudes del usuario</h2>
              <span>{records.length} registros</span>
            </div>
            {loading && <p className="muted">Cargando...</p>}
            {!loading && records.length === 0 && <div className="empty-state">Aun no hay solicitudes creadas.</div>}
            {records.length > 0 && (
              <div className="status-table">
                <div className="status-row header">
                  <span>Solicitud</span>
                  <span>Estado</span>
                  <span>Solicitado</span>
                  <span>Gastado</span>
                  <span>Disponible</span>
                  <span>Soportes</span>
                </div>
                {records.map((record) => {
                  const spent = record.expenses.reduce((sum, item) => sum + item.amountCents + item.taxCents, 0);
                  const balance = record.advanceCents - spent - record.cashReturnedCents;
                  return (
                    <button
                      type="button"
                      className="status-row"
                      key={record.id}
                      onClick={() => {
                        setDraft(record);
                        setActiveId(record.id);
                        setActiveView("new");
                      }}
                    >
                      <span>
                        <strong>{record.projectName || record.fundCode || record.fundType}</strong>
                        <small>{record.employee || "Sin responsable"} · {record.fundType}</small>
                      </span>
                      <span className={`request-status ${record.status.replaceAll(" ", "-")}`}>{record.status}</span>
                      <span>{formatMoney(record.advanceCents)}</span>
                      <span>{formatMoney(spent)}</span>
                      <span className={balance < 0 ? "negative" : "positive"}>{formatMoney(Math.abs(balance))}</span>
                      <span>{record.evidences.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeView === "reports" && (
          <section className="panel reports-board">
            <div className="section-title">
              <h2>Reportes financieros</h2>
              <div className="report-actions">
                <button type="button" className="ghost compact" onClick={() => exportFile("csv")}>CSV</button>
                <button type="button" className="ghost compact" onClick={() => exportFile("json")}>JSON</button>
              </div>
            </div>

            <div className="summary-grid">
              <Metric label="Solicitudes" value={String(records.length)} />
              <Metric label="Solicitado" value={formatMoney(dashboardStats.totalRequested)} />
              <Metric label="Ejecutado" value={formatMoney(dashboardStats.totalSpent)} />
              <Metric
                label="Saldo global"
                value={formatMoney(Math.max(0, dashboardStats.totalRequested - dashboardStats.totalSpent))}
                tone="ok"
              />
            </div>

            <div className="report-grid">
              <section>
                <div className="section-title compact-title">
                  <h2>Gasto por categoria</h2>
                  <span>{reportRows.length} categorias</span>
                </div>
                {reportRows.length === 0 && <div className="empty-state">Aun no hay gastos registrados para reportar.</div>}
                {reportRows.length > 0 && (
                  <div className="report-table">
                    <div className="report-row header">
                      <span>Categoria</span>
                      <span>Mov.</span>
                      <span>Base</span>
                      <span>IVA</span>
                      <span>Total</span>
                    </div>
                    {reportRows.map((row) => (
                      <div className="report-row" key={row.category}>
                        <span>{row.category}</span>
                        <span>{row.count}</span>
                        <span>{formatMoney(row.amount)}</span>
                        <span>{formatMoney(row.tax)}</span>
                        <strong>{formatMoney(row.amount + row.tax)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="report-side">
                <div>
                  <span>Pendientes de aprobacion</span>
                  <strong>{dashboardStats.pending}</strong>
                </div>
                <div>
                  <span>Fondos en tramite</span>
                  <strong>{dashboardStats.active}</strong>
                </div>
                <div>
                  <span>Soportes cargados</span>
                  <strong>{dashboardStats.supportCount}</strong>
                </div>
              </section>
            </div>
          </section>
        )}

        {activeView === "admin" && canAdmin && (
          <section className="panel user-admin">
            <button type="button" className="admin-toggle" onClick={() => setAdminOpen((open) => !open)} aria-expanded={adminOpen}>
              <span>
                <strong>Administracion de usuarios</strong>
                <small>Control de accesos, roles y credenciales temporales</small>
              </span>
              <b>{adminOpen ? "Cerrar" : "Gestionar"}</b>
            </button>
            {adminOpen && (
              <div className="admin-workspace">
                <div className="admin-stat-grid">
                  <div>
                    <span>Activos</span>
                    <strong>{adminStats.activeUsers}</strong>
                  </div>
                  <div>
                    <span>Solicitantes</span>
                    <strong>{adminStats.requesters}</strong>
                  </div>
                  <div>
                    <span>Revisores</span>
                    <strong>{adminStats.reviewers}</strong>
                  </div>
                  <div>
                    <span>Admins</span>
                    <strong>{adminStats.admins}</strong>
                  </div>
                </div>

                <form className="user-form" onSubmit={saveUser}>
                  <div className="admin-form-title">
                    <strong>Nuevo usuario o actualizacion</strong>
                    <span>Si el correo ya existe, se actualiza rol y clave temporal.</span>
                  </div>
                  <label>
                    Nombre
                    <input value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} />
                  </label>
                  <label>
                    Correo / usuario
                    <input value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} />
                  </label>
                  <label>
                    Rol
                    <select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}>
                      <option value="solicitante">Solicitante</option>
                      <option value="revisor">Revisor / aprobador</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <label>
                    Clave temporal
                    <input value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
                  </label>
                  <button className="save" type="submit">Guardar usuario</button>
                </form>

                <div className="user-table" role="table" aria-label="Usuarios autorizados">
                  <div className="user-table-row header" role="row">
                    <span role="columnheader">Usuario</span>
                    <span role="columnheader">Rol</span>
                    <span role="columnheader">Estado</span>
                  </div>
                  {users.map((user) => (
                    <div className="user-table-row" role="row" key={user.id}>
                      <span role="cell">
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                      </span>
                      <span role="cell" className={`role-badge ${user.role}`}>
                        {user.role === "admin" ? "Administrador" : user.role === "revisor" ? "Revisor" : "Solicitante"}
                      </span>
                      <span role="cell" className={user.active === 0 ? "status-badge off" : "status-badge"}>
                        {user.active === 0 ? "Inactivo" : "Activo"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </section>
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
