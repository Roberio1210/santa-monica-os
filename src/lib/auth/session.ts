import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { signSessionToken, verifySessionToken, SESSION_DURATION_SECONDS, type SessionPayload } from "@/lib/auth/jwt";
import type { UserRole } from "@/lib/auth/roles";

/**
 * Sessão individual (Missão de Usuários Individuais V5.3) — JWT assinado guardado num cookie
 * httpOnly (assinatura/verificação em src/lib/auth/jwt.ts, compartilhado com o middleware).
 * Estado (stateless): o payload carrega só `userId`/`role`/`name`, nunca senha/hash, nunca dado
 * financeiro. `getCurrentUser()` sempre confirma `active=true` no banco antes de confiar na
 * sessão — um usuário desativado nunca continua "logado" só porque o cookie ainda é válido.
 */

const COOKIE_NAME = "smos_session";

export type { SessionPayload };
export { verifySessionToken };

export async function createSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Lê e valida a sessão a partir do cookie — só o payload do token, sem tocar no banco. Memoizado por render (React cache). */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
});

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Verificação "segura" (consulta o banco) — sempre usar antes de qualquer leitura/escrita
 * sensível em Server Actions/Route Handlers, nunca confiar só no payload do cookie para isso
 * (o cookie é suficiente apenas para checagem otimista de UI/roteamento).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!row || !row.active) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
});

export { COOKIE_NAME as SESSION_COOKIE_NAME };
