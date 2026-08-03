import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { evidences, expenses, settlements } from "../../../db/schema";

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
  return { ...settlement, expenses: expenseRows, evidences: evidenceRows };
}

function cleanCurrency(value: unknown) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
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

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(settlements)
      .orderBy(desc(settlements.updatedAt), desc(settlements.createdAt));
    const expenseRows = await db.select().from(expenses);
    const evidenceRows = await db.select().from(evidences);

    return Response.json({
      settlements: rows.map((settlement) => ({
        ...settlement,
        expenses: expenseRows.filter((expense) => expense.settlementId === settlement.id),
        evidences: evidenceRows.filter((evidence) => evidence.settlementId === settlement.id),
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error cargando datos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
      depositDate: String(payload.depositDate || ""),
      depositReference: String(payload.depositReference || ""),
      depositSource: String(payload.depositSource || ""),
      periodStart: String(payload.periodStart || ""),
      periodEnd: String(payload.periodEnd || ""),
      status: String(payload.status || "borrador"),
      advanceCents: cleanCurrency(payload.advanceCents),
      cashReturnedCents: cleanCurrency(payload.cashReturnedCents),
      notes: String(payload.notes || ""),
      createdAt: now,
      updatedAt: now,
    });

    const expenseRows = (payload.expenses ?? []).map((expense) => cleanExpense(expense, id));
    if (expenseRows.length) await db.insert(expenses).values(expenseRows);

    return Response.json({ settlement: await hydrateSettlement(id) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error guardando" }, { status: 500 });
  }
}

export { hydrateSettlement, cleanCurrency, cleanExpense };
