import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sessions, users } from "../../../../db/schema";
import { hashValue, randomToken, requireUser } from "../../../auth";

async function passwordParts(password: string) {
  const salt = randomToken().slice(0, 16);
  return { salt, hash: await hashValue(password, salt) };
}

export async function POST(request: Request) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  try {
    const payload = await request.json();
    const currentPassword = String(payload.currentPassword || "");
    const newPassword = String(payload.newPassword || "");

    if (newPassword.length < 8) {
      return Response.json({ error: "La nueva clave debe tener minimo 8 caracteres." }, { status: 400 });
    }

    const db = getDb();
    const [storedUser] = await db.select().from(users).where(eq(users.id, user.id));
    if (!storedUser || !storedUser.active) {
      return Response.json({ error: "Usuario no valido." }, { status: 401 });
    }

    const currentHash = await hashValue(currentPassword, storedUser.passwordSalt);
    if (currentHash !== storedUser.passwordHash) {
      return Response.json({ error: "La clave actual no coincide." }, { status: 400 });
    }

    const nextPassword = await passwordParts(newPassword);
    await db
      .update(users)
      .set({
        passwordHash: nextPassword.hash,
        passwordSalt: nextPassword.salt,
      })
      .where(eq(users.id, user.id));
    await db.delete(sessions).where(eq(sessions.userId, user.id));

    return Response.json({ ok: true, message: "Clave actualizada. Inicia sesion nuevamente." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo cambiar la clave." }, { status: 500 });
  }
}
