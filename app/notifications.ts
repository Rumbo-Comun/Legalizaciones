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

function formatMoney(cents: number, currency: string) {
  const code = currency?.toUpperCase() === "USD" ? "USD" : "COP";
  return `${code} ${new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))}`;
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
      "Notificacion de correo pendiente: los revisores tienen correos locales. Configura el correo real del revisor de Contabilidad / Gerencia en usuarios.",
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

  const requestId = settlement.fundCode || settlement.id;
  const subject = `Nueva solicitud de consignacion: ${requestId}`;
  const html = `
    <div style="margin: 0; padding: 0; background: #f3f7fb; font-family: Arial, Helvetica, sans-serif; color: #111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f3f7fb; padding: 24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 680px; background: #ffffff; border: 1px solid #dbe5ef; border-radius: 8px; overflow: hidden;">
              <tr>
                <td style="background: #075eb8; color: #ffffff; padding: 24px 28px; text-align: center;">
                  <div style="background: #ffffff; border-radius: 6px; display: inline-block; margin: 0 0 14px; padding: 8px 14px;">
                    <img src="${escapeHtml(logoUrl)}" width="210" alt="USCOM SAS" style="border: 0; display: block; height: auto; max-width: 210px;" />
                  </div>
                  <h1 style="font-size: 24px; line-height: 1.25; margin: 0;">Nueva Solicitud de Consignaci&oacute;n</h1>
                  <p style="font-size: 15px; font-weight: 800; margin: 10px 0 0; opacity: 0.94;">${escapeHtml(requestId)}</p>
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
                    ${detailRow("ID solicitud", requestId)}
                    ${detailRow("Valor solicitado", formatMoney(settlement.advanceCents, settlement.currency), true)}
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

export async function notifyRequesterApproval(
  settlement: SettlementForMail,
  requester?: Reviewer | null,
  approver?: Reviewer,
) {
  if (!hasDeliverableEmail(requester?.email)) {
    await logNotification(settlement.id, "Notificacion de aprobacion pendiente: el solicitante no tiene correo real configurado.");
    return;
  }

  const apiKey = getRuntimeValue("RESEND_API_KEY");
  const from = getRuntimeValue("MAIL_FROM") || "Legalizaciones USCOM <noreply@uscom.net.co>";
  const baseUrl = getRuntimeValue("APP_BASE_URL") || fallbackBaseUrl;
  const openUrl = normalizeAppUrl(baseUrl);
  const logoUrl = `${openUrl}/uscom-logo.png`;
  const requestId = settlement.fundCode || settlement.id;

  if (!apiKey) {
    await logNotification(
      settlement.id,
      `Notificacion de aprobacion pendiente para ${requester?.email}. Falta configurar RESEND_API_KEY en Coolify.`,
    );
    return;
  }

  const subject = `Solicitud aprobada: ${requestId}`;
  const html = `
    <div style="margin:0; padding:24px 12px; background:#f3f7fb; font-family:Arial, Helvetica, sans-serif; color:#111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #dbe5ef; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:#007f68; color:#ffffff; padding:24px 28px; text-align:center;">
            <div style="background:#ffffff; border-radius:6px; display:inline-block; margin:0 0 14px; padding:8px 14px;">
              <img src="${escapeHtml(logoUrl)}" width="210" alt="USCOM SAS" style="border:0; display:block; height:auto; max-width:210px;" />
            </div>
            <h1 style="font-size:24px; margin:0;">Solicitud aprobada</h1>
            <p style="font-size:14px; margin:8px 0 0; opacity:.94;">La consignacion fue revisada y aprobada.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px;">
            <p style="font-size:15px; line-height:1.55; margin:0 0 16px;">
              Hola ${escapeHtml(requester?.name || settlement.employee)}, tu solicitud fue aprobada. Ya puedes ingresar a la plataforma para cargar soportes y registrar los gastos correspondientes.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #e2e8f0; margin:0 0 18px;">
              ${detailRow("Solicitante", settlement.employee)}
              ${detailRow("Tipo", settlement.fundType)}
              ${detailRow("Proyecto / objeto", settlement.projectName)}
              ${detailRow("ID solicitud", requestId)}
              ${detailRow("Valor aprobado", formatMoney(settlement.advanceCents, settlement.currency), true)}
              ${detailRow("Aprobado por", approver?.name || "Contabilidad / Gerencia")}
              ${detailRow("Estado", settlement.status)}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
              <tr>
                <td bgcolor="#075eb8" style="border-radius:6px;">
                  <a href="${escapeHtml(openUrl)}" target="_blank" style="display:inline-block; color:#ffffff; font-size:14px; font-weight:800; padding:14px 22px; text-decoration:none;">Abrir solicitud en Legalizaciones</a>
                </td>
              </tr>
            </table>
            <p style="font-size:12px; line-height:1.5; margin:0; color:#7a8797;">
              Si el boton no abre, copie este enlace en el navegador:<br />
              <a href="${escapeHtml(openUrl)}" target="_blank" style="color:#075eb8; word-break:break-all;">${escapeHtml(openUrl)}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc; color:#7a8797; font-size:12px; padding:16px 28px; text-align:center;">
            Sistema de Gestion USCOM SAS
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
      to: requester!.email,
      reply_to: hasDeliverableEmail(approver?.email) ? approver?.email : undefined,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    await logNotification(
      settlement.id,
      `No se pudo enviar correo de aprobacion al solicitante ${requester?.email}. Key usada: ${apiKeyFingerprint(apiKey)}. Respuesta proveedor: ${detail}`,
    );
    return;
  }

  await logNotification(settlement.id, `Correo de aprobacion al solicitante enviado a ${requester?.email} desde ${from}.`);
}

export async function notifyManagementSubmission(
  settlement: SettlementForMail,
  reviewers: Reviewer[],
  requester?: Reviewer,
  details?: { balanceCents?: number },
) {
  const recipients = reviewers
    .map((reviewer) => reviewer.email)
    .filter((email) => email && !email.endsWith("@local"));

  if (!recipients.length) {
    await logNotification(settlement.id, "Notificacion a gerencia pendiente: no hay correos reales configurados.");
    return;
  }

  const apiKey = getRuntimeValue("RESEND_API_KEY");
  const from = requesterFrom(requester) || getRuntimeValue("MAIL_FROM") || "Legalizaciones USCOM <noreply@uscom.net.co>";
  const baseUrl = getRuntimeValue("APP_BASE_URL") || fallbackBaseUrl;
  const openUrl = normalizeAppUrl(baseUrl);
  const finalBalance =
    typeof details?.balanceCents === "number"
      ? details.balanceCents > 0
        ? `Debe devolver ${formatMoney(details.balanceCents, settlement.currency)}`
        : details.balanceCents < 0
          ? `Saldo a favor ${formatMoney(Math.abs(details.balanceCents), settlement.currency)}`
          : "Saldo final en cero"
      : "-";

  if (!apiKey) {
    await logNotification(
      settlement.id,
      `Notificacion a gerencia pendiente para ${recipients.join(", ")}. Falta configurar RESEND_API_KEY en Coolify.`,
    );
    return;
  }

  const subject = `Legalizacion enviada a gerencia: ${settlement.projectName || settlement.fundCode || settlement.fundType}`;
  const html = `
    <div style="margin:0; padding:24px 12px; background:#f3f7fb; font-family:Arial, Helvetica, sans-serif; color:#111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #dbe5ef; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:#075eb8; color:#ffffff; padding:24px 28px; text-align:center;">
            <h1 style="font-size:24px; margin:0;">Legalizacion enviada a gerencia</h1>
            <p style="font-size:14px; margin:8px 0 0; opacity:.92;">La actividad fue cerrada para nuevos soportes.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #e2e8f0; margin:0 0 18px;">
              ${detailRow("Solicitante", settlement.employee)}
              ${detailRow("Correo solicitante", requester?.email)}
              ${detailRow("Tipo", settlement.fundType)}
              ${detailRow("Proyecto / objeto", settlement.projectName)}
              ${detailRow("ID solicitud", settlement.fundCode)}
              ${detailRow("Valor", formatMoney(settlement.advanceCents, settlement.currency), true)}
              ${detailRow("Resultado final", finalBalance, true)}
              ${detailRow("Estado", settlement.status)}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#075eb8" style="border-radius:6px;">
                  <a href="${escapeHtml(openUrl)}" target="_blank" style="display:inline-block; color:#ffffff; font-size:14px; font-weight:800; padding:14px 22px; text-decoration:none;">Abrir legalizacion</a>
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
      `No se pudo enviar correo de gerencia a ${recipients.join(", ")}. Key usada: ${apiKeyFingerprint(apiKey)}. Respuesta proveedor: ${detail}`,
    );
    return;
  }

  await logNotification(settlement.id, `Correo de gerencia enviado a ${recipients.join(", ")} desde ${from}.`);
}

export async function notifyTopUpRequest(
  settlement: SettlementForMail,
  reviewers: Reviewer[],
  requester?: Reviewer,
  details?: { amountCents?: number; reason?: string },
) {
  const recipients = reviewers
    .map((reviewer) => reviewer.email)
    .filter((email) => email && !email.endsWith("@local"));

  if (!recipients.length) {
    await logNotification(settlement.id, "Notificacion de ampliacion pendiente: no hay correos reales configurados.");
    return;
  }

  const apiKey = getRuntimeValue("RESEND_API_KEY");
  const from = requesterFrom(requester) || getRuntimeValue("MAIL_FROM") || "Legalizaciones USCOM <noreply@uscom.net.co>";
  const baseUrl = getRuntimeValue("APP_BASE_URL") || fallbackBaseUrl;
  const openUrl = normalizeAppUrl(baseUrl);
  const amount = details?.amountCents ? formatMoney(details.amountCents, settlement.currency) : "-";
  const reason = details?.reason || "Fondo por agotarse";

  if (!apiKey) {
    await logNotification(
      settlement.id,
      `Notificacion de ampliacion pendiente para ${recipients.join(", ")}. Falta configurar RESEND_API_KEY en Coolify.`,
    );
    return;
  }

  const subject = `Solicitud de ampliacion de fondos: ${settlement.projectName || settlement.fundCode || settlement.fundType}`;
  const html = `
    <div style="margin:0; padding:24px 12px; background:#f3f7fb; font-family:Arial, Helvetica, sans-serif; color:#111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #dbe5ef; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:#007f68; color:#ffffff; padding:24px 28px; text-align:center;">
            <h1 style="font-size:24px; margin:0;">Solicitud de ampliacion de fondos</h1>
            <p style="font-size:14px; margin:8px 0 0; opacity:.92;">El usuario solicita recursos adicionales para continuar la actividad.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #e2e8f0; margin:0 0 18px;">
              ${detailRow("Solicitante", settlement.employee)}
              ${detailRow("Correo solicitante", requester?.email)}
              ${detailRow("Tipo", settlement.fundType)}
              ${detailRow("Proyecto / objeto", settlement.projectName)}
              ${detailRow("ID solicitud", settlement.fundCode)}
              ${detailRow("Valor adicional", amount, true)}
              ${detailRow("Motivo", reason)}
              ${detailRow("Estado", settlement.status)}
            </table>
            <p style="font-size:14px; line-height:1.5; margin:0 0 18px; color:#4b5d73;">
              Revise la actividad y los soportes cargados antes de aprobar nuevos recursos.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#075eb8" style="border-radius:6px;">
                  <a href="${escapeHtml(openUrl)}" target="_blank" style="display:inline-block; color:#ffffff; font-size:14px; font-weight:800; padding:14px 22px; text-decoration:none;">Abrir solicitud en Legalizaciones</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc; color:#7a8797; font-size:12px; padding:16px 28px; text-align:center;">
            Sistema de Gestion USCOM SAS
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
      `No se pudo enviar correo de ampliacion a ${recipients.join(", ")}. Key usada: ${apiKeyFingerprint(apiKey)}. Respuesta proveedor: ${detail}`,
    );
    return;
  }

  await logNotification(settlement.id, `Correo de ampliacion enviado a ${recipients.join(", ")} desde ${from}.`);
}

export async function notifyLegalizationOverdue(
  settlement: SettlementForMail,
  recipientsInput: Reviewer[],
  details: { day: number; balanceCents: number },
) {
  const recipients = [...new Set(recipientsInput.map((item) => item.email).filter((email) => email && !email.endsWith("@local")))];

  if (!recipients.length) {
    await logNotification(settlement.id, "Recordatorio de legalizacion pendiente: no hay correos reales configurados.");
    return false;
  }

  const apiKey = getRuntimeValue("RESEND_API_KEY");
  const from = getRuntimeValue("MAIL_FROM") || "Legalizaciones USCOM <noreply@uscom.net.co>";
  const baseUrl = getRuntimeValue("APP_BASE_URL") || fallbackBaseUrl;
  const openUrl = normalizeAppUrl(baseUrl);
  const requestId = settlement.fundCode || settlement.id;
  const balanceLabel =
    details.balanceCents > 0
      ? `Valor pendiente por legalizar/devolver: ${formatMoney(details.balanceCents, settlement.currency)}`
      : details.balanceCents < 0
        ? `Saldo a favor reportado: ${formatMoney(Math.abs(details.balanceCents), settlement.currency)}`
        : "La legalizacion no presenta saldo pendiente, pero requiere cierre formal.";

  if (!apiKey) {
    await logNotification(
      settlement.id,
      `Recordatorio de legalizacion pendiente para ${recipients.join(", ")}. Falta configurar RESEND_API_KEY en Coolify.`,
    );
    return false;
  }

  const subject = `Alerta de legalizacion vencida dia ${details.day}: ${requestId}`;
  const html = `
    <div style="margin:0; padding:24px 12px; background:#f3f7fb; font-family:Arial, Helvetica, sans-serif; color:#111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #dbe5ef; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:#b42318; color:#ffffff; padding:24px 28px; text-align:center;">
            <h1 style="font-size:24px; margin:0;">Alerta de legalizacion pendiente</h1>
            <p style="font-size:14px; margin:8px 0 0; opacity:.94;">Dia ${details.day} posterior a la fecha estimada de finalizacion</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px;">
            <p style="font-size:15px; line-height:1.55; margin:0 0 16px;">
              La solicitud <strong>${escapeHtml(requestId)}</strong> se encuentra pendiente de legalizacion despues de la fecha estimada de finalizacion.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #e2e8f0; margin:0 0 18px;">
              ${detailRow("Responsable", settlement.employee)}
              ${detailRow("Tipo", settlement.fundType)}
              ${detailRow("Proyecto / objeto", settlement.projectName)}
              ${detailRow("ID solicitud", requestId)}
              ${detailRow("Fecha estimada final", settlement.periodEnd)}
              ${detailRow("Estado", settlement.status)}
              ${detailRow("Saldo", balanceLabel, true)}
            </table>
            <div style="background:#fff4e5; border:1px solid #ffd7a8; border-radius:8px; color:#7a3b00; font-size:14px; line-height:1.55; margin:0 0 18px; padding:14px 16px;">
              Importante: si la legalizacion no se realiza oportunamente, no se podra realizar el pago de nomina y/o se podran aplicar descuentos por el valor no legalizado.
            </div>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#075eb8" style="border-radius:6px;">
                  <a href="${escapeHtml(openUrl)}" target="_blank" style="display:inline-block; color:#ffffff; font-size:14px; font-weight:800; padding:14px 22px; text-decoration:none;">Abrir legalizacion</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc; color:#7a8797; font-size:12px; padding:16px 28px; text-align:center;">
            Sistema de Gestion USCOM SAS
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
    body: JSON.stringify({ from, to: recipients, subject, html }),
  });

  if (!response.ok) {
    const detail = await response.text();
    await logNotification(
      settlement.id,
      `No se pudo enviar recordatorio de legalizacion a ${recipients.join(", ")}. Key usada: ${apiKeyFingerprint(apiKey)}. Respuesta proveedor: ${detail}`,
    );
    return false;
  }

  await logNotification(settlement.id, `Recordatorio de legalizacion dia ${details.day} enviado a ${recipients.join(", ")}.`);
  return true;
}

export async function notifyPasswordReset(user: Reviewer, token: string) {
  if (!hasDeliverableEmail(user.email)) return false;

  const apiKey = getRuntimeValue("RESEND_API_KEY");
  const from = getRuntimeValue("MAIL_FROM") || "Legalizaciones USCOM <noreply@uscom.net.co>";
  const baseUrl = getRuntimeValue("APP_BASE_URL") || fallbackBaseUrl;
  const resetUrl = `${normalizeAppUrl(baseUrl)}/?reset=${encodeURIComponent(token)}`;

  if (!apiKey) return false;

  const html = `
    <div style="margin:0; padding:24px 12px; background:#f3f7fb; font-family:Arial, Helvetica, sans-serif; color:#111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px; margin:0 auto; background:#ffffff; border:1px solid #dbe5ef; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:#075eb8; color:#ffffff; padding:24px 28px; text-align:center;">
            <h1 style="font-size:24px; margin:0;">Restablecer contraseña</h1>
            <p style="font-size:14px; margin:8px 0 0; opacity:.92;">Sistema de Legalizacion de Gastos USCOM SAS</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px;">
            <p style="font-size:15px; line-height:1.55; margin:0 0 16px;">
              Hola ${escapeHtml(user.name)}, recibimos una solicitud para restablecer el acceso de su usuario.
            </p>
            <p style="font-size:14px; line-height:1.5; margin:0 0 18px; color:#4b5d73;">
              Este enlace vence en 30 minutos. Si usted no solicito este cambio, puede ignorar este correo.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
              <tr>
                <td bgcolor="#075eb8" style="border-radius:6px;">
                  <a href="${escapeHtml(resetUrl)}" target="_blank" style="display:inline-block; color:#ffffff; font-size:14px; font-weight:800; padding:14px 22px; text-decoration:none;">Crear nueva contraseña</a>
                </td>
              </tr>
            </table>
            <p style="font-size:12px; line-height:1.5; margin:0; color:#7a8797;">
              Enlace alterno:<br />
              <a href="${escapeHtml(resetUrl)}" target="_blank" style="color:#075eb8; word-break:break-all;">${escapeHtml(resetUrl)}</a>
            </p>
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
      to: user.email,
      subject: "Restablecer contraseña - Legalizaciones USCOM",
      html,
    }),
  });

  return response.ok;
}

export async function notifyUserWelcome(user: Reviewer, temporaryPassword: string) {
  if (!hasDeliverableEmail(user.email)) return false;

  const apiKey = getRuntimeValue("RESEND_API_KEY");
  const from = getRuntimeValue("MAIL_FROM") || "Legalizaciones USCOM <noreply@uscom.net.co>";
  const baseUrl = getRuntimeValue("APP_BASE_URL") || fallbackBaseUrl;
  const openUrl = normalizeAppUrl(baseUrl);
  const logoUrl = `${openUrl}/uscom-logo.png`;

  if (!apiKey) return false;

  const html = `
    <div style="margin:0; padding:24px 12px; background:#f3f7fb; font-family:Arial, Helvetica, sans-serif; color:#111827;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #dbe5ef; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:#075eb8; color:#ffffff; padding:24px 28px; text-align:center;">
            <div style="background:#ffffff; border-radius:6px; display:inline-block; margin:0 0 14px; padding:8px 14px;">
              <img src="${escapeHtml(logoUrl)}" width="210" alt="USCOM SAS" style="border:0; display:block; height:auto; max-width:210px;" />
            </div>
            <h1 style="font-size:24px; margin:0;">Registro exitoso</h1>
            <p style="font-size:14px; margin:8px 0 0; opacity:.92;">Sistema de Legalizacion de Gastos USCOM SAS</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px;">
            <p style="font-size:15px; line-height:1.55; margin:0 0 16px;">
              Hola ${escapeHtml(user.name)}, su usuario fue registrado con exito en la plataforma de legalizacion de gastos de USCOM SAS.
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #e2e8f0; margin:18px 0;">
              ${detailRow("Usuario", user.email)}
              ${detailRow("Clave temporal", temporaryPassword, true)}
            </table>
            <p style="font-size:14px; line-height:1.5; margin:0 0 18px; color:#4b5d73;">
              Puede ingresar con esta clave temporal y luego cambiarla desde el menu Cuenta, opcion Cambiar contrasena.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
              <tr>
                <td bgcolor="#075eb8" style="border-radius:6px;">
                  <a href="${escapeHtml(openUrl)}" target="_blank" style="display:inline-block; color:#ffffff; font-size:14px; font-weight:800; padding:14px 22px; text-decoration:none;">Ingresar a Legalizaciones</a>
                </td>
              </tr>
            </table>
            <p style="font-size:12px; line-height:1.5; margin:0; color:#7a8797;">
              Enlace alterno:<br />
              <a href="${escapeHtml(openUrl)}" target="_blank" style="color:#075eb8; word-break:break-all;">${escapeHtml(openUrl)}</a>
            </p>
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
      to: user.email,
      subject: "Registro exitoso - Legalizaciones USCOM SAS",
      html,
    }),
  });

  return response.ok;
}
