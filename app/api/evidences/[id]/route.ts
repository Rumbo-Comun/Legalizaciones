import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { evidences } from "../../../../db/schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const [evidence] = await db.select().from(evidences).where(eq(evidences.id, id));
    if (evidence && env.EVIDENCES) {
      await env.EVIDENCES.delete(evidence.r2Key);
    }
    await db.delete(evidences).where(eq(evidences.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error eliminando evidencia" }, { status: 500 });
  }
}
