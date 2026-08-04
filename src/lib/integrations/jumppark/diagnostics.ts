import "server-only";
import { isJumpParkConfigured } from "@/lib/config/env";
import { fetchServiceOrders } from "./service";
import { JumpParkNotConfiguredError, JumpParkRequestError } from "./client";
import { SAO_PAULO_TZ, saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Causa técnica classificada — permite à UI mostrar a ação certa (nunca só "falha de conexão"
 * genérica quando a causa real é sabida). `token_rejeitado` cobre HTTP 401/403 — na prática,
 * segundo auditoria real (docs/jumppark-integration-audit-2026-08-04.md), a causa mais comum
 * NÃO é token expirado, é `JUMPPARK_API_ORIGIN` ausente (a JumpPark exige Origin/Referer
 * autorizados desde 10/07/2026 — ver `recommendedAction` abaixo, que já reflete isso).
 */
export type JumpParkDiagnosticsCause = "nao_configurado" | "token_rejeitado" | "endpoint_nao_encontrado" | "erro_http" | "timeout" | "erro_desconhecido" | null;

export interface JumpParkDiagnostics {
  configured: boolean;
  reachable: boolean | null;
  message: string;
  cause: JumpParkDiagnosticsCause;
  /** Ação recomendada em linguagem direta — null quando não há ação (integração respondendo normalmente). */
  recommendedAction: string | null;
  checkedAt: string;
  periodQueried: { from: string; to: string } | null;
  recordCount: number | null;
  timezone: string;
  /** Tempo real da chamada, em ms — null só quando nem configurado (nenhuma chamada foi feita). */
  latencyMs: number | null;
}

/**
 * Diagnóstico seguro e reutilizável da integração JumpPark — usado tanto por
 * `/api/jumppark/status` (botão "Testar conexão") quanto pela renderização inicial de
 * `/configuracoes/status`. Nunca retorna token, userId ou establishmentId.
 */
export async function fetchJumpParkDiagnostics(): Promise<JumpParkDiagnostics> {
  const checkedAt = new Date().toISOString();
  const today = saoPauloDateISO();

  if (!isJumpParkConfigured()) {
    return {
      configured: false,
      reachable: null,
      message: "JumpPark não configurado neste ambiente.",
      cause: "nao_configurado",
      recommendedAction: "Configure JUMPPARK_API_BASE_URL, JUMPPARK_API_TOKEN, JUMPPARK_API_USER_ID e JUMPPARK_ESTABLISHMENT_ID nas variáveis de ambiente da Vercel.",
      checkedAt,
      periodQueried: null,
      recordCount: null,
      timezone: SAO_PAULO_TZ,
      latencyMs: null,
    };
  }

  const start = Date.now();
  try {
    const orders = await fetchServiceOrders(today, today);
    return {
      configured: true,
      reachable: true,
      message: orders.length > 0 ? "Integração respondendo normalmente." : "Integração respondendo — nenhum atendimento encontrado hoje.",
      cause: null,
      recommendedAction: null,
      checkedAt,
      periodQueried: { from: today, to: today },
      recordCount: orders.length,
      timezone: SAO_PAULO_TZ,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    const classified = classifyJumpParkError(error);
    return { configured: true, reachable: false, ...classified, checkedAt, periodQueried: { from: today, to: today }, recordCount: null, timezone: SAO_PAULO_TZ, latencyMs: Date.now() - start };
  }
}

/**
 * Classifica um erro real da integração num par (mensagem honesta, causa, ação recomendada) —
 * compartilhado entre `fetchJumpParkDiagnostics` (botão "Testar conexão") e `central.ts` (alerta
 * da Central de Operações), para as duas telas nunca divergirem na explicação do mesmo problema.
 */
export function classifyJumpParkError(error: unknown): { message: string; cause: JumpParkDiagnosticsCause; recommendedAction: string | null } {
  if (error instanceof JumpParkNotConfiguredError) {
    return {
      message: "JumpPark não configurado neste ambiente.",
      cause: "nao_configurado",
      recommendedAction: "Configure JUMPPARK_API_BASE_URL, JUMPPARK_API_TOKEN, JUMPPARK_API_USER_ID e JUMPPARK_ESTABLISHMENT_ID nas variáveis de ambiente da Vercel.",
    };
  }
  if (error instanceof JumpParkRequestError) {
    if (error.status === 401 || error.status === 403) {
      return {
        message: "As credenciais do JumpPark foram rejeitadas (HTTP 401/403).",
        cause: "token_rejeitado",
        // Achado real em auditoria (ver docs/jumppark-integration-audit-2026-08-04.md): um token/userId/establishmentId
        // corretos ainda tomam 401 quando JUMPPARK_API_ORIGIN está vazia — o painel "API Aberta" da JumpPark exige
        // Origin/Referer autorizados. Verificar isso ANTES de assumir token expirado.
        recommendedAction:
          "Verifique primeiro se JUMPPARK_API_ORIGIN está configurada com a origem autorizada no painel JumpPark (Configurações > API Aberta) — sem ela, credenciais corretas também tomam 401. Se já estiver configurada e o erro persistir, aí sim renove o token em admin.jumppark.com.br > Configurações > API Aberta e atualize JUMPPARK_API_TOKEN (e JUMPPARK_API_USER_ID, se um novo userId for gerado) na Vercel.",
      };
    }
    if (error.status === 404) {
      return {
        message: "O endpoint consultado na API do JumpPark não foi encontrado (HTTP 404) — o caminho pode ter mudado ou o establishmentId está incorreto.",
        cause: "endpoint_nao_encontrado",
        recommendedAction: "Confira se JUMPPARK_ESTABLISHMENT_ID está correto e se o endpoint ainda existe na documentação oficial (docs.jumpparkapi.com.br).",
      };
    }
    return {
      message: `A API do JumpPark respondeu com erro (HTTP ${error.status}).`,
      cause: "erro_http",
      recommendedAction: "Verifique os logs do servidor para o corpo da resposta e tente novamente mais tarde.",
    };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { message: "A API do JumpPark não respondeu a tempo (timeout).", cause: "timeout", recommendedAction: "A API pode estar temporariamente indisponível — tente novamente em alguns minutos." };
  }
  return { message: "Falha ao conectar com a API do JumpPark.", cause: "erro_desconhecido", recommendedAction: "Verifique os logs do servidor para mais detalhes e tente novamente." };
}
