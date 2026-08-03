import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { evidences, expenses, settlements } from "../../../../db/schema";
import { cleanCurrency, cleanExpense, hydrateSettlement } from "../route";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const payload = await request.json();
    const db = getDb();

    await db
      .update(settlements)
      .set({
        employee: String(payload.employee || "").trim(),
        department: String(payload.department || ""),
        fundCode: String(payload.fundCode || ""),
        periodStart: String(payload.periodStart || ""),
        periodEnd: String(payload.periodEnd || ""),
        status: String(payload.status || "borrador"),
        advanceCents: cleanCurrency(payload.advanceCents),
        cashReturnedCents: cleanCurrency(payload.cashReturnedCents),
        notes: String(payload.notes || ""),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(settlements.id, id));

    const currentExpenses = await db.select().from(expenses).where(eq(expenses.settlementId, id));
    const expenseRows = (payload.expenses ?? []).map((expense: unknown) =>
      cleanExpense(expense as Parameters<typeof cleanExpense>[0], id),
    );
    const incomingIds = new Set(expenseRows.map((expense) => expense.id));

    for (const expense of currentExpenses) {
      if (!incomingIds.has(expense.id)) {
        await db.delete(expenses).where(eq(expenses.id, expense.id));
      }
    }

    for (const expense of expenseRows) {
      const [existing] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
      if (existing) {
        await db.update(expenses).set(expense).where(eq(expenses.id, expense.id));
      } else {
        await db.insert(expenses).values(expense);
      }
    }

    return Response.json({ settlement: await hydrateSettlement(id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error actualizando" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const evidenceRows = await db.select().from(evidences).where(eq(evidences.settlementId, id));
    if (env.EVIDENCES) {
      await Promise.all(evidenceRows.map((evidence) => env.EVIDENCES.delete(evidence.r2Key)));
    }
    await db.delete(evidences).where(eq(evidences.settlementId, id));
    await db.delete(expenses).where(eq(expenses.settlementId, id));
    await db.delete(settlements).where(eq(settlements.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error eliminando" }, { status: 500 });
  }
}
