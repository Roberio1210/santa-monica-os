import { LogIn } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { isDatabaseConfigured } from "@/db/client";

/**
 * Tela de login preparada, mas desativada por configuração — a autenticação completa (sessão,
 * papéis) depende de banco de dados real e de uma implementação de verificação de senha que
 * ainda não existe (ver docs/database-and-auth-setup-guide.md, seção "Como ativar
 * autenticação"). Enquanto isso, a proteção real do app é o gate temporário do
 * middleware.ts (variáveis APP_ACCESS_*).
 */
export default function LoginPage() {
  const databaseConfigured = isDatabaseConfigured();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <LogIn className="h-6 w-6 text-foreground-subtle" />
          <CardTitle>Santa Monica OS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-center">
          {databaseConfigured ? (
            <Unavailable label="Banco de dados detectado, mas o login com sessão ainda não foi implementado nesta fase." />
          ) : (
            <Unavailable label="Autenticação completa requer banco de dados configurado. Peça ao proprietário para configurar DATABASE_URL." />
          )}
          <p className="text-xs text-foreground-subtle">
            Enquanto isso, o acesso ao aplicativo é controlado pelo modo temporário
            (variáveis <code>APP_ACCESS_*</code> na Vercel) — ver
            docs/database-and-auth-setup-guide.md.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
