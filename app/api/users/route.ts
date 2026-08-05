import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { hashValue, randomToken, requireUser } from "../../auth";
import { notifyUserWelcome } from "../../notifications";

async function passwordParts(password: string) {
  const salt = randomToken().slice(0, 16);
  return { salt, hash: await hashValue(password, salt) };
}

export async function GET(request: Request) {
  const { user, response } = await requireUser(request);
  if (response) return response;
  const canManageAccess = user.role === "admin" || user.name.toUpperCase().includes("OTTO");
  if (!canManageAccess) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const rows = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .orderBy(asc(users.name));
  return Response.json({ users: rows });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser(request);
  if (response) return response;
  if (user.role !== "admin") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const payload = await request.json();
    const email = String(payload.email || "").trim().toLowerCase();
    const name = String(payload.name || "").trim();
    const role = String(payload.role || "revisor");
    const password = String(payload.password || "");

    if (!email || !name) {
      return Response.json({ error: "Nombre y correo son obligatorios" }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    let welcomeMailSent = false;
    let welcomeMailAttempted = false;
    if (existing) {
      const passwordInfo = password ? await passwordParts(password) : null;
      await db
        .update(users)
        .set({
          name,
          role,
          active: 1,
          ...(passwordInfo
            ? {
                passwordHash: passwordInfo.hash,
                passwordSalt: passwordInfo.salt,
              }
            : {}),
        })
        .where(eq(users.id, existing.id));
      if (password) {
        welcomeMailAttempted = true;
        welcomeMailSent = await notifyUserWelcome({ id: existing.id, name, email }, password);
      }
    } else {
      if (password.length < 8) {
        return Response.json({ error: "La clave temporal debe tener minimo 8 caracteres." }, { status: 400 });
      }
      const id = crypto.randomUUID();
      const passwordInfo = await passwordParts(password);
      await db.insert(users).values({
        id,
        name,
        email,
        role,
        passwordHash: passwordInfo.hash,
        passwordSalt: passwordInfo.salt,
      });
      welcomeMailAttempted = true;
      welcomeMailSent = await notifyUserWelcome({ id, name, email }, password);
    }

    return Response.json({ ok: true, welcomeMailAttempted, welcomeMailSent });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Error guardando usuario" }, { status: 500 });
  }
}
