import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { evidences, settlementAccess, settlements } from "../../../../db/schema";
import { requireUser } from "../../../auth";
import { deleteEvidenceFile, readEvidenceFile } from "../../../storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { user, response } = await requireUser(_request);
  if (response) return response;

  try {
    const { id } = await context.params;
    const db = getDb();
    const [evidence] = await db.select().from(evidences).where(eq(evidences.id, id));
    if (!evidence) {
      return Response.json({ error: "Evidencia no encontrada" }, { status: 404 });
    }
    const [settlement] = await db.select().from(settlements).where(eq(settlements.id, evidence.settlementId));
    const access = await db.select().from(settlementAccess).where(eq(settlementAccess.settlementId, evidence.settlementId));
    const allowed =
      user.role === "admin" || settlement?.ownerId === user.id || access.some((row) => row.userId === user.id);
    if (!allowed) {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const file = await readEvidenceFile(evidence.r2Key).catch(() => null);
    if (!file) {
      return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": evidence.contentType,
        "Content-Disposition": `inline; filename="${evidence.fileName.replaceAll('"', "")}"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error leyendo evidencia" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { user, response } = await requireUser(_request);
  if (response) return response;

  try {
    const { id } = await context.params;
    const db = getDb();
    const [evidence] = await db.select().from(evidences).where(eq(evidences.id, id));
    if (evidence) {
      const [settlement] = await db.select().from(settlements).where(eq(settlements.id, evidence.settlementId));
      if (user.role !== "admin" && settlement?.ownerId !== user.id) {
        return Response.json({ error: "No autorizado" }, { status: 403 });
      }
    }
    if (evidence) {
      await deleteEvidenceFile(evidence.r2Key);
    }
    await db.delete(evidences).where(eq(evidences.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error eliminando evidencia" }, { status: 500 });
  }
}
