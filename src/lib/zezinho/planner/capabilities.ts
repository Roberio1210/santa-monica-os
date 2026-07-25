import type { ManagerialIntent } from "@/lib/zezinho/intent/managerial";
import type { ZezinhoTopic } from "@/lib/zezinho/intent/types";
import type { ToolId } from "@/lib/zezinho/tools/types";

/**
 * Capacidades do contexto operacional (Sprint 4.0, Z3, seção 3-4) — nomes de negócio estáveis
 * que o `OperationalContextBuilder` (`contextBuilder.ts`) sabe montar. Cada capacidade é servida
 * por exatamente uma ferramenta real do catálogo (`tools/registry.ts`); duas capacidades podem
 * apontar para a MESMA ferramenta (ex.: `staffing_capacity` reaproveita `jumppark_period_summary`
 * como proxy, `crm_summary` reaproveita `crm_customers`) — o builder deduplica por `ToolId`, nunca
 * chama a mesma fonte duas vezes na mesma execução (seção 5).
 */
export type Capability =
  | "situational_context"
  | "jumppark_period_summary"
  | "historical_pattern"
  | "goal_progress"
  | "weather_forecast"
  | "cash_ledger_totals"
  | "accounts_payable"
  | "accounts_receivable"
  | "central_alerts"
  | "crm_summary"
  | "unanswered_clients"
  | "inventory_status"
  | "agenda_summary"
  | "staffing_capacity"
  | "marketing_summary"
  | "dre_result"
  | "jumppark_wash_packages"
  | "stone_reconciliation_summary"
  | "stone_financial_schedule"
  | "stone_jumppark_reconciliation"
  | "stone_divergences_summary"
  | "stone_integration_health";

export const CAPABILITY_TOOL: Record<Capability, ToolId> = {
  situational_context: "situational_context",
  jumppark_period_summary: "jumppark_period_summary",
  historical_pattern: "historical_pattern",
  goal_progress: "goal_progress",
  weather_forecast: "weather_forecast",
  cash_ledger_totals: "cash_ledger_totals",
  accounts_payable: "accounts_payable",
  accounts_receivable: "accounts_receivable",
  central_alerts: "central_alerts",
  crm_summary: "crm_customers",
  unanswered_clients: "unanswered_clients",
  inventory_status: "inventory_overview",
  agenda_summary: "agenda_summary",
  staffing_capacity: "jumppark_period_summary",
  marketing_summary: "marketing_summary",
  // Adicionadas na Sprint 5.0 (Z1) — os Diretores Financeiro e de Operações
  // (`directors/registry.ts`) precisavam de DRE e distribuição Bronze/Silver/Gold, que existiam
  // como ferramentas reais desde a Sprint 2.0/3.0 mas nunca tinham entrado no modelo de
  // capacidades da Z3 (só `full_period_comparison` continua fora, por natureza — só faz sentido
  // com dois períodos explícitos, nunca uma observação contínua de um Diretor).
  dre_result: "dre_result",
  jumppark_wash_packages: "jumppark_wash_packages",
  // Sprint 7.0 (Z2/Z3) — capacidades financeiras baseadas na Stone, exclusivas do Diretor
  // Financeiro (directors/registry.ts). A partir do Z4 (decisão do usuário, seção 11), as três
  // primeiras entram seletivamente em INTENT_CAPABILITIES para financial_status/cash_position —
  // nunca em intenções sem relação financeira (estoque, clientes, clima, agenda, RH, marketing).
  stone_reconciliation_summary: "stone_reconciliation_summary",
  stone_financial_schedule: "stone_financial_schedule",
  stone_jumppark_reconciliation: "stone_jumppark_reconciliation",
  stone_divergences_summary: "stone_divergences_summary",
  // stone_integration_health nunca aparece em INTENT_CAPABILITIES — é um dado operacional da
  // integração (Configurações + Diretor Financeiro), não uma pergunta que o chat responde.
  stone_integration_health: "stone_integration_health",
};

/** Linha "status_check / business_health" do exemplo do checkpoint — a única lista genuinamente ampla. */
const BUSINESS_HEALTH_CAPABILITIES: Capability[] = ["situational_context", "jumppark_period_summary", "historical_pattern", "goal_progress", "weather_forecast", "central_alerts", "cash_ledger_totals", "agenda_summary"];

/**
 * Matriz intenção -> capacidades (Sprint 4.0, Z3, seção 4) — versionada em código, testável.
 * `recommendation` não aparece aqui: seu conjunto depende do domínio da recomendação, resolvido
 * por `capabilitiesForRecommendation` abaixo (seção 4: "primeiro identificar o domínio... depois
 * selecionar as fontes"). Intenções puramente conversacionais (`greeting`, `small_talk`,
 * `farewell`, `clarification`, `general_knowledge`) também não entram — não precisam de nenhuma
 * ferramenta.
 */
export const INTENT_CAPABILITIES: Partial<Record<ManagerialIntent, Capability[]>> = {
  status_check: BUSINESS_HEALTH_CAPABILITIES,
  business_health: BUSINESS_HEALTH_CAPABILITIES,
  risk_analysis: BUSINESS_HEALTH_CAPABILITIES,
  opportunity_analysis: BUSINESS_HEALTH_CAPABILITIES,
  operational_movement: ["situational_context", "jumppark_period_summary", "historical_pattern", "weather_forecast", "staffing_capacity"],
  historical_performance: ["historical_pattern", "jumppark_period_summary"],
  // Correção Z4: "faturamento" é a receita operacional (JumpPark), não só o saldo de caixa —
  // sem `jumppark_period_summary` aqui, "Quanto faturamos hoje?" nunca tinha um número real de
  // faturamento para responder (só caixa/contas). `cash_ledger_totals`/AP/AR continuam, porque a
  // pergunta também pode ser sobre resultado financeiro amplo, não só a receita operacional.
  // Sprint 7.0, Z4 (decisão do usuário, seção 11): perguntas financeiras passam a consultar a
  // Stone seletivamente — nunca clima/CRM/estoque, e nunca quando a integração não está
  // configurada (a ferramenta devolve `not_configured` honesto, sem derrubar a resposta).
  financial_status: ["jumppark_period_summary", "cash_ledger_totals", "accounts_receivable", "accounts_payable", "stone_reconciliation_summary", "stone_financial_schedule", "stone_jumppark_reconciliation", "stone_divergences_summary"],
  cash_position: ["cash_ledger_totals", "stone_reconciliation_summary", "stone_financial_schedule"],
  goal_progress: ["goal_progress", "jumppark_period_summary"],
  weather_impact: ["weather_forecast", "historical_pattern"],
  client_retention: ["crm_summary"],
  unanswered_clients: ["unanswered_clients"],
  inventory_status: ["inventory_status"],
  staffing_capacity: ["staffing_capacity", "jumppark_period_summary", "historical_pattern"],
  marketing_performance: ["marketing_summary"],
  outlook: ["historical_pattern", "weather_forecast", "goal_progress", "agenda_summary", "staffing_capacity"],
};

/**
 * Capacidades para `recommendation` — depende do domínio (`entities.topic`, já extraído por
 * `intent/entities.ts`, reaproveitado aqui em vez de duplicar detecção de tópico). Sem tópico
 * reconhecido, usa o mesmo conjunto amplo de `business_health` — nunca uma recomendação genérica
 * sem nenhuma fonte (seção 4: "nunca responder com recomendação genérica sem evidências").
 */
export function capabilitiesForRecommendation(topic: ZezinhoTopic | null): Capability[] {
  switch (topic) {
    case "preco":
    case "mix":
      return ["jumppark_period_summary", "historical_pattern"];
    case "equipe":
      return ["staffing_capacity", "jumppark_period_summary", "historical_pattern"];
    case "clientes":
      return ["crm_summary", "unanswered_clients"];
    case "estoque":
      return ["inventory_status"];
    case "caixa":
      return ["cash_ledger_totals", "accounts_payable", "accounts_receivable"];
    case "marketing":
      return ["marketing_summary"];
    case "agenda":
      return ["agenda_summary"];
    default:
      return BUSINESS_HEALTH_CAPABILITIES;
  }
}

/** Resolve a lista de capacidades para uma intenção de negócio — usa o domínio só quando a intenção é `recommendation`. */
export function capabilitiesForIntent(intent: ManagerialIntent, topic: ZezinhoTopic | null): Capability[] {
  if (intent === "recommendation") return capabilitiesForRecommendation(topic);
  return INTENT_CAPABILITIES[intent] ?? [];
}
