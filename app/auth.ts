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
  const existing = await db.select().from(users).limit(1);
  if (existing.length) return;

  const admin = await makePassword("admin123");
  const reviewer = await makePassword("otto123");
  await db.insert(users).values([
    {
      id: crypto.randomUUID(),
      name: "Administrador",
      email: "admin@local",
      role: "admin",
      passwordHash: admin.hash,
      passwordSalt: admin.salt,
    },
    {
      id: crypto.randomUUID(),
      name: "OTTO URREA",
      email: "otto.urrea@local",
      role: "revisor",
      passwordHash: reviewer.hash,
      passwordSalt: reviewer.salt,
    },
  ]);
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
