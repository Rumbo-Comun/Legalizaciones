import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { expenses, reviewComments, settlementAccess, settlements, users } from "../../../../db/schema";
import { notifyLegalizationOverdue } from "../../../notifications";

const closedStatuses = new Set(["enviado gerencia", "aprobado"]);

function isProjectOrTravel(fundType: string) {
  const normalized = fundType.toLowerCase();
  return normalized.includes("viatico") || normalized.includes("proyecto");
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function dayDifference(fromDate: string, toDate = new Date()) {
  const from = parseDateOnly(fromDate);
  if (!from) return null;
  const to = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate());
  return Math.floor((to - from) / 86_400_000);
}

function reminderMarker(day: number) {
  return `[REMINDER_LEGALIZATION_D${day}]`;
}

function balanceCents(expenseRows: Array<typeof expenses.$inferSelect>, advanceCents: number, cashReturnedCents: number) {
  const spent = expenseRows.reduce((sum, expense) => sum + expense.amountCents, 0);
  const refunded = expenseRows.reduce((sum, expense) => sum + expense.refundCents, 0);
  return advanceCents - spent + refunded - cashReturnedCents;
}

async function runReminders(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (configuredSecret) {
    const provided = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
    if (provided !== configuredSecret) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  const db = getDb();
  const settlementRows = await db.select().from(settlements);
  const expenseRows = await db.select().from(expenses);
  const commentRows = await db.select().from(reviewComments);
  const accessRows = await db.select().from(settlementAccess);
  const userRows = await db.select().from(users);
  const sent: Array<{ id: string; day: number; to: number }> = [];

  for (const settlement of settlementRows) {
    if (!isProjectOrTravel(settlement.fundType)) continue;
    if (closedStatuses.has(settlement.status)) continue;
    const overdueDays = dayDifference(settlement.periodEnd);
    if (!overdueDays || overdueDays < 1 || overdueDays > 3) continue;
    const marker = reminderMarker(overdueDays);
    const alreadySent = commentRows.some((comment) => comment.settlementId === settlement.id && comment.comment.includes(marker));
    if (alreadySent) continue;

    const settlementExpenses = expenseRows.filter((expense) => expense.settlementId === settlement.id);
    const reviewers = accessRows
      .filter((access) => access.settlementId === settlement.id)
      .map((access) => userRows.find((user) => user.id === access.userId))
      .filter((user): user is typeof users.$inferSelect => Boolean(user))
      .map((user) => ({ id: user.id, name: user.name, email: user.email }));
    const owner = userRows.find((user) => user.id === settlement.ownerId);
    const recipients = [
      ...(owner ? [{ id: owner.id, name: owner.name, email: owner.email }] : []),
      ...reviewers,
    ];

    const delivered = await notifyLegalizationOverdue(settlement, recipients, {
      day: overdueDays,
      balanceCents: balanceCents(settlementExpenses, settlement.advanceCents, settlement.cashReturnedCents),
    });

    if (delivered) {
      const admin = userRows.find((user) => user.role === "admin") ?? owner;
      if (admin) {
        await db.insert(reviewComments).values({
          id: crypto.randomUUID(),
          settlementId: settlement.id,
          userId: admin.id,
          comment: `[LOG] ${marker} Recordatorio automatico de legalizacion enviado.`,
        });
      }
      sent.push({ id: settlement.id, day: overdueDays, to: recipients.length });
    }
  }

  return Response.json({ ok: true, sent, count: sent.length });
}

export async function GET(request: Request) {
  return runReminders(request);
}

export async function POST(request: Request) {
  return runReminders(request);
}
