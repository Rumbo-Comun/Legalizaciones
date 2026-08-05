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
  refundCents: number;
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

type CurrencyCode = "COP" | "USD";

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
  currency: CurrencyCode;
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

type SettlementOverride = Partial<Settlement> & {
  topUpAmountCents?: number;
  topUpReason?: string;
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
  refundCents: 0,
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
  currency: "COP",
  advanceCents: 0,
  cashReturnedCents: 0,
  notes: "",
  expenses: [],
  evidences: [],
});

function parseMoney(value: string) {
  const numeric = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function formatMoney(cents: number, currency: CurrencyCode = "COP") {
  return `${currency} ${new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))}`;
}

function coerceCurrency(value: unknown): CurrencyCode {
  return String(value || "COP").toUpperCase() === "USD" ? "USD" : "COP";
}

function requiresEstimatedDates(fundType: string) {
  const normalized = fundType.toLowerCase();
  return normalized.includes("viatico") || normalized.includes("proyecto");
}

function RequiredMark() {
  return <span className="required-star" aria-label="Campo obligatorio">*</span>;
}

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="field-label">
      {children}
      <RequiredMark />
    </span>
  );
}

function normalizeSettlement(record: Settlement): Settlement {
  return {
    ...record,
    currency: coerceCurrency(record.currency),
    expenses: (record.expenses ?? []).map((expense) => ({ ...expense, refundCents: expense.refundCents ?? 0 })),
  };
}

function sumSpent(expenses: Expense[]) {
  return expenses.reduce((sum, item) => sum + item.amountCents, 0);
}

function sumRefunded(expenses: Expense[]) {
  return expenses.reduce((sum, item) => sum + (item.refundCents ?? 0), 0);
}

function fundBalance(record: Pick<Settlement, "advanceCents" | "cashReturnedCents" | "expenses">) {
  return record.advanceCents - sumSpent(record.expenses) + sumRefunded(record.expenses) - record.cashReturnedCents;
}

function finalBalanceText(record: Settlement) {
  const balance = fundBalance(record);
  if (balance > 0) return `Usted debe devolver ${formatMoney(balance, record.currency)}.`;
  if (balance < 0) return `Usted tiene un saldo a favor de ${formatMoney(Math.abs(balance), record.currency)}.`;
  return "La legalizacion queda en cero, sin saldo por devolver ni saldo a favor.";
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
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "solicitante",
    password: "",
  });
  const [editingUserId, setEditingUserId] = useState("");
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
  const [validationModal, setValidationModal] = useState<{ title: string; messages: string[] } | null>(null);
  const [uploading, setUploading] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [activeView, setActiveView] = useState<"dashboard" | "new" | "requestInfo" | "status" | "reports" | "admin">("dashboard");
  const [requestsOpen, setRequestsOpen] = useState(true);
  const [managementTarget, setManagementTarget] = useState<Settlement | null>(null);
  const [activityTarget, setActivityTarget] = useState<Settlement | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const totals = useMemo(() => {
    const spent = sumSpent(draft.expenses);
    const refunded = sumRefunded(draft.expenses);
    const balance = fundBalance(draft);
    return { spent, refunded, balance };
  }, [draft]);
  const hasConsignation = Boolean(activeId);
  const draftClosed = draft.status === "enviado gerencia";
  const canEdit = Boolean(currentUser && !draftClosed && (currentUser.role === "admin" || draft.ownerId === currentUser.id || !activeId));
  const canReviewFund = Boolean(
    currentUser &&
      (currentUser.role === "admin" ||
        (currentUser.role === "revisor" && (draft.access ?? []).some((access) => access.userId === currentUser.id))),
  );
  const isOttoUser = Boolean(currentUser?.name.toUpperCase().includes("OTTO"));
  const canApproveConsignation = canReviewFund && isOttoUser;
  const canAttachSupport = !draftClosed && (canEdit || canReviewFund);
  const canSave = !draftClosed && (canEdit || canReviewFund);
  const canAdmin = currentUser?.role === "admin";
  const canManageAccess = canAdmin || isOttoUser;
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
    const pending = records.filter((record) => record.status === "pendiente aprobacion").length;
    const active = records.filter((record) =>
      ["consignado", "registrando gastos", "solicitud ampliacion"].includes(record.status),
    ).length;
    const completed = records.filter((record) => record.status === "aprobado").length;
    const supportCount = records.reduce((sum, record) => sum + record.evidences.length, 0);
    return { pending, active, completed, supportCount };
  }, [records]);
  const currencyStats = useMemo(() => {
    const stats: Record<CurrencyCode, { currency: CurrencyCode; requested: number; spent: number; returned: number; balance: number; count: number }> = {
      COP: { currency: "COP", requested: 0, spent: 0, returned: 0, balance: 0, count: 0 },
      USD: { currency: "USD", requested: 0, spent: 0, returned: 0, balance: 0, count: 0 },
    };
    for (const record of records) {
      const currency = coerceCurrency(record.currency);
      const spent = sumSpent(record.expenses);
      const refunded = sumRefunded(record.expenses);
      stats[currency].requested += record.advanceCents;
      stats[currency].spent += spent;
      stats[currency].returned += record.cashReturnedCents + refunded;
      stats[currency].balance += fundBalance(record);
      stats[currency].count += 1;
    }
    return [stats.COP, stats.USD];
  }, [records]);
  const reportRows = useMemo(() => {
    const categories = new Map<string, { category: string; currency: CurrencyCode; count: number; amount: number }>();
    for (const record of records) {
      const currency = coerceCurrency(record.currency);
      for (const expense of record.expenses) {
        const key = expense.category || "Sin categoria";
        const mapKey = `${currency}-${key}`;
        const current = categories.get(mapKey) ?? { category: key, currency, count: 0, amount: 0 };
        current.count += 1;
        current.amount += expense.amountCents - (expense.refundCents ?? 0);
        categories.set(mapKey, current);
      }
    }
    return [...categories.values()].sort((left, right) => right.amount - left.amount);
  }, [records]);

  useEffect(() => {
    void loadMe();
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("reset");
    if (token) setResetToken(token);
  }, []);

  async function loadMe() {
    const response = await fetch("/api/auth/me");
    const data = await response.json();
    setCurrentUser(data.user ?? null);
    setAuthChecked(true);
    if (data.user) {
      await loadRecords();
      if (data.user.role === "admin" || data.user.name.toUpperCase().includes("OTTO")) await loadUsers();
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
    if (data.user.role === "admin" || data.user.name.toUpperCase().includes("OTTO")) await loadUsers();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setRecords([]);
    setDraft(emptySettlement());
    setActiveId("");
    setUserMenuOpen(false);
  }

  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: recoveryEmail }),
    });
    const data = await response.json();
    setNotice(data.message ?? data.error ?? "Solicitud procesada.");
  }

  async function confirmPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (resetPassword !== resetPasswordConfirm) {
      setNotice("Las claves no coinciden.");
      return;
    }
    const response = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: resetPassword }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "No se pudo restablecer la clave.");
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    setResetToken("");
    setResetPassword("");
    setResetPasswordConfirm("");
    setRecoverOpen(false);
    setNotice(data.message ?? "Clave actualizada. Ya puedes iniciar sesion.");
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      setNotice("Las claves no coinciden.");
      return;
    }
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "No se pudo cambiar la clave.");
      return;
    }
    setPasswordModalOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setNotice(data.message ?? "Clave actualizada.");
    await logout();
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
      const nextRecords = (data.settlements ?? []).map((record: Settlement) => normalizeSettlement(record));
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

  function canActOnRecord(record: Settlement) {
    return Boolean(
      currentUser &&
        record.status !== "enviado gerencia" &&
        (currentUser.role === "admin" ||
          record.ownerId === currentUser.id ||
          (record.access ?? []).some((access) => access.userId === currentUser.id)),
    );
  }

  function openRecord(record: Settlement, message?: string) {
    setDraft(normalizeSettlement(record));
    setActiveId(record.id);
    setRequestsOpen(true);
    setActiveView("requestInfo");
    setActivityTarget(null);
    if (message) setNotice(message);
  }

  async function saveSettlement(event?: FormEvent, override: SettlementOverride = {}) {
    event?.preventDefault();
    if (!canSave) {
      setValidationModal({
        title: "Accion no permitida",
        messages: ["Este usuario puede revisar y comentar, pero no guardar cambios."],
      });
      return null;
    }
    const payload = { ...draft, ...override };
    const missingFields: string[] = [];
    if (!payload.fundType.trim()) {
      missingFields.push("Tipo");
    }
    if (!payload.projectName.trim()) {
      missingFields.push("Proyecto / objeto");
    }
    if (!payload.employee.trim()) {
      missingFields.push("Responsable");
    }
    if (!payload.department.trim()) {
      missingFields.push("Area");
    }
    if (payload.advanceCents <= 0) {
      missingFields.push("Valor solicitado / consignado");
    }
    if (!payload.depositSource.trim()) {
      missingFields.push("Origen");
    }
    if (requiresEstimatedDates(payload.fundType)) {
      if (!payload.periodStart) missingFields.push("Fecha desde");
      if (!payload.periodEnd) missingFields.push("Fecha hasta");
    }
    if (missingFields.length) {
      setValidationModal({
        title: "Campos obligatorios pendientes",
        messages: [
          "Para continuar debes diligenciar los siguientes campos:",
          ...missingFields,
        ],
      });
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

    const savedSettlement = normalizeSettlement(data.settlement);
    setDraft(savedSettlement);
    setActiveId(savedSettlement.id);
    setNotice(activeId ? "Movimiento guardado correctamente." : "Solicitud creada.");
    await loadRecords();
    return savedSettlement;
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

    const nextSettlement = normalizeSettlement(data.settlement);
    setDraft(nextSettlement);
    setActiveId(nextSettlement.id);
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

  async function uploadRecordSupport(record: Settlement, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canActOnRecord(record)) return;

    const form = new FormData();
    form.append("settlementId", record.id);
    form.append("file", file);

    setUploading(record.id);
    const response = await fetch("/api/evidences", { method: "POST", body: form });
    const data = await response.json();
    setUploading("");

    if (!response.ok) {
      setNotice(data.error ?? "No se pudo cargar el soporte.");
      return;
    }

    const nextSettlement = normalizeSettlement(data.settlement);
    setDraft(nextSettlement);
    setActiveId(nextSettlement.id);
    setNotice("Soporte cargado correctamente.");
    await loadRecords();
  }

  async function sendToManagement(record: Settlement) {
    if (!canActOnRecord(record)) return;
    const closedRecord = { ...normalizeSettlement(record), status: "enviado gerencia" };
    const finalMessage = finalBalanceText(closedRecord);
    const response = await fetch(`/api/settlements/${record.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(closedRecord),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "No se pudo enviar a gerencia.");
      return;
    }

    await fetch(`/api/settlements/${record.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: `Solicitud enviada a gerencia. Se cierra la actividad para nuevos soportes y gastos. ${finalMessage}` }),
    });

    const nextSettlement = normalizeSettlement(data.settlement);
    setDraft(nextSettlement);
    setActiveId(nextSettlement.id);
    setManagementTarget(null);
    setNotice(`Solicitud enviada a gerencia. ${finalMessage}`);
    await loadRecords();
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
        comment: `Solicitud de ampliacion de fondos por ${formatMoney(amount, draft.currency)}. Motivo: ${reason}`,
      }),
    });
    if (!response.ok) {
      setNotice("No se pudo registrar la solicitud de ampliacion.");
      return;
    }
    await saveSettlement(undefined, { status: "solicitud ampliacion", topUpAmountCents: amount, topUpReason: reason });
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
            "id,tipo,responsable,area,proyecto_o_objeto,id_solicitud,referencia_consignacion,estado,moneda,consignado,gastado,reintegrado,devuelto,saldo",
            ...records.map((record) => {
              const spent = sumSpent(record.expenses);
              const refunded = sumRefunded(record.expenses);
              const balance = fundBalance(record);
              return [
                record.id,
                record.fundType,
                record.employee,
                record.department,
                record.projectName,
                record.fundCode,
                record.depositReference,
                record.status,
                record.currency,
                record.advanceCents / 100,
                spent / 100,
                refunded / 100,
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
      const spent = sumSpent(saved.expenses);
      const refunded = sumRefunded(saved.expenses);
      const balance = fundBalance(saved);

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
      addLine("ID solicitud", saved.fundCode);
      addLine("Fecha consignacion", saved.depositDate);
      addLine("Referencia", saved.depositReference);
      addLine("Origen", saved.depositSource);
      addLine("Estado", saved.status);
      y += 10;
      addLine("Consignado", formatMoney(saved.advanceCents, saved.currency));
      addLine("Gastado", formatMoney(spent, saved.currency));
      addLine("Reintegrado en gastos", formatMoney(refunded, saved.currency));
      addLine("Devuelto", formatMoney(saved.cashReturnedCents, saved.currency));
      addLine(balance < 0 ? "Excedido" : "Disponible", formatMoney(Math.abs(balance), saved.currency));

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
        doc.text(formatMoney(expense.amountCents, saved.currency), pageWidth - margin - 90, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        addWrapped(
          `${expense.vendor || "Proveedor sin registrar"} | Factura: ${expense.invoice || "-"} | Reintegrado: ${formatMoney(expense.refundCents ?? 0, saved.currency)} | ${expense.description || "-"}`,
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
    setEditingUserId("");
    setNewUser({ name: "", email: "", role: "solicitante", password: "" });
    await loadUsers();
  }

  function editUser(user: AppUser) {
    setEditingUserId(user.id);
    setNewUser({
      name: user.name,
      email: user.email,
      role: user.role,
      password: "",
    });
  }

  function clearUserForm() {
    setEditingUserId("");
    setNewUser({ name: "", email: "", role: "solicitante", password: "" });
  }

  async function grantAccess() {
    if (!activeId || !selectedUserId || !canManageAccess) return;
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
    if (refreshed) setDraft(normalizeSettlement(refreshed));
  }

  async function addComment() {
    if (!activeId || !commentDraft.trim()) return;
    if (draftClosed) {
      setNotice("La solicitud ya fue enviada a gerencia y la actividad esta cerrada.");
      return;
    }
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
    if (refreshed) setDraft(normalizeSettlement(refreshed));
  }

  if (!authChecked) {
    return <main className="login-shell"><p className="muted">Cargando...</p></main>;
  }

  if (!currentUser) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={resetToken ? confirmPasswordReset : recoverOpen ? requestPasswordReset : login}>
          <div className="login-logo">
            <img src="/uscom-logo.png" alt="USCOM SAS" />
          </div>
          <div className="brand-copy">
            <strong>Sistema de Legalización de Gastos</strong>
            <span>USCOM SAS</span>
          </div>
          <p className="eyebrow">Acceso privado</p>
          <h1>{resetToken ? "Nueva clave" : recoverOpen ? "Recuperar acceso" : "Legalizaciones"}</h1>
          {!recoverOpen && !resetToken && (
            <>
              <label>
                Usuario
                <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} autoComplete="username" />
              </label>
              <label>
                Clave
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <button className="save" type="submit">Entrar</button>
              <button type="button" className="link-button" onClick={() => setRecoverOpen(true)}>
                Olvide mi usuario o contrasena
              </button>
            </>
          )}
          {recoverOpen && !resetToken && (
            <>
              <p className="muted">Ingresa tu correo registrado y enviaremos un enlace temporal para restablecer el acceso.</p>
              <label>
                Correo registrado
                <input value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} autoComplete="email" />
              </label>
              <button className="save" type="submit">Enviar enlace</button>
              <button type="button" className="link-button" onClick={() => setRecoverOpen(false)}>
                Volver al inicio de sesion
              </button>
            </>
          )}
          {resetToken && (
            <>
              <label>
                Nueva clave
                <input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoComplete="new-password" />
              </label>
              <label>
                Confirmar clave
                <input type="password" value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} autoComplete="new-password" />
              </label>
              <button className="save" type="submit">Actualizar clave</button>
            </>
          )}
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
          <strong>Sistema de Legalización de Gastos</strong>
          <span>USCOM SAS</span>
        </div>
        <nav className="crm-nav" aria-label="Menu principal">
          <button type="button" className={activeView === "dashboard" ? "active" : ""} onClick={() => setActiveView("dashboard")}>
            <span>Resumen analitico</span>
            <strong>{records.length}</strong>
          </button>
          <div className="nav-group">
            <button
              type="button"
              className={["new", "requestInfo", "status"].includes(activeView) ? "active nav-parent" : "nav-parent"}
              onClick={() => setRequestsOpen((open) => !open)}
              aria-expanded={requestsOpen}
            >
              <span>Solicitudes</span>
              <strong>{requestsOpen ? "-" : "+"}</strong>
            </button>
            {requestsOpen && (
              <div className="crm-subnav">
                <button
                  type="button"
                  className={activeView === "new" ? "active" : ""}
                  onClick={() => {
                    setDraft(emptySettlement());
                    setActiveId("");
                    setActiveView("new");
                  }}
                >
                  <span>Nueva solicitud</span>
                  <strong>+</strong>
                </button>
                <button
                  type="button"
                  className={activeView === "status" || activeView === "requestInfo" ? "active" : ""}
                  onClick={() => setActiveView("status")}
                >
                  <span>Gestion de solicitudes</span>
                  <strong>{dashboardStats.pending}</strong>
                </button>
              </div>
            )}
          </div>
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
          {currencyStats.map((stat) => (
            <div className="sidebar-currency" key={stat.currency}>
              <span>{stat.currency}</span>
              <strong>{formatMoney(stat.balance, stat.currency)}</strong>
            </div>
          ))}
        </div>
      </aside>

      <section className="workbench crm-content">
        <div className="topbar">
          <div>
            <p className="eyebrow">Fondos operativos</p>
            <h1>
              {activeView === "dashboard" && "Resumen analitico"}
              {activeView === "new" && "Solicitud nueva"}
              {activeView === "requestInfo" && "Informacion de solicitud"}
              {activeView === "status" && "Gestion de solicitudes"}
              {activeView === "reports" && "Reportes"}
              {activeView === "admin" && "Administrador"}
            </h1>
          </div>
          <div className="actions">
            <span className="user-pill">{currentUser.name} · {currentUser.role}</span>
            <div className="user-menu">
              <button type="button" className="menu-trigger" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}>
                Cuenta
              </button>
              {userMenuOpen && (
                <div className="user-menu-list">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordModalOpen(true);
                      setUserMenuOpen(false);
                    }}
                  >
                    Cambiar contrasena
                  </button>
                  <button type="button" onClick={logout}>Cerrar sesion</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {activeView === "dashboard" && (
          <>
            <section className="panel currency-analytics">
              <div className="section-title">
                <h2>Analitica por moneda</h2>
                <span>COP / USD separados</span>
              </div>
              <div className="currency-grid">
                {currencyStats.map((stat) => (
                  <article className="currency-card" key={stat.currency}>
                    <div>
                      <span>Moneda</span>
                      <strong>{stat.currency}</strong>
                      <small>{stat.count} solicitudes</small>
                    </div>
                    <dl>
                      <dt>Solicitado / consignado</dt>
                      <dd>{formatMoney(stat.requested, stat.currency)}</dd>
                      <dt>Gastado</dt>
                      <dd>{formatMoney(stat.spent, stat.currency)}</dd>
                      <dt>Devuelto</dt>
                      <dd>{formatMoney(stat.returned, stat.currency)}</dd>
                      <dt>{stat.balance >= 0 ? "Disponible" : "Excedido"}</dt>
                      <dd className={stat.balance < 0 ? "negative" : "positive"}>{formatMoney(Math.abs(stat.balance), stat.currency)}</dd>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

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

        {(activeView === "new" || activeView === "requestInfo") && (
          <>
        <section className="workflow-panel">
          <div className={`workflow-step ${draft.status === "borrador" ? "active" : ""}`}>
            <strong>1</strong>
            <span>Solicitud</span>
          </div>
          <div className={`workflow-step ${draft.status === "pendiente aprobacion" ? "active" : ""}`}>
            <strong>2</strong>
            <span>Aprobacion Contabilidad / Gerencia</span>
          </div>
          <div className={`workflow-step ${["consignado", "registrando gastos", "aprobado"].includes(draft.status) ? "active" : ""}`}>
            <strong>3</strong>
            <span>Consignado</span>
          </div>
          <div className={`workflow-step ${draft.status === "solicitud ampliacion" ? "active" : ""}`}>
            <strong>4</strong>
            <span>Ampliacion</span>
          </div>
        </section>

        <form className="editor" onSubmit={saveSettlement} noValidate>
          <section className="panel details-panel">
            <div className="section-title">
              <h2>{activeView === "requestInfo" ? "Informacion de la solicitud" : "1. Solicitud de consignacion"}</h2>
              <span className={`request-status ${draft.status.replaceAll(" ", "-")}`}>{draft.status}</span>
            </div>

            <div className="form-grid">
              <label>
                <FieldLabel>Tipo</FieldLabel>
                <select
                  value={draft.fundType}
                  disabled={!canEdit}
                  onChange={(event) => updateDraft("fundType", event.target.value)}
                >
                  <option>Caja menor</option>
                  <option>Proyecto</option>
                  <option>Viaticos</option>
                </select>
              </label>
              <label>
                <FieldLabel>Proyecto / objeto</FieldLabel>
                <input
                  value={draft.projectName}
                  readOnly={!canSave}
                  onChange={(event) => updateDraft("projectName", event.target.value)}
                  placeholder="Nombre del proyecto o viaje"
                />
              </label>
              <label>
                <FieldLabel>Responsable</FieldLabel>
                <input
                  value={draft.employee}
                  readOnly={!canEdit}
                  onChange={(event) => updateDraft("employee", event.target.value)}
                  placeholder="Nombre completo"
                />
              </label>
              <label>
                <FieldLabel>Area</FieldLabel>
                <input
                  value={draft.department}
                  readOnly={!canEdit}
                  onChange={(event) => updateDraft("department", event.target.value)}
                  placeholder="Administrativa"
                />
              </label>
              <label>
                <FieldLabel>ID solicitud</FieldLabel>
                <input
                  value={draft.fundCode}
                  readOnly
                  placeholder="Se genera al crear la solicitud"
                />
              </label>
              <label>
                <FieldLabel>Valor solicitado / consignado</FieldLabel>
                <div className="money-input">
                  <input
                    inputMode="numeric"
                    readOnly={!canSave}
                    value={draft.advanceCents ? draft.advanceCents / 100 : ""}
                    onChange={(event) => updateDraft("advanceCents", parseMoney(event.target.value))}
                    placeholder="0"
                  />
                  <select
                    aria-label="Moneda"
                    disabled={!canSave}
                    value={draft.currency}
                    onChange={(event) => updateDraft("currency", coerceCurrency(event.target.value))}
                  >
                    <option value="COP">COP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
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
                <FieldLabel>Origen</FieldLabel>
                <select
                  value={draft.depositSource}
                  disabled={!canEdit}
                  onChange={(event) => updateDraft("depositSource", event.target.value)}
                >
                  <option value="">Seleccionar origen</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </label>
              {requiresEstimatedDates(draft.fundType) && (
                <>
                  <label>
                    <FieldLabel>Desde</FieldLabel>
                    <input
                      type="date"
                      readOnly={!canEdit}
                      required
                      value={draft.periodStart}
                      onChange={(event) => updateDraft("periodStart", event.target.value)}
                    />
                  </label>
                  <label>
                    <FieldLabel>Hasta</FieldLabel>
                    <input
                      type="date"
                      readOnly={!canEdit}
                      required
                      value={draft.periodEnd}
                      onChange={(event) => updateDraft("periodEnd", event.target.value)}
                    />
                  </label>
                </>
              )}
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
            <div className="workflow-actions request-actions">
              <button type="button" className="request-action-button request-action-draft" disabled={!canEdit} onClick={() => void saveSettlement()}>
                Guardar borrador
              </button>
              <button type="button" className="request-action-button request-action-submit" disabled={!canEdit} onClick={submitForApproval}>
                Enviar a aprobacion
              </button>
              {canApproveConsignation && (
                <button type="button" className="pdf-button request-action-button" disabled={!activeId} onClick={approveConsignation}>
                  Aprobar consignacion
                </button>
              )}
            </div>
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
                  Crea la solicitud y enviala a aprobacion. Los gastos se habilitan cuando Contabilidad / Gerencia marque la consignacion.
                </div>
              )}
              {draftClosed && (
                <div className="empty-state">
                  Solicitud enviada a gerencia. La actividad esta cerrada para nuevos gastos y soportes.
                </div>
              )}
              {hasConsignation && !draftClosed && !expensesEnabled && (
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
                      Valor
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
                      Reintegrado
                      <input
                        inputMode="numeric"
                        readOnly={!canEdit}
                        value={expense.refundCents ? expense.refundCents / 100 : ""}
                        onChange={(event) =>
                          updateExpense(expense.id, { refundCents: parseMoney(event.target.value) })
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
              <span>Total gastado</span>
              <strong>{formatMoney(totals.spent, draft.currency)}</strong>
              <span>Reintegrado</span>
              <strong className="positive">{formatMoney(totals.refunded, draft.currency)}</strong>
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
                {formatMoney(Math.abs(totals.balance), draft.currency)}
              </strong>
            </div>

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
            {canManageAccess && (
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
                disabled={draftClosed}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Registra una novedad, observacion o comentario de revision"
              />
            </label>
            <button type="button" className="pdf-button novelty-action" disabled={draftClosed} onClick={addComment}>Registrar novedad</button>
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
              <h2>Gestion de solicitudes</h2>
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
                  <span>Acciones</span>
                </div>
                {records.map((record) => {
                  const spent = sumSpent(record.expenses);
                  const refunded = sumRefunded(record.expenses);
                  const netSpent = spent - refunded;
                  const balance = fundBalance(record);
                  const recordClosed = record.status === "enviado gerencia";
                  const canUseActions = canActOnRecord(record);
                  return (
                    <article
                      className="status-row"
                      key={record.id}
                    >
                      <span>
                        <strong>{record.projectName || record.fundCode || record.fundType}</strong>
                        <small>{record.employee || "Sin responsable"} · {record.fundType}</small>
                      </span>
                      <span className={`request-status ${record.status.replaceAll(" ", "-")}`}>{record.status}</span>
                      <span>{formatMoney(record.advanceCents, record.currency)}</span>
                      <span>{formatMoney(netSpent, record.currency)}</span>
                      <span className={balance < 0 ? "negative" : "positive"}>{formatMoney(Math.abs(balance), record.currency)}</span>
                      <span>{record.evidences.length}</span>
                      <span className="row-actions">
                        <label className={`mini-action upload-action ${!canUseActions ? "disabled" : ""}`}>
                          {uploading === record.id ? "Subiendo..." : "Subir soporte"}
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            disabled={!canUseActions}
                            onChange={(event) => uploadRecordSupport(record, event)}
                          />
                        </label>
                        <button
                          type="button"
                          className="mini-action"
                          onClick={() => setActivityTarget(normalizeSettlement(record))}
                        >
                          Ver actividad
                        </button>
                        <button
                          type="button"
                          className="mini-action primary-action"
                          disabled={!canUseActions || recordClosed}
                          onClick={() => setManagementTarget(normalizeSettlement(record))}
                        >
                          Enviar a gerencia
                        </button>
                      </span>
                    </article>
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
              <Metric label="Pendientes aprobacion" value={String(dashboardStats.pending)} tone={dashboardStats.pending ? "warn" : undefined} />
              <Metric label="Fondos en tramite" value={String(dashboardStats.active)} />
              <Metric label="Soportes cargados" value={String(dashboardStats.supportCount)} tone="ok" />
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
                      <span>Moneda</span>
                      <span>Mov.</span>
                      <span>Total</span>
                    </div>
                    {reportRows.map((row) => (
                      <div className="report-row" key={`${row.currency}-${row.category}`}>
                        <span>{row.category}</span>
                        <span>{row.currency}</span>
                        <span>{row.count}</span>
                        <strong>{formatMoney(row.amount, row.currency)}</strong>
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
                    <strong>{editingUserId ? "Editar usuario" : "Nuevo usuario"}</strong>
                    <span>{editingUserId ? "Actualiza nombre, correo, rol o clave si necesitas restablecerla." : "Registra usuarios autorizados para acceder al sistema."}</span>
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
                    <input value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} placeholder={editingUserId ? "Opcional: solo si se va a cambiar" : "Cambio123"} />
                  </label>
                  <div className="user-form-actions">
                    <button className="save" type="submit">{editingUserId ? "Actualizar usuario" : "Guardar usuario"}</button>
                    {editingUserId && <button type="button" className="ghost" onClick={clearUserForm}>Nuevo</button>}
                  </div>
                </form>

                <div className="user-table" role="table" aria-label="Usuarios autorizados">
                  <div className="user-table-row header" role="row">
                    <span role="columnheader">Usuario</span>
                    <span role="columnheader">Rol</span>
                    <span role="columnheader">Estado</span>
                    <span role="columnheader">Acciones</span>
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
                      <span role="cell">
                        <button type="button" className="mini-action" onClick={() => editUser(user)}>Editar</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
        {managementTarget && (
          <div className="modal-backdrop" role="presentation">
            <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="management-confirm-title">
              <h2 id="management-confirm-title">Enviar a gerencia</h2>
              <p>
                Advertencia: si envia esta solicitud a gerencia se cerrara la actividad y no podra subir mas soportes ni registrar nuevos gastos.
              </p>
              <div className="modal-summary">
                <span>{managementTarget.projectName || managementTarget.fundCode || managementTarget.fundType}</span>
                <strong>{formatMoney(managementTarget.advanceCents, managementTarget.currency)}</strong>
                <p>{finalBalanceText(managementTarget)}</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setManagementTarget(null)}>
                  Cancelar
                </button>
                <button type="button" className="save" onClick={() => void sendToManagement(managementTarget)}>
                  Confirmar envio
                </button>
              </div>
            </section>
          </div>
        )}
        {activityTarget && (
          <div className="modal-backdrop" role="presentation">
            <section className="activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-title">
              <div className="section-title">
                <div>
                  <h2 id="activity-title">Actividad de la solicitud</h2>
                  <span>{activityTarget.projectName || activityTarget.fundCode || activityTarget.fundType}</span>
                </div>
                <span className={`request-status ${activityTarget.status.replaceAll(" ", "-")}`}>{activityTarget.status}</span>
              </div>

              <div className="activity-grid">
                <section>
                  <h3>Soportes</h3>
                  <div className="activity-list">
                    {activityTarget.evidences.map((evidence) => (
                      <a key={evidence.id} href={`/api/evidences/${evidence.id}`} target="_blank" rel="noreferrer">
                        {evidence.fileName}
                      </a>
                    ))}
                    {activityTarget.evidences.length === 0 && <div className="empty-state">No hay soportes cargados.</div>}
                  </div>
                </section>

                <section>
                  <h3>Novedades</h3>
                  <div className="comment-list activity-list">
                    {(activityTarget.comments ?? []).filter((comment) => !isSystemLog(comment)).map((comment) => (
                      <article key={comment.id}>
                        <strong>{comment.userName}</strong>
                        <span>{formatDateTime(comment.createdAt)}</span>
                        <p>{comment.comment}</p>
                      </article>
                    ))}
                    {(activityTarget.comments ?? []).filter((comment) => !isSystemLog(comment)).length === 0 && (
                      <div className="empty-state">Aun no hay novedades registradas.</div>
                    )}
                  </div>
                </section>

                <section>
                  <h3>Logs del sistema</h3>
                  <div className="log-list activity-list">
                    {(activityTarget.comments ?? []).filter(isSystemLog).map((comment) => (
                      <article key={comment.id}>
                        <span>{formatDateTime(comment.createdAt)}</span>
                        <p>{cleanLogMessage(comment.comment)}</p>
                      </article>
                    ))}
                    {(activityTarget.comments ?? []).filter(isSystemLog).length === 0 && (
                      <div className="empty-state">Aun no hay logs registrados.</div>
                    )}
                  </div>
                </section>
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setActivityTarget(null)}>
                  Cerrar
                </button>
                <button type="button" className="save" onClick={() => openRecord(activityTarget)}>
                  Abrir solicitud
                </button>
              </div>
            </section>
          </div>
        )}
        {passwordModalOpen && (
          <div className="modal-backdrop" role="presentation">
            <form className="confirm-modal password-modal" role="dialog" aria-modal="true" aria-labelledby="password-title" onSubmit={changePassword}>
              <h2 id="password-title">Cambiar contrasena</h2>
              <p>Actualiza tu clave de acceso. Al guardar, se cerraran las sesiones activas por seguridad.</p>
              <label>
                Clave actual
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
              </label>
              <label>
                Nueva clave
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
              </label>
              <label>
                Confirmar nueva clave
                <input type="password" value={newPasswordConfirm} onChange={(event) => setNewPasswordConfirm(event.target.value)} autoComplete="new-password" />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setPasswordModalOpen(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setNewPasswordConfirm("");
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="save">Actualizar clave</button>
              </div>
            </form>
          </div>
        )}
        {validationModal && (
          <div className="modal-backdrop" role="presentation">
            <section className="confirm-modal validation-modal" role="alertdialog" aria-modal="true" aria-labelledby="validation-title">
              <h2 id="validation-title">{validationModal.title}</h2>
              <div className="validation-content">
                <p>{validationModal.messages[0]}</p>
                {validationModal.messages.length > 1 && (
                  <ul>
                    {validationModal.messages.slice(1).map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="save" onClick={() => setValidationModal(null)}>
                  Entendido
                </button>
              </div>
            </section>
          </div>
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
