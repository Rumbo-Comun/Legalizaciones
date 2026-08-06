import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { evidences, expenses, settlementAccess, settlements } from "../../../../db/schema";
import { assignReviewers, cleanCurrency, cleanCurrencyCode, cleanExpense, hydrateSettlement, missingRequiredSettlementFields } from "../route";
import { requireUser } from "../../../auth";
import { notifyApprovalRequest, notifyManagementSubmission, notifyTopUpRequest } from "../../../notifications";
import { deleteEvidenceFile } from "../../../storage";

type RouteContext = { params: Promise<{ id: string }> };

function finalBalanceCents(expenseRows: ReturnType<typeof cleanExpense>[], advanceCents: number, cashReturnedCents: number) {
  const spent = expenseRows.reduce((sum, expense) => sum + (expense.amountCents ?? 0), 0);
  const refunded = expenseRows.reduce((sum, expense) => sum + (expense.refundCents ?? 0), 0);
  return advanceCents - spent + refunded - cashReturnedCents;
}

export async function PUT(request: Request, context: RouteContext) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  try {
    const { id } = await context.params;
    const payload = await request.json();
    const db = getDb();
    const [current] = await db.select().from(settlements).where(eq(settlements.id, id));
    const access = await db.select().from(settlementAccess).where(eq(settlementAccess.settlementId, id));
    const canReview = user.role === "revisor" && access.some((row) => row.userId === user.id);
    if (!current || (user.role !== "admin" && current.ownerId !== user.id && !canReview)) {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }
    const nextFundType = String(payload.fundType || "caja menor");
    const nextPeriodStart = String(payload.periodStart || "");
    const nextPeriodEnd = String(payload.periodEnd || "");
    const missingFields = missingRequiredSettlementFields(payload);
    if (missingFields.length) {
      return Response.json({ error: `Campos obligatorios pendientes: ${missingFields.join(", ")}` }, { status: 400 });
    }

    await db
      .update(settlements)
      .set({
        employee: String(payload.employee || "").trim(),
        department: String(payload.department || ""),
        fundCode: current.fundCode,
        fundType: nextFundType,
        projectName: String(payload.projectName || ""),
        depositDate: String(payload.depositDate || ""),
        depositReference: String(payload.depositReference || ""),
        depositSource: String(payload.depositSource || ""),
        periodStart: nextPeriodStart,
        periodEnd: nextPeriodEnd,
        status: String(payload.status || "borrador"),
        currency: cleanCurrencyCode(payload.currency),
        advanceCents: cleanCurrency(payload.advanceCents),
        cashReturnedCents: cleanCurrency(payload.cashReturnedCents),
        notes: String(payload.notes || ""),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(settlements.id, id));
    const nextStatus = String(payload.status || "borrador");
    if (nextStatus.includes("aprobacion")) {
      const reviewerRows = await assignReviewers(id);
      if (current.status !== nextStatus) {
        const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id));
        if (settlement) await notifyApprovalRequest(settlement, reviewerRows, user);
      }
    }
    if (nextStatus === "enviado gerencia" && current.status !== nextStatus) {
      const reviewerRows = await assignReviewers(id);
      const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id));
      const submittedExpenses = (payload.expenses ?? []).map((expense: unknown) =>
        cleanExpense(expense as Parameters<typeof cleanExpense>[0], id),
      );
      if (settlement) {
        await notifyManagementSubmission(settlement, reviewerRows, user, {
          balanceCents: finalBalanceCents(
            submittedExpenses,
            cleanCurrency(payload.advanceCents),
            cleanCurrency(payload.cashReturnedCents),
          ),
        });
      }
    }
    if (nextStatus === "solicitud ampliacion" && (current.status !== nextStatus || payload.topUpAmountCents)) {
      const reviewerRows = await assignReviewers(id);
      const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id));
      if (settlement) {
        await notifyTopUpRequest(settlement, reviewerRows, user, {
          amountCents: cleanCurrency(payload.topUpAmountCents),
          reason: String(payload.topUpReason || ""),
        });
      }
    }

    const currentExpenses = await db.select().from(expenses).where(eq(expenses.settlementId, id));
    const expenseRows = (payload.expenses ?? []).map((expense: unknown) =>
      cleanExpense(expense as Parameters<typeof cleanExpense>[0], id),
    );
    const incomingIds = new Set(expenseRows.map((expense: ReturnType<typeof cleanExpense>) => expense.id));

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
  const { user, response } = await requireUser(_request);
  if (response) return response;

  try {
    const { id } = await context.params;
    const db = getDb();
    const [current] = await db.select().from(settlements).where(eq(settlements.id, id));
    if (!current || user.role !== "admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }
    const evidenceRows = await db.select().from(evidences).where(eq(evidences.settlementId, id));
    await Promise.all(evidenceRows.map((evidence) => deleteEvidenceFile(evidence.r2Key)));
    await db.delete(evidences).where(eq(evidences.settlementId, id));
    await db.delete(expenses).where(eq(expenses.settlementId, id));
    await db.delete(settlements).where(eq(settlements.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error eliminando" }, { status: 500 });
  }
}
