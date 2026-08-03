import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { settlementAccess, settlements, users } from "../../../../../db/schema";
import { requireUser } from "../../../../auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  try {
    const { id } = await context.params;
    const payload = await request.json();
    const userId = String(payload.userId || "");
    const db = getDb();
    const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id));
    if (!settlement || (user.role !== "admin" && settlement.ownerId !== user.id)) {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
    if (!targetUser) {
      return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const current = await db.select().from(settlementAccess).where(eq(settlementAccess.settlementId, id));
    if (!current.some((row) => row.userId === userId)) {
      await db.insert(settlementAccess).values({
        id: crypto.randomUUID(),
        settlementId: id,
        userId,
        permission: "revisar",
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error asignando acceso" }, { status: 500 });
  }
}
