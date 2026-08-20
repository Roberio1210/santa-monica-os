"use server";

import { redirect } from "next/navigation";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { hashPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";
import { ROLE_HOME_PATH } from "@/lib/auth/permissions";

export interface SetPasswordFormState {
  error: string | null;
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * Define a senha a partir de um token de uso único — nunca exige que a senha passe por mais
 * ninguém além do próprio usuário digitando no navegador. Token é consumido (limpo) mesmo se o
 * usuário só trocar de ideia depois — ele já terá senha definida e pode entrar por /login normalmente.
 */
export async function setPasswordAction(_prevState: SetPasswordFormState, formData: FormData): Promise<SetPasswordFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return { error: "Link inválido." };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  if (password !== confirmPassword) return { error: "As senhas não coincidem." };

  const db = getDb();
  if (!db) return { error: "Banco não configurado." };

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.passwordSetupToken, token), gt(users.passwordSetupTokenExpiresAt, new Date())))
    .limit(1);

  if (!user || !user.active) {
    return { error: "Este link expirou ou já foi usado. Peça um novo link ao administrador." };
  }

  const passwordHash = await hashPassword(password);

  await db
    .update(users)
    .set({
      passwordHash,
      passwordSetupToken: null,
      passwordSetupTokenExpiresAt: null,
      mustChangePassword: false,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  await createSessionCookie({ userId: user.id, role: user.role, name: user.name });
  redirect(ROLE_HOME_PATH[user.role]);
}
