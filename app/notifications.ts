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
  const value = process.env?.[key]?.trim();
  if (!value) return undefined;
  return value.replace(/^["']|["']$/g, "");
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

function apiKeyFingerprint(apiKey: string) {
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)} (${apiKey.length} caracteres)`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function detailRow(label: string, value: unknown, highlight = false) {
  return `
    <tr>
      <td style="width: 185px; background: #f4f7fb; color: #4b5d73; font-weight: 700; padding: 13px 14px; border-bottom: 1px solid #e2e8f0;">
        ${escapeHtml(label)}
      </td>
      <td style="padding: 13px 14px; border-bottom: 1px solid #e2e8f0; color: ${highlight ? "#075eb8" : "#111827"}; font-weight: ${highlight ? "800" : "600"};">
        ${escapeHtml(value || "-")}
      </td>
    </tr>
  `;
}

function normalizeAppUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function logNotification(settlementId: string, message: string) {
  const db = getDb();
  const [admin] = await db.select().from(users).where(eq(users.role, "admin"));
  if (!admin) return;
  await db.insert(reviewComments).values({
    id: crypto.randomUUID(),
    settlementId,
    userId: admin.id,
    comment: `[LOG] ${message}`,
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
  const openUrl = normalizeAppUrl(baseUrl);
  const logoUrl = `${openUrl}/uscom-logo.png`;

  if (!apiKey) {
    await logNotification(
      settlement.id,
      `Notificacion de correo pendiente para ${recipients.join(", ")}. Falta configurar RESEND_API_KEY en Coolify.`,
    );
    return;
  }

  const subject = `Nueva solicitud de consignacion: ${settlement.projectName || settlement.fundCode || settlement.fundType}`;
  const html = `
    <div style="margin: 0; padding: 0; background: #f3f7fb; font-family: Arial, Helvetica, sans-serif; color: #111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f3f7fb; padding: 24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 680px; background: #ffffff; border: 1px solid #dbe5ef; border-radius: 8px; overflow: hidden;">
              <tr>
                <td style="background: #075eb8; color: #ffffff; padding: 24px 28px; text-align: center;">
                  <div style="background: #ffffff; border-radius: 6px; display: inline-block; margin: 0 0 14px; padding: 8px 14px;">
                    <img src="${escapeHtml(logoUrl)}" width="190" alt="USCOM SAS" style="border: 0; display: block; height: auto; max-width: 190px;" />
                  </div>
                  <div style="font-size: 13px; font-weight: 800; letter-spacing: 0; text-transform: uppercase;">USCOM SAS</div>
                  <h1 style="font-size: 24px; line-height: 1.25; margin: 8px 0 0;">Nueva solicitud de consignacion</h1>
                  <p style="font-size: 14px; margin: 8px 0 0; opacity: 0.92;">${escapeHtml(settlement.projectName || settlement.fundCode || settlement.fundType)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 26px 28px;">
                  <p style="font-size: 15px; line-height: 1.55; margin: 0 0 16px;">
                    Se ha enviado una solicitud para revision y aprobacion de consignacion. A continuacion encontrara el resumen registrado en el sistema.
                  </p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; margin: 18px 0;">
                    ${detailRow("Solicitante", settlement.employee)}
                    ${detailRow("Correo solicitante", requester?.email)}
                    ${detailRow("Tipo", settlement.fundType)}
                    ${detailRow("Proyecto / objeto", settlement.projectName)}
                    ${detailRow("Codigo", settlement.fundCode)}
                    ${detailRow("Valor solicitado", formatCop(settlement.advanceCents), true)}
                    ${detailRow("Estado", settlement.status)}
                  </table>
                  <p style="font-size: 14px; line-height: 1.5; margin: 0 0 18px; color: #4b5d73;">
                    Para revisar soportes, registrar observaciones o aprobar la consignacion, abra la solicitud en la plataforma.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 14px;">
                    <tr>
                      <td bgcolor="#075eb8" style="border-radius: 6px;">
                        <a href="${escapeHtml(openUrl)}" target="_blank" style="display: inline-block; color: #ffffff; font-size: 14px; font-weight: 800; padding: 14px 22px; text-decoration: none;">
                          Abrir solicitud en Legalizaciones
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="font-size: 12px; line-height: 1.5; margin: 0; color: #7a8797;">
                    Si el boton no abre, copie este enlace en el navegador:<br />
                    <a href="${escapeHtml(openUrl)}" target="_blank" style="color: #075eb8; word-break: break-all;">${escapeHtml(openUrl)}</a>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background: #f8fafc; color: #7a8797; font-size: 12px; padding: 16px 28px; text-align: center;">
                  Sistema de Gestion USCOM SAS
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
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
      `No se pudo enviar correo a ${recipients.join(", ")}. Key usada: ${apiKeyFingerprint(apiKey)}. Respuesta proveedor: ${detail}`,
    );
    return;
  }

  await logNotification(settlement.id, `Correo de aprobacion enviado a ${recipients.join(", ")} desde ${from}.`);
}
