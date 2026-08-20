import { LogIn } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { isDatabaseConfigured } from "@/db/client";
import { LoginForm } from "@/components/auth/login-form";

/**
 * Login individual (Missão de Usuários Individuais V5.3) — sessão por cookie assinado (ver
 * src/lib/auth/session.ts), papel ADMIN/OPERACIONAL. Enquanto `INDIVIDUAL_AUTH_ENABLED` não
 * estiver ativo, esta tela existe e funciona (quem tiver usuário/senha consegue logar), mas o
 * middleware ainda não EXIGE sessão para navegar — só o gate temporário (APP_ACCESS_*) protege
 * o acesso externo, exatamente como antes desta missão. Ver middleware.ts.
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
        <CardContent className="space-y-3">
          {databaseConfigured ? (
            <LoginForm />
          ) : (
            <Unavailable label="Autenticação requer banco de dados configurado. Peça ao proprietário para configurar DATABASE_URL." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
