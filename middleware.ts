import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/jwt";
import { isPathAllowedForRole, ROLE_HOME_PATH } from "@/lib/auth/permissions";

/**
 * Gate de acesso temporário (seção 7 da fundação técnica de 10/07/2026). Desativado por
 * padrão — só entra em ação quando APP_ACCESS_ENABLED=true está definida na Vercel. Nunca
 * contém credenciais no código: usuário/senha vêm exclusivamente de variáveis de ambiente.
 *
 * Caminhos que permanecem públicos mesmo com o gate ativado: /api/health (sem dado nenhum),
 * /api/jumppark/sync e /api/stone/sync (Missão 27 / Missão Financeiro V2 — ambos têm
 * autenticação própria por `CRON_SECRET`, verificada dentro da própria rota; precisam ficar
 * acessíveis sem Basic Auth para o cron diário da Vercel conseguir chamá-los), e
 * /api/whatsapp/webhook (Missão Z6.2 — a Meta precisa alcançar essa rota sem Basic Auth; a
 * autenticação própria é a assinatura `X-Hub-Signature-256`, verificada dentro da rota. Enquanto
 * `WHATSAPP_ENABLED` não estiver `true`, a rota sempre responde 404 antes de processar qualquer
 * coisa — ver `src/lib/integrations/whatsapp/config.ts`).
 */
const PUBLIC_PATHS = ["/api/health", "/api/jumppark/sync", "/api/stone/sync", "/api/whatsapp/webhook"];

/**
 * Missão de Usuários Individuais (V5.3) — camada NOVA, por cima do Basic Auth acima (nunca no
 * lugar dele). Controlada por `INDIVIDUAL_AUTH_ENABLED`, desligada por padrão: enquanto não for
 * ativada explicitamente na Vercel, o comportamento do app é IDÊNTICO ao de antes desta missão
 * (só o Basic Auth compartilhado protege o acesso). Isso existe para permitir implantar todo o
 * código com segurança, criar e validar o primeiro usuário ADMIN, e só então ligar a exigência
 * de sessão individual — nunca o contrário (nunca trancar o acesso sem já existir um ADMIN capaz
 * de entrar).
 *
 * Rotas de autenticação (login/definição de senha) sempre ficam acessíveis, mesmo com a sessão
 * individual ligada — senão ninguém conseguiria logar.
 */
const AUTH_FLOW_PATHS = ["/login", "/definir-senha"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isAuthFlowPath(pathname: string): boolean {
  return AUTH_FLOW_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

async function enforceIndividualSession(request: NextRequest): Promise<NextResponse | null> {
  const individualAuthEnabled = process.env.INDIVIDUAL_AUTH_ENABLED === "true";
  if (!individualAuthEnabled) return null;
  if (isPublicPath(request.nextUrl.pathname) || isAuthFlowPath(request.nextUrl.pathname)) return null;

  const token = request.cookies.get("smos_session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  if (!isPathAllowedForRole(session.role, request.nextUrl.pathname)) {
    // Bloqueado de verdade: nunca renderiza o conteúdo proibido, só redireciona para a home do próprio papel.
    const homeUrl = new URL(ROLE_HOME_PATH[session.role], request.nextUrl);
    return NextResponse.redirect(homeUrl);
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const enabled = process.env.APP_ACCESS_ENABLED === "true";
  if (enabled) {
    if (!isPublicPath(request.nextUrl.pathname)) {
      const username = process.env.APP_ACCESS_USERNAME;
      const password = process.env.APP_ACCESS_PASSWORD;

      // Ativado sem credenciais configuradas: falha fechado (nega acesso) em vez de abrir o app.
      if (!username || !password) {
        return new NextResponse("Acesso temporariamente indisponível (configuração incompleta).", {
          status: 503,
        });
      }

      let authorized = false;
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Basic ")) {
        const encoded = authHeader.slice("Basic ".length);
        try {
          const decoded = atob(encoded);
          const separatorIndex = decoded.indexOf(":");
          const providedUser = decoded.slice(0, separatorIndex);
          const providedPass = decoded.slice(separatorIndex + 1);
          if (providedUser === username && providedPass === password) {
            authorized = true;
          }
        } catch {
          // Header malformado — cai para a resposta 401 abaixo.
        }
      }

      if (!authorized) {
        return new NextResponse("Autenticação necessária.", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="Santa Monica OS"' },
        });
      }
    }
  }

  // Basic Auth passou (ou está desligado) — agora a camada de sessão individual, se ligada.
  const individualAuthResponse = await enforceIndividualSession(request);
  if (individualAuthResponse) return individualAuthResponse;

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
