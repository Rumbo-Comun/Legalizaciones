import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { passwordResetTokens, sessions, users } from "../../../../../db/schema";
import { hashValue, randomToken } from "../../../../auth";

async function passwordParts(password: string) {
  const salt = randomToken().slice(0, 16);
  return { salt, hash: await hashValue(password, salt) };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const token = String(payload.token || "").trim();
    const password = String(payload.password || "");

    if (!token || password.length < 8) {
      return Response.json({ error: "El enlace no es valido o la clave es muy corta." }, { status: 400 });
    }

    const db = getDb();
    const tokenHash = await hashValue(token);
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, new Date().toISOString()), isNull(passwordResetTokens.usedAt)));

    if (!resetToken) {
      return Response.json({ error: "El enlace vencio o ya fue utilizado." }, { status: 400 });
    }

    const passwordInfo = await passwordParts(password);
    await db
      .update(users)
      .set({
        passwordHash: passwordInfo.hash,
        passwordSalt: passwordInfo.salt,
      })
      .where(eq(users.id, resetToken.userId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(passwordResetTokens.id, resetToken.id));
    await db.delete(sessions).where(eq(sessions.userId, resetToken.userId));

    return Response.json({ ok: true, message: "Clave actualizada. Ya puedes iniciar sesion." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo restablecer la clave." }, { status: 500 });
  }
}
