import type { PeriodRange } from "@/lib/utils/timezone";
import type { ComparisonMetric, ComparisonReport, PackageCounts, PeakHour } from "@/lib/zezinho/comparison-engine";
import type { BusinessObjective } from "@/lib/zezinho/objective/types";
import type { CrmCustomer } from "@/lib/crm/types";
import type { InventorySummary } from "@/lib/inventory/service";
import type { ConsolidatedAlert } from "@/lib/operations/central";

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
  | "full_period_comparison";

export type ToolCostHint = "low" | "medium" | "high";

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
}

export interface ToolCall {
  id: ToolId;
  periodA: PeriodRange | null;
  periodB: PeriodRange | null;
  filterKind: "lavacao" | "estacionamento" | null;
}

interface ToolResultBase {
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
  | (ToolResultBase & { id: "full_period_comparison"; report: ComparisonReport });
