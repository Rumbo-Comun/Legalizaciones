import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { evidences, settlements } from "../../../db/schema";
import { hydrateSettlement } from "../settlements/route";

export async function POST(request: Request) {
  try {
    if (!env.EVIDENCES) {
      return Response.json({ error: "El almacenamiento de evidencias no esta disponible." }, { status: 500 });
    }

    const form = await request.formData();
    const settlementId = String(form.get("settlementId") || "");
    const expenseId = form.get("expenseId") ? String(form.get("expenseId")) : null;
    const file = form.get("file");

    if (!settlementId || !(file instanceof File)) {
      return Response.json({ error: "Falta la legalizacion o el archivo." }, { status: 400 });
    }

    const db = getDb();
    const [settlement] = await db.select().from(settlements).where(eq(settlements.id, settlementId));
    if (!settlement) {
      return Response.json({ error: "Guarda la legalizacion antes de cargar evidencias." }, { status: 404 });
    }

    const id = crypto.randomUUID();
    const key = `${settlementId}/${id}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    await env.EVIDENCES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    await db.insert(evidences).values({
      id,
      settlementId,
      expenseId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      r2Key: key,
    });

    return Response.json({ settlement: await hydrateSettlement(settlementId) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error cargando evidencia" }, { status: 500 });
  }
}
