"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionCookie, destroySessionCookie } from "@/lib/auth/session";
import { ROLE_HOME_PATH } from "@/lib/auth/permissions";

export interface LoginFormState {
  error: string | null;
}

/**
 * Nunca revela se o e-mail existe ou não (mesma mensagem genérica para "não encontrado" e
 * "senha errada") — evita enumeração de contas. Nunca loga a senha recebida.
 */
export async function loginAction(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Informe e-mail e senha." };

  const db = getDb();
  if (!db) return { error: "Banco não configurado." };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || !user.active || !user.passwordHash) {
    return { error: "E-mail ou senha inválidos." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { error: "E-mail ou senha inválidos." };

  await createSessionCookie({ userId: user.id, role: user.role, name: user.name });
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));

  if (user.mustChangePassword) {
    redirect("/definir-senha?motivo=troca_obrigatoria");
  }

  redirect(ROLE_HOME_PATH[user.role]);
}

export async function logoutAction(): Promise<void> {
  await destroySessionCookie();
  redirect("/login");
}
