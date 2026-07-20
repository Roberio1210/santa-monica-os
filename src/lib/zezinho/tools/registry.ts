import type { ToolDefinition, ToolId } from "@/lib/zezinho/tools/types";

/**
 * Registro estático do catálogo de ferramentas — dado puro, versionado em código (decisão do
 * usuário, item 2). O planejador (`planner/selectTools.ts`) consulta isto para decidir o que
 * chamar; o dispatcher (`executor.ts`) usa o `id` para saber qual service real invocar.
 */
export const TOOL_REGISTRY: Record<ToolId, ToolDefinition> = {
  jumppark_period_summary: {
    id: "jumppark_period_summary",
    label: "Resumo operacional (JumpPark)",
    source: "JumpPark",
    reuses: "fetchOperationalOrders + computeOperationalSummary (src/lib/integrations/jumppark/operations-summary.ts)",
    objectives: ["increase_ticket", "improve_service_mix", "increase_revenue", "evaluate_pricing", "staffing_capacity", "improve_cash_flow", "business_health"],
    requiresPeriod: true,
    costHint: "medium",
  },
  jumppark_wash_packages: {
    id: "jumppark_wash_packages",
    label: "Distribuição Bronze/Silver/Gold (JumpPark)",
    source: "JumpPark",
    reuses: "computeWashCategoryGroups (src/lib/integrations/jumppark/wash-grouping.ts)",
    objectives: ["improve_service_mix"],
    requiresPeriod: true,
    costHint: "medium",
  },
  cash_ledger_totals: {
    id: "cash_ledger_totals",
    label: "Entradas/saídas de caixa (Neon)",
    source: "Neon — fluxo de caixa",
    reuses: "fetchCashLedger (src/lib/finance/service.ts)",
    objectives: ["reduce_costs", "improve_cash_flow", "business_health"],
    requiresPeriod: true,
    costHint: "low",
  },
  dre_result: {
    id: "dre_result",
    label: "Resultado gerencial (DRE, Neon)",
    source: "Neon — DRE gerencial",
    reuses: "fetchDreReport (src/lib/finance/service.ts)",
    objectives: ["business_health"],
    requiresPeriod: true,
    costHint: "medium",
  },
  crm_customers: {
    id: "crm_customers",
    label: "Clientes (CRM)",
    source: "CRM (JumpPark + Contas a Receber)",
    reuses: "fetchCrmCustomers (src/lib/crm/service.ts)",
    objectives: ["client_retention"],
    requiresPeriod: false,
    costHint: "medium",
  },
  inventory_overview: {
    id: "inventory_overview",
    label: "Panorama de estoque",
    source: "Estoque",
    reuses: "fetchInventoryOverview (src/lib/inventory/service.ts)",
    objectives: [],
    requiresPeriod: false,
    costHint: "low",
  },
  central_alerts: {
    id: "central_alerts",
    label: "Alertas consolidados",
    source: "Central de Operações",
    reuses: "fetchCentralOverview + computeConsolidatedAlerts (src/lib/operations/central.ts)",
    objectives: ["business_health"],
    requiresPeriod: false,
    costHint: "high",
  },
  full_period_comparison: {
    id: "full_period_comparison",
    label: "Comparação completa de dois períodos",
    source: "JumpPark + Neon (fluxo de caixa + DRE)",
    reuses: "buildComparisonReport (src/lib/zezinho/comparison-engine.ts)",
    objectives: [],
    requiresPeriod: true,
    costHint: "high",
  },
  /**
   * Novas na Sprint 4.0 (Z1) — registradas no catálogo e já com executor funcional, mas ainda
   * SEM entrada na tabela objetivo->ferramentas do planner (`objectives: []`): a seletividade
   * (quando o clima/meta entram numa resposta) é trabalho do Z2, não deste checkpoint — mesma
   * disciplina incremental já usada para `inventory_overview` na Sprint 3.0.
   */
  weather_forecast: {
    id: "weather_forecast",
    label: "Previsão do tempo (hoje/amanhã)",
    source: "OpenWeatherMap",
    reuses: "fetchWeatherForecast (src/lib/integrations/weather/service.ts)",
    objectives: [],
    requiresPeriod: false,
    costHint: "low",
  },
  goal_progress: {
    id: "goal_progress",
    label: "Progresso da meta (percentual, ritmo, projeção, faixas de prêmio)",
    source: "Metas (Neon)",
    reuses: "fetchActiveGoal + computeGoalProgress (src/lib/goals/service.ts) + jumppark_period_summary para o valor atual",
    objectives: [],
    requiresPeriod: false,
    costHint: "medium",
  },
};
