import type { PeriodRange } from "@/lib/utils/timezone";
import type { ComparisonMetric, ComparisonReport, PackageCounts, PeakHour } from "@/lib/zezinho/comparison-engine";
import type { BusinessObjective } from "@/lib/zezinho/objective/types";
import type { CrmCustomer } from "@/lib/crm/types";
import type { InventorySummary } from "@/lib/inventory/service";
import type { ConsolidatedAlert } from "@/lib/operations/central";
import type { WeatherForecastResult } from "@/lib/integrations/weather/types";
import type { GoalArea, GoalProgress } from "@/lib/goals/types";
import type { HistoricalPatternResult } from "@/lib/integrations/jumppark/historical-pattern";
import type { SituationalContext } from "@/lib/zezinho/situational/types";
import type { AccountsPayableSummary, AccountsReceivableDashboard } from "@/lib/finance/service";
import type { StoneReconciliationSummary } from "@/lib/integrations/stone/reconciliationSummary";
import type { FinancialScheduleResult } from "@/lib/integrations/stone/financialScheduleService";
import type { JumpparkReconciliationResult } from "@/lib/integrations/stone/jumpparkReconciliationService";
import type { StoneDivergencesSummary } from "@/lib/integrations/stone/divergencesSummary";
import type { StoneIntegrationHealthReport } from "@/lib/integrations/stone/healthStatus";
import type { FinancialDirectorReport } from "@/lib/finance/intelligence/types";

/**
 * Catálogo de ferramentas (Etapa 3 — ver docs/zezinho-3.0-architecture.md, seção 6). Cada
 * ferramenta é um envoltório fino sobre um service já existente — nenhuma lógica de busca nova é
 * criada aqui, só metadata (o que retorna, de qual fonte, para quais objetivos serve) e um
 * dispatcher (`executor.ts`) que chama a função real.
 */
export type ToolId =
  | "jumppark_period_summary"
  | "jumppark_wash_packages"
  | "cash_ledger_totals"
  | "dre_result"
  | "crm_customers"
  | "inventory_overview"
  | "central_alerts"
  | "full_period_comparison"
  | "weather_forecast"
  | "goal_progress"
  | "historical_pattern"
  | "situational_context"
  | "accounts_payable"
  | "accounts_receivable"
  | "unanswered_clients"
  | "agenda_summary"
  | "marketing_summary"
  | "stone_reconciliation_summary"
  | "stone_financial_schedule"
  | "stone_jumppark_reconciliation"
  | "stone_divergences_summary"
  | "stone_integration_health"
  | "financial_intelligence";

export type ToolCostHint = "low" | "medium" | "high";
export type ToolRelevance = "high" | "medium" | "low";
export type ToolLatencyHint = "instant" | "fast" | "medium" | "slow";
/** Quão "fresco" o dado precisa ser para a ferramenta valer a pena — `realtime` nunca é servido de cache antigo, `any` tolera dado de minutos/horas atrás (ex.: clima). */
export type ToolFreshnessRequirement = "realtime" | "recent" | "any";

export interface ToolDefinition {
  id: ToolId;
  label: string;
  /** Rótulo de fonte no mesmo padrão já usado em `response-builder.ts` ("JumpPark", "Neon — fluxo de caixa", etc.). */
  source: string;
  /** Serviço real reaproveitado — só para documentação/rastreabilidade, não é chamado a partir daqui. */
  reuses: string;
  objectives: BusinessObjective[];
  requiresPeriod: boolean;
  costHint: ToolCostHint;
  /** Metadados de seletividade (Sprint 4.0, Z3, seção 5) — orientam o planner sobre quando vale a pena chamar esta ferramenta. */
  relevance: ToolRelevance;
  latencyHint: ToolLatencyHint;
  freshnessRequirement: ToolFreshnessRequirement;
  /** `true` quando a ausência desta ferramenta nunca deve travar a resposta — a resposta segue sem ela. */
  optional: boolean;
  /** `true` quando, se esta ferramenta falhar, o planner pode responder mesmo assim usando as demais. */
  fallbackAllowed: boolean;
}

export interface ToolCall {
  id: ToolId;
  periodA: PeriodRange | null;
  periodB: PeriodRange | null;
  filterKind: "lavacao" | "estacionamento" | null;
  /** Só usado por `goal_progress` — área da meta a consultar; `null` = "consolidado". */
  goalArea?: GoalArea | null;
}

/**
 * Diferencia claramente as razões pelas quais um resultado pode não trazer "ok" — o planner e o
 * narrador nunca devem tratar "zero real" (`ok` com valores em zero), "dado ausente" (`no_data`),
 * "integração não configurada" (`not_configured`), "falha temporária" (`temporary_failure`),
 * "dado desatualizado" (`stale_data`) e "permissão insuficiente" (`insufficient_permission`) como
 * a mesma coisa.
 */
export type ToolResultStatus = "ok" | "not_configured" | "temporary_failure" | "stale_data" | "insufficient_permission" | "no_data";

/** Campos de rastreabilidade comuns a todo resultado de ferramenta — ver `executor.ts#meta()`. */
export interface ToolMeta {
  status: ToolResultStatus;
  /** ISO — quando este resultado foi obtido (não quando a resposta final foi montada). */
  collectedAt: string;
  limitations: string[];
}

interface ToolResultBase extends ToolMeta {
  source: string;
  error: string | null;
}

export type ToolResult =
  | (ToolResultBase & { id: "jumppark_period_summary"; jumpparkConfigured: boolean; metrics: ComparisonMetric[]; peakHourA: PeakHour | null; peakHourB: PeakHour | null; topServicesA: { description: string; amount: number }[] })
  | (ToolResultBase & { id: "jumppark_wash_packages"; jumpparkConfigured: boolean; packageCountsA: PackageCounts; packageCountsB: PackageCounts })
  | (ToolResultBase & { id: "cash_ledger_totals"; metrics: ComparisonMetric[] })
  | (ToolResultBase & { id: "dre_result"; metrics: ComparisonMetric[] })
  | (ToolResultBase & { id: "crm_customers"; jumpparkConfigured: boolean; customers: CrmCustomer[] })
  | (ToolResultBase & { id: "inventory_overview"; summary: InventorySummary })
  | (ToolResultBase & { id: "central_alerts"; alerts: ConsolidatedAlert[] })
  | (ToolResultBase & { id: "full_period_comparison"; report: ComparisonReport })
  | (ToolResultBase & { id: "weather_forecast"; forecast: WeatherForecastResult })
  | (ToolResultBase & { id: "goal_progress"; progress: GoalProgress | null })
  | (ToolResultBase & { id: "historical_pattern"; pattern: HistoricalPatternResult | null })
  | (ToolResultBase & { id: "situational_context"; context: SituationalContext })
  | (ToolResultBase & { id: "accounts_payable"; summary: AccountsPayableSummary | null })
  | (ToolResultBase & { id: "accounts_receivable"; dashboard: AccountsReceivableDashboard | null })
  /** Integração de mensageria (WhatsApp) ainda não existe — este resultado é sempre `not_configured`, nunca inventa dado. */
  | (ToolResultBase & { id: "unanswered_clients" })
  /** `/agenda` hoje só mostra dados ilustrativos (mock) — este resultado é sempre `not_configured` até haver integração real. */
  | (ToolResultBase & { id: "agenda_summary" })
  /** Meta Ads/Instagram (Fase B) ainda não implementado — este resultado é sempre `not_configured`. */
  | (ToolResultBase & { id: "marketing_summary" })
  /** Conciliação financeira Stone (Sprint 7.0, Z2) — `summary` já normalizado, nunca o XML/gzip bruto (ver `integrations/stone/reconciliationSummary.ts`). */
  | (ToolResultBase & { id: "stone_reconciliation_summary"; summary: StoneReconciliationSummary })
  /** Agenda Financeira própria do Diretor Financeiro (Sprint 7.0, Z3) — a Stone só forneceu os fatos-base. */
  | (ToolResultBase & { id: "stone_financial_schedule"; result: FinancialScheduleResult })
  /** Conciliação Stone × JumpPark (Sprint 7.0, Z3) — resultados de correspondência + divergências, nunca uma correção automática. */
  | (ToolResultBase & { id: "stone_jumppark_reconciliation"; result: JumpparkReconciliationResult })
  /** Resumo das divergências já persistidas (Sprint 7.0, Z4) — lê `stone_divergences`, nunca recalcula. */
  | (ToolResultBase & { id: "stone_divergences_summary"; summary: StoneDivergencesSummary })
  /** Status/saúde real da integração (Sprint 7.0, Z4) — histórico de `stone_import_runs`, nunca uma suposição. */
  | (ToolResultBase & { id: "stone_integration_health"; report: StoneIntegrationHealthReport })
  /** Diretor Financeiro Inteligente (Sprint 8) — métricas/tendências/diagnósticos/recomendações baseados em regras, nunca IA generativa (ver `finance/intelligence/director/service.ts`). */
  | (ToolResultBase & { id: "financial_intelligence"; report: FinancialDirectorReport });
