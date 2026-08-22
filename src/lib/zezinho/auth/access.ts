import type { UserRole } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import type { ToolId, ToolResult } from "@/lib/zezinho/tools/types";

/**
 * Missão Z1 — RBAC real, server-side e end-to-end no Zézinho. A identidade/role vem EXCLUSIVAMENTE
 * da sessão autenticada (`getCurrentUser()`, já existente em `lib/auth/session.ts`) — nunca de um
 * campo enviado pelo cliente. Sem sessão (estado real de produção hoje, com auth individual ainda
 * dormente), o chamador é tratado como o papel MENOS privilegiado: "autorização vem da sessão,
 * nunca da alegação feita na conversa".
 */
export function resolveZezinhoCallerRole(user: CurrentUser | null): UserRole {
  return user?.role === "admin" ? "admin" : "operacional";
}

/** Nunca revela estrutura de permissão, papel, tabela ou ferramenta — só esta frase natural. */
export const ZEZINHO_RESTRICTION_MESSAGE = "Essa informação é restrita à administração da Santa Mônica.";

/**
 * Ferramentas inteiramente financeiras/estratégicas — bloqueadas por completo para `operacional`
 * (nunca chegam a chamar o service real). `full_period_comparison`, `central_alerts` e
 * `goal_progress` embutem valores monetários em estruturas aninhadas (topServicesA/B com `amount`,
 * texto livre de alerta, meta de faturamento) onde uma redação parcial seria frágil — bloqueio
 * total é a opção simples e defensável dentro do escopo desta missão.
 */
const ADMIN_ONLY_TOOLS = new Set<ToolId>([
  "cash_ledger_totals",
  "dre_result",
  "central_alerts",
  "full_period_comparison",
  "goal_progress",
  "accounts_payable",
  "accounts_receivable",
  "marketing_summary",
  "stone_reconciliation_summary",
  "stone_financial_schedule",
  "stone_jumppark_reconciliation",
  "stone_divergences_summary",
  "stone_integration_health",
  "financial_intelligence",
]);

export function isToolBlockedForRole(id: ToolId, role: UserRole): boolean {
  return role !== "admin" && ADMIN_ONLY_TOOLS.has(id);
}

/**
 * `answerQuestion` (`service.ts`) é um segundo pipeline, mais antigo, que chama services
 * financeiros DIRETAMENTE (nunca passa por `tools/executor.ts`) — por isso precisa do próprio
 * gate, independente do `ADMIN_ONLY_TOOLS` acima. Hoje esse pipeline não é chamado por nenhuma UI
 * viva (só `como_esta_o_dia`, via `generateDailySummary`), mas a missão exige proteger o pipeline
 * inteiro, não só o caminho hoje em uso.
 */
const ADMIN_ONLY_QUESTION_IDS = new Set<string>([
  "faturamento_hoje",
  "entrou_caixa_hoje",
  "saiu_caixa_hoje",
  "contas_semana",
  "contas_vencidas",
  "a_receber",
  "caixa_negativo",
  "estetica_mes",
  "estacionamento_mes",
  "alertas_importantes",
  "sem_classificacao",
  "resultado_mes",
  "estoque_sem_custo",
  "lavacoes_semana",
  "faturamento_mes_operacional",
  "servicos_mais_vendidos_mes",
  "pagamentos_hoje",
  "ticket_medio_semana",
  "comparar_hoje_ontem",
  "comparar_mes_anterior",
]);

export function isQuestionBlockedForRole(questionId: string, role: UserRole): boolean {
  return role !== "admin" && ADMIN_ONLY_QUESTION_IDS.has(questionId);
}

/**
 * Redação por campo para ferramentas que misturam dado operacional (seguro) e financeiro
 * (bloqueado) na mesma resposta — aplicada DEPOIS do service real já ter respondido, nunca antes
 * (a ferramenta continua útil ao operacional, só sem os campos monetários).
 */
export function redactToolResultForRole(result: ToolResult, role: UserRole): ToolResult {
  if (role === "admin") return result;

  switch (result.id) {
    case "jumppark_period_summary":
      return { ...result, metrics: result.metrics.filter((m) => m.unit !== "currency"), topServicesA: [] };
    case "historical_pattern":
      return result.pattern ? { ...result, pattern: { ...result.pattern, typicalRevenue: null, typicalTicket: null } } : result;
    case "inventory_overview":
      return { ...result, summary: { ...result.summary, totalStockValue: null } };
    case "crm_customers":
      return {
        ...result,
        customers: result.customers.map((c) => ({
          ...c,
          profile: { ...c.profile, totalSpent: 0, averageTicket: null },
          lastCourtesy: c.lastCourtesy ? { ...c.lastCourtesy, amount: 0 } : null,
        })),
      };
    default:
      return result;
  }
}
