import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sessions, users } from "../../../../db/schema";
import { ensureDefaultUsers, hashValue, randomToken, sessionCookie } from "../../../auth";

export async function POST(request: Request) {
  try {
    await ensureDefaultUsers();
    const payload = await request.json();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user || !user.active) {
      return Response.json({ error: "Usuario o clave incorrecta" }, { status: 401 });
    }

    const passwordHash = await hashValue(password, user.passwordSalt);
    if (passwordHash !== user.passwordHash) {
      return Response.json({ error: "Usuario o clave incorrecta" }, { status: 401 });
    }

    const token = randomToken();
    const tokenHash = await hashValue(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    await db.insert(sessions).values({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return Response.json(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
      { headers: { "Set-Cookie": sessionCookie(token) } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error iniciando sesion" }, { status: 500 });
  }
}
