import { eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getDb } from "../../../../../db";
import { evidences, settlementAccess, settlements } from "../../../../../db/schema";
import { requireUser } from "../../../../auth";
import { readEvidenceFile } from "../../../../storage";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const pdftoppmBinary = process.env.PDFTOPPM_PATH || "pdftoppm";
const pdfinfoBinary = process.env.PDFINFO_PATH || "pdfinfo";

export async function GET(request: Request, context: RouteContext) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  try {
    const { id } = await context.params;
    const db = getDb();
    const [evidence] = await db.select().from(evidences).where(eq(evidences.id, id));
    if (!evidence) {
      return Response.json({ error: "Evidencia no encontrada" }, { status: 404 });
    }
    if (evidence.contentType !== "application/pdf") {
      return Response.json({ error: "La evidencia no es PDF" }, { status: 400 });
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

    const tempDir = await mkdtemp(join(tmpdir(), "legalizacion-pdf-"));
    try {
      const inputPath = join(tempDir, "evidence.pdf");
      const outputPrefix = join(tempDir, "page");
      await writeFile(inputPath, file);
      let sourcePageCount = 0;
      try {
        const { stdout } = await execFileAsync(pdfinfoBinary, [inputPath], { timeout: 10000 });
        sourcePageCount = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
      } catch {
        sourcePageCount = 0;
      }
      await execFileAsync(pdftoppmBinary, ["-png", "-r", "144", "-f", "1", "-l", "8", inputPath, outputPrefix], {
        timeout: 30000,
      });

      const outputFiles = (await readdir(tempDir))
        .filter((name) => name.startsWith("page") && name.endsWith(".png"))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
      const pages = await Promise.all(
        outputFiles.map(async (name, index) => {
          const buffer = await readFile(join(tempDir, name));
          return {
            page: index + 1,
            contentType: "image/png",
            dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
          };
        }),
      );

      return Response.json({ pages, truncated: sourcePageCount ? sourcePageCount > pages.length : pages.length === 8 });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? `No se pudo convertir el PDF adjunto a imagen: ${error.message}`
            : "No se pudo convertir el PDF adjunto a imagen.",
      },
      { status: 422 },
    );
  }
}
