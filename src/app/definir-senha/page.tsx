import { and, eq, gt } from "drizzle-orm";
import { KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";

export const dynamic = "force-dynamic";

/**
 * Definição de senha por link de uso único — nunca exige que a senha passe pelo administrador
 * ou por qualquer intermediário; o token só prova "este link chegou a quem deveria", quem digita
 * a senha final é sempre o próprio usuário, direto no navegador.
 */
export default async function DefinirSenhaPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  const db = getDb();
  const validToken = Boolean(token) && db ? await isTokenValid(token!) : false;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <KeyRound className="h-6 w-6 text-foreground-subtle" />
          <CardTitle>Definir senha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!db ? (
            <Unavailable label="Banco de dados não configurado." />
          ) : !validToken ? (
            <Unavailable label="Este link é inválido, expirou ou já foi usado. Peça um novo link ao administrador." />
          ) : (
            <SetPasswordForm token={token!} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function isTokenValid(token: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.passwordSetupToken, token), eq(users.active, true), gt(users.passwordSetupTokenExpiresAt, new Date())))
    .limit(1);
  return Boolean(row);
}
