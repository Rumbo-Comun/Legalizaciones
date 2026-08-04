import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { passwordResetTokens, users } from "../../../../../db/schema";
import { hashValue, randomToken } from "../../../../auth";
import { notifyPasswordReset } from "../../../../notifications";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const email = String(payload.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return Response.json({ error: "Ingresa el correo registrado." }, { status: 400 });
    }

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user && user.active) {
      const token = randomToken();
      await db.insert(passwordResetTokens).values({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: await hashValue(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      await notifyPasswordReset({ id: user.id, name: user.name, email: user.email }, token);
    }

    return Response.json({
      ok: true,
      message: "Si el correo existe, enviaremos un enlace para restablecer el acceso.",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo solicitar el enlace." }, { status: 500 });
  }
}
