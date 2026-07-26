import type { NormalizedConciliation } from "@/lib/integrations/stone/normalize";

/**
 * Tipos do Diretor Financeiro Inteligente (Sprint 8, decisão do usuário) — inteligência baseada
 * em regras/métricas/tendências/diagnósticos reproduzíveis, nunca IA generativa. Todo o módulo
 * (`src/lib/finance/intelligence/*`) só consome `NormalizedConciliation[]` (Stone Z2/Z3, já
 * estável) e `FinancialSchedule` (Stone Z3) — nenhum arquivo de `integrations/stone/` é alterado
 * por este módulo.
 */

/** Uma janela de dias já buscada (`multiDay.ts`) — nunca uma projeção além do que foi processado. */
export interface FinancialPeriodInput {
  periodFrom: string;
  periodTo: string;
  days: NormalizedConciliation[];
  /** "Hoje" real, para ancorar classificação de recebível vencido/futuro (`receivableState.ts`). */
  todayIso: string;
  /** Última data com visibilidade real de liquidação — nunca "hoje" no relógio de parede. */
  dataAvailableThroughDate: string;
}

export interface AmountByGroup {
  key: string;
  label: string;
  count: number;
  amount: number;
  /** 0-100, participação no total do período. */
  percentageOfTotal: number;
}

export interface DailyRevenuePoint {
  date: string;
  grossAmount: number;
  netAmount: number;
  transactionCount: number;
}

/**
 * Conjunto de métricas executivas de um período (Sprint 8, seção "MOTOR DE MÉTRICAS") — sempre
 * calculado por `metrics/engine.ts`, uma função pura por métrica, nunca acoplado a I/O.
 */
export interface FinancialMetricSet {
  periodFrom: string;
  periodTo: string;
  transactionCount: number;

  grossRevenue: number;
  netRevenue: number;
  totalFees: number;
  /** 0-100. */
  feePercentage: number;

  /** Valor bruto médio por venda. */
  averageTicket: number;
  /** Valor líquido médio por venda (pós-taxas). */
  averageTransactionValue: number;
  highestSale: number;
  lowestSale: number;
  /** 0-100 — participação dos ~10% maiores valores de venda na receita bruta total do período. */
  topSalesConcentration: number;

  brandDistribution: AmountByGroup[];
  paymentMethodDistribution: AmountByGroup[];
  installmentDistribution: AmountByGroup[];

  dailyRevenue: DailyRevenuePoint[];
  weeklyRevenue: AmountByGroup[];
  monthlyRevenue: AmountByGroup[];

  pendingReceivablesAmount: number;
  overdueReceivablesAmount: number;
  settledReceivablesAmount: number;
  /** 0-100 — liquidados / (liquidados + vencidos + futuros). */
  settledReceivablesPercentage: number;
  /** Dias corridos, liquidação real menos previsão — `null` quando nenhuma parcela liquidada tem as duas datas conhecidas. */
  averageSettlementDays: number | null;

  advancedAmount: number;
  /** 0-100 — valor antecipado / valor liquidado total. */
  advancedPercentage: number;
}

export type TrendDirection = "subindo" | "caindo" | "estavel";

/** Chave de uma métrica numérica de `FinancialMetricSet` — usada por `trends/engine.ts` para comparar dois períodos métrica a métrica. */
export type FinancialMetricKey = {
  [K in keyof FinancialMetricSet]: FinancialMetricSet[K] extends number ? K : never;
}[keyof FinancialMetricSet];

export interface TrendResult {
  metric: FinancialMetricKey;
  label: string;
  currentValue: number;
  previousValue: number;
  absoluteChange: number;
  /** `null` quando `previousValue` é 0 (variação percentual indefinida — nunca dividido por zero). */
  percentageChange: number | null;
  direction: TrendDirection;
}

export interface PeriodBounds {
  from: string;
  to: string;
}

export interface TrendComparison {
  label: string;
  currentPeriod: PeriodBounds;
  previousPeriod: PeriodBounds;
  currentMetrics: FinancialMetricSet;
  previousMetrics: FinancialMetricSet;
  trends: TrendResult[];
}

export interface MovingAveragePoint {
  date: string;
  value: number;
  /** `null` enquanto a janela ainda não tem pontos suficientes. */
  movingAverage: number | null;
}

export type DiagnosticSeverity = "info" | "warning" | "critical";
export type DiagnosticConfidence = "low" | "medium" | "high";

/** Um achado do motor de diagnósticos (Sprint 8, seção "DIAGNÓSTICOS") — sempre reproduzível a partir de `metrics`/`trends`, nunca uma inferência solta. */
export interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  confidence: DiagnosticConfidence;
  title: string;
  description: string;
  reason: string;
  evidence: string[];
  recommendation: string;
}

export type RecommendationPriority = "low" | "medium" | "high";
export type RecommendationImpact = "low" | "medium" | "high";
export type RecommendationCategory = "cash_flow" | "pricing" | "risk" | "operations" | "growth";

export interface Recommendation {
  priority: RecommendationPriority;
  impact: RecommendationImpact;
  confidence: DiagnosticConfidence;
  category: RecommendationCategory;
  text: string;
}

export interface ExecutiveSummary {
  netRevenueLabel: string;
  receivablesLabel: string;
  mainRisk: string;
  mainOpportunity: string;
  situation: string;
  mainRecommendation: string;
}

export type FinancialDirectorStatus = "ok" | "not_configured" | "no_data" | "temporary_failure";

/** Retorno único de `runFinancialDirector` (Sprint 8, seção "FINANCIAL DIRECTOR") — nunca texto solto, sempre este objeto estruturado. */
export interface FinancialDirectorReport {
  status: FinancialDirectorStatus;
  error: string | null;
  limitations: string[];
  generatedAt: string;
  dataAvailableThroughDate: string | null;
  /** Métricas dos últimos 30 dias com dado disponível — período canônico usado pelos diagnósticos. */
  primaryMetrics: FinancialMetricSet | null;
  comparisons: TrendComparison[];
  diagnostics: Diagnostic[];
  recommendations: Recommendation[];
  executiveSummary: ExecutiveSummary | null;
}
