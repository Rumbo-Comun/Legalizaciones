import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashValue(value: string, salt = "") {
  const payload = new TextEncoder().encode(`${salt}:${value}`);
  return bytesToHex(await crypto.subtle.digest("SHA-256", payload));
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function makePassword(password: string) {
  const salt = randomToken().slice(0, 16);
  return { salt, hash: await hashValue(password, salt) };
}

export async function ensureDefaultUsers() {
  const db = getDb();
  const defaults = [
    ["ANDRES SALAS", "proyectos@uscom.net.co", "solicitante", "andres123"],
    ["WILLIAM", "defensa@uscom.net.co", "solicitante", "william123"],
    ["FELIPE", "analista@uscom.net.co", "solicitante", "felipe123"],
    ["OTTO URREA", "otto.urrea@uscom.net.co", "revisor", "otto123"],
    ["Administrador", "canales@uscom.net.co", "admin", "admin123"],
  ] as const;

  for (const [name, email, role, password] of defaults) {
    const [existingName] = await db.select().from(users).where(eq(users.name, name));
    if (existingName) {
      const [emailOwner] = await db.select().from(users).where(eq(users.email, email));
      await db
        .update(users)
        .set({ ...(emailOwner && emailOwner.id !== existingName.id ? {} : { email }), role, active: 1 })
        .where(eq(users.id, existingName.id));
      continue;
    }
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      await db.update(users).set({ name, role, active: 1 }).where(eq(users.id, existing.id));
      continue;
    }
    const passwordInfo = await makePassword(password);
    await db.insert(users).values({
      id: crypto.randomUUID(),
      name,
      email,
      role,
      passwordHash: passwordInfo.hash,
      passwordSalt: passwordInfo.salt,
    });
  }
}

export async function getSessionUser(request: Request): Promise<AuthUser | null> {
  await ensureDefaultUsers();
  const token = readCookie(request, "lf_session");
  if (!token) return null;

  const tokenHash = await hashValue(token);
  const db = getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date().toISOString())));
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function requireUser(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return { user: null, response: Response.json({ error: "No autenticado" }, { status: 401 }) };
  }
  return { user, response: null };
}

export function sessionCookie(token: string) {
  return `lf_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 12}`;
}

export function clearSessionCookie() {
  return "lf_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}
