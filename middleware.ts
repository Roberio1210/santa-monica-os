import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Gate de acesso temporário (seção 7 da fundação técnica de 10/07/2026). Desativado por
 * padrão — só entra em ação quando APP_ACCESS_ENABLED=true está definida na Vercel. Nunca
 * contém credenciais no código: usuário/senha vêm exclusivamente de variáveis de ambiente.
 *
 * Isto NÃO é a autenticação definitiva do projeto (papéis, sessão por usuário, etc. — ver
 * src/lib/auth/roles.ts e docs/database-and-auth-setup-guide.md). É uma trava simples de
 * Basic Auth para impedir acesso público enquanto a autenticação completa não está pronta.
 *
 * Único caminho que permanece público mesmo com o gate ativado: /api/health.
 */
const PUBLIC_PATHS = ["/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const enabled = process.env.APP_ACCESS_ENABLED === "true";
  if (!enabled) return NextResponse.next();

  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const username = process.env.APP_ACCESS_USERNAME;
  const password = process.env.APP_ACCESS_PASSWORD;

  // Ativado sem credenciais configuradas: falha fechado (nega acesso) em vez de abrir o app.
  if (!username || !password) {
    return new NextResponse("Acesso temporariamente indisponível (configuração incompleta).", {
      status: 503,
    });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const encoded = authHeader.slice("Basic ".length);
    try {
      const decoded = atob(encoded);
      const separatorIndex = decoded.indexOf(":");
      const providedUser = decoded.slice(0, separatorIndex);
      const providedPass = decoded.slice(separatorIndex + 1);
      if (providedUser === username && providedPass === password) {
        return NextResponse.next();
      }
    } catch {
      // Header malformado — cai para a resposta 401 abaixo.
    }
  }

  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Santa Monica OS"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
