import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { evidences, expenses, reviewComments, settlementAccess, settlements, users } from "../../../db/schema";
import { requireUser } from "../../auth";
import { notifyApprovalRequest } from "../../notifications";

type ExpensePayload = typeof expenses.$inferInsert;
type SettlementPayload = typeof settlements.$inferInsert & {
  expenses?: ExpensePayload[];
};

async function hydrateSettlement(id: string) {
  const db = getDb();
  const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id));
  if (!settlement) return null;

  const expenseRows = await db.select().from(expenses).where(eq(expenses.settlementId, id));
  const evidenceRows = await db.select().from(evidences).where(eq(evidences.settlementId, id));
  const accessRows = await db
    .select({
      id: settlementAccess.id,
      userId: settlementAccess.userId,
      permission: settlementAccess.permission,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(settlementAccess)
    .innerJoin(users, eq(settlementAccess.userId, users.id))
    .where(eq(settlementAccess.settlementId, id));
  const commentRows = await db
    .select({
      id: reviewComments.id,
      settlementId: reviewComments.settlementId,
      userId: reviewComments.userId,
      comment: reviewComments.comment,
      createdAt: reviewComments.createdAt,
      userName: users.name,
    })
    .from(reviewComments)
    .innerJoin(users, eq(reviewComments.userId, users.id))
    .where(eq(reviewComments.settlementId, id));
  return { ...settlement, expenses: expenseRows, evidences: evidenceRows, access: accessRows, comments: commentRows };
}

function cleanCurrency(value: unknown) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
}

function cleanCurrencyCode(value: unknown) {
  return String(value || "COP").toUpperCase() === "USD" ? "USD" : "COP";
}

function cleanExpense(expense: Partial<ExpensePayload>, settlementId: string): ExpensePayload {
  return {
    id: String(expense.id || crypto.randomUUID()),
    settlementId,
    date: String(expense.date || ""),
    category: String(expense.category || ""),
    vendor: String(expense.vendor || ""),
    invoice: String(expense.invoice || ""),
    description: String(expense.description || ""),
    amountCents: cleanCurrency(expense.amountCents),
    taxCents: cleanCurrency(expense.taxCents),
    paymentMethod: String(expense.paymentMethod || "Efectivo"),
  };
}

async function assignReviewers(settlementId: string) {
  const db = getDb();
  const reviewerRows = await db.select().from(users).where(eq(users.role, "revisor"));
  const current = await db.select().from(settlementAccess).where(eq(settlementAccess.settlementId, settlementId));
  const currentIds = new Set(current.map((row) => row.userId));
  for (const reviewer of reviewerRows) {
    if (currentIds.has(reviewer.id)) continue;
    await db.insert(settlementAccess).values({
      id: crypto.randomUUID(),
      settlementId,
      userId: reviewer.id,
      permission: "aprobar",
    });
  }
  return reviewerRows.map((reviewer) => ({
    id: reviewer.id,
    name: reviewer.name,
    email: reviewer.email,
  }));
}

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  try {
    const db = getDb();
    let rows = await db.select().from(settlements).orderBy(desc(settlements.updatedAt), desc(settlements.createdAt));
    if (user.role !== "admin") {
      const allowed = await db.select().from(settlementAccess).where(eq(settlementAccess.userId, user.id));
      const settlementIds = allowed.map((row) => row.settlementId);
      rows = rows.filter((row) => row.ownerId === user.id || settlementIds.includes(row.id));
    }
    const expenseRows = await db.select().from(expenses);
    const evidenceRows = await db.select().from(evidences);
    const accessRows = await db
      .select({
        id: settlementAccess.id,
        settlementId: settlementAccess.settlementId,
        userId: settlementAccess.userId,
        permission: settlementAccess.permission,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(settlementAccess)
      .innerJoin(users, eq(settlementAccess.userId, users.id));
    const commentRows = await db
      .select({
        id: reviewComments.id,
        settlementId: reviewComments.settlementId,
        userId: reviewComments.userId,
        comment: reviewComments.comment,
        createdAt: reviewComments.createdAt,
        userName: users.name,
      })
      .from(reviewComments)
      .innerJoin(users, eq(reviewComments.userId, users.id));

    return Response.json({
      settlements: rows.map((settlement) => ({
        ...settlement,
        expenses: expenseRows.filter((expense) => expense.settlementId === settlement.id),
        evidences: evidenceRows.filter((evidence) => evidence.settlementId === settlement.id),
        access: accessRows.filter((access) => access.settlementId === settlement.id),
        comments: commentRows.filter((comment) => comment.settlementId === settlement.id),
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error cargando datos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  try {
    const payload = (await request.json()) as SettlementPayload;
    const id = String(payload.id || crypto.randomUUID());
    const now = new Date().toISOString();
    const db = getDb();

    await db.insert(settlements).values({
      id,
      employee: String(payload.employee || "").trim(),
      department: String(payload.department || ""),
      fundCode: String(payload.fundCode || ""),
      fundType: String(payload.fundType || "caja menor"),
      projectName: String(payload.projectName || ""),
      depositDate: String(payload.depositDate || ""),
      depositReference: String(payload.depositReference || ""),
      depositSource: String(payload.depositSource || ""),
      periodStart: String(payload.periodStart || ""),
      periodEnd: String(payload.periodEnd || ""),
      status: String(payload.status || "borrador"),
      ownerId: user.id,
      currency: cleanCurrencyCode(payload.currency),
      advanceCents: cleanCurrency(payload.advanceCents),
      cashReturnedCents: cleanCurrency(payload.cashReturnedCents),
      notes: String(payload.notes || ""),
      createdAt: now,
      updatedAt: now,
    });

    const expenseRows = (payload.expenses ?? []).map((expense) => cleanExpense(expense, id));
    if (expenseRows.length) await db.insert(expenses).values(expenseRows);
    if (String(payload.status || "").includes("aprobacion")) {
      const reviewerRows = await assignReviewers(id);
      const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id));
      if (settlement) await notifyApprovalRequest(settlement, reviewerRows, user);
    }

    return Response.json({ settlement: await hydrateSettlement(id) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error guardando" }, { status: 500 });
  }
}

export { hydrateSettlement, cleanCurrency, cleanCurrencyCode, cleanExpense, assignReviewers };
