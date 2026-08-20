import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@/lib/auth/roles";

/**
 * Núcleo de assinatura/verificação do JWT de sessão — deliberadamente sem `server-only`, sem
 * `next/headers`, sem nada de banco/drizzle. Precisa rodar tanto no runtime Node (Server
 * Actions/Server Components, via src/lib/auth/session.ts) quanto no Edge Runtime do middleware
 * (middleware.ts) — qualquer import Node-only aqui quebraria o bundle do middleware. `jose` é
 * compatível com os dois runtimes (mesma razão pela qual a documentação oficial do Next recomenda
 * essa lib para sessão verificável em middleware).
 */

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 dias

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurada — sessão individual não pode operar sem ela.");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  role: UserRole;
  name: string;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.role !== "string" || typeof payload.name !== "string") return null;
    return { userId: payload.userId, role: payload.role as UserRole, name: payload.name };
  } catch {
    return null;
  }
}

export { SESSION_DURATION_SECONDS };
