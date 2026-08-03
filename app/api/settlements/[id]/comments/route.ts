import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { reviewComments, settlementAccess, settlements } from "../../../../../db/schema";
import { requireUser } from "../../../../auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  try {
    const { id } = await context.params;
    const payload = await request.json();
    const comment = String(payload.comment || "").trim();
    if (!comment) {
      return Response.json({ error: "La observacion no puede estar vacia" }, { status: 400 });
    }

    const db = getDb();
    const [settlement] = await db.select().from(settlements).where(eq(settlements.id, id));
    const access = await db.select().from(settlementAccess).where(eq(settlementAccess.settlementId, id));
    const allowed =
      user.role === "admin" || settlement?.ownerId === user.id || access.some((row) => row.userId === user.id);
    if (!settlement || !allowed) {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    await db.insert(reviewComments).values({
      id: crypto.randomUUID(),
      settlementId: id,
      userId: user.id,
      comment,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error guardando observacion" }, { status: 500 });
  }
}
