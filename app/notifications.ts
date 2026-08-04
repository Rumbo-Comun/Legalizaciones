import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { reviewComments, settlements, users } from "../db/schema";

type Reviewer = {
  id: string;
  name: string;
  email: string;
};

type SettlementForMail = typeof settlements.$inferSelect;

const fallbackBaseUrl = "http://127.0.0.1:3020";

function getRuntimeValue(key: string) {
  return process.env?.[key] || undefined;
}

function formatCop(cents: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

function cleanMailName(value: string) {
  return value.replace(/[<>"\r\n]/g, "").trim();
}

function hasDeliverableEmail(email?: string) {
  return Boolean(email && email.includes("@") && !email.endsWith("@local"));
}

function requesterFrom(requester?: Reviewer) {
  if (!hasDeliverableEmail(requester?.email)) return null;
  const name = cleanMailName(requester?.name || "Legalizaciones USCOM");
  return `${name} <${requester!.email}>`;
}

async function logNotification(settlementId: string, message: string) {
  const db = getDb();
  const [admin] = await db.select().from(users).where(eq(users.role, "admin"));
  if (!admin) return;
  await db.insert(reviewComments).values({
    id: crypto.randomUUID(),
    settlementId,
    userId: admin.id,
    comment: message,
  });
}

export async function notifyApprovalRequest(settlement: SettlementForMail, reviewers: Reviewer[], requester?: Reviewer) {
  const recipients = reviewers
    .map((reviewer) => reviewer.email)
    .filter((email) => email && !email.endsWith("@local"));

  if (!recipients.length) {
    await logNotification(
      settlement.id,
      "Notificacion de correo pendiente: los revisores tienen correos locales. Configura el correo real de OTTO en usuarios.",
    );
    return;
  }

  const apiKey = getRuntimeValue("RESEND_API_KEY");
  const from = requesterFrom(requester) || getRuntimeValue("MAIL_FROM") || "Legalizaciones USCOM <noreply@uscom.net.co>";
  const baseUrl = getRuntimeValue("APP_BASE_URL") || fallbackBaseUrl;

  if (!apiKey) {
    await logNotification(
      settlement.id,
      `Notificacion de correo pendiente para ${recipients.join(", ")}. Falta configurar RESEND_API_KEY en Coolify.`,
    );
    return;
  }

  const subject = `Nueva solicitud de consignacion: ${settlement.projectName || settlement.fundCode || settlement.fundType}`;
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0b2347;">
      <h2>Nueva solicitud de consignacion</h2>
      <p><strong>Solicitante:</strong> ${settlement.employee}</p>
      <p><strong>Correo solicitante:</strong> ${requester?.email || "-"}</p>
      <p><strong>Tipo:</strong> ${settlement.fundType}</p>
      <p><strong>Proyecto / objeto:</strong> ${settlement.projectName || "-"}</p>
      <p><strong>Codigo:</strong> ${settlement.fundCode || "-"}</p>
      <p><strong>Valor solicitado:</strong> ${formatCop(settlement.advanceCents)}</p>
      <p><strong>Estado:</strong> ${settlement.status}</p>
      <p><a href="${baseUrl}" style="color:#0a4fb3;font-weight:bold;">Abrir sistema de legalizaciones</a></p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      reply_to: hasDeliverableEmail(requester?.email) ? requester?.email : undefined,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    await logNotification(
      settlement.id,
      `No se pudo enviar correo a ${recipients.join(", ")}. Respuesta proveedor: ${detail}`,
    );
    return;
  }

  await logNotification(settlement.id, `Correo de aprobacion enviado a ${recipients.join(", ")} desde ${from}.`);
}
