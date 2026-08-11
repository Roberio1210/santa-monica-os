import type { OperationalServiceCategory } from "@/lib/domain/operational";
import type { PaymentMethod } from "@/types/common";
import type { PeriodComparison, PeriodRange } from "@/lib/utils/timezone";

/**
 * Read model temporário do Painel Gerencial (Sprint MVP Gerencial).
 *
 * Este módulo NÃO é o Business Core (ver docs/business-core-architecture-rfc.md) — é uma camada
 * de leitura isolada, computada sob demanda a cada requisição, sem persistência própria e sem
 * criar uma segunda fonte de verdade. Reaproveita o mapper `mapJumpParkOrderToOperationalOrder`
 * (Sprint 10, `@/lib/domain/operational`) para classificação de categoria/pagamento/valores, e o
 * repositório financeiro já existente para despesas (Contas a Pagar). Quando o Business Core
 * (`OperationalOrder` persistido, Sprint 11B+) estiver disponível, este módulo deve ser
 * substituído por uma leitura direta do domínio — nenhuma tela deve depender da forma interna
 * deste read model além do necessário.
 */

export interface ManagementServiceLine {
  description: string;
  category: OperationalServiceCategory;
  amount: number;
}

/** Uma linha por atendimento/ordem finalizada — dado operacional completo, para a área autenticada. */
export interface ManagementOrderRow {
  externalId: string;
  date: string;
  entryTime: string | null;
  exitTime: string | null;
  customerId: string | null;
  customerName: string | null;
  /** Telefone completo (não mascarado) — apresentação operacional autorizada, ver operational-view.ts. */
  customerPhone: string | null;
  vehicleId: string | null;
  vehicleModel: string;
  /** Placa completa (não mascarada) — apresentação operacional autorizada, ver operational-view.ts. */
  licensePlate: string | null;
  serviceLines: ManagementServiceLine[];
  serviceCategory: OperationalServiceCategory;
  employeeName: string | null;
  paymentMethodLabel: string;
  paymentMethodCategory: PaymentMethod;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  /** Texto real vindo da JumpPark (financialSituationName/operationSituationName) — nunca inventado. */
  situation: string;
  /** "paid" só quando financialSituationName === "Pago" exatamente (mesma regra do domínio, Sprint 10) — nunca um terceiro estado inventado. */
  paymentStatus: "paid" | "unknown";
  source: string;
}

export interface ManagementIndicators {
  grossRevenue: number;
  discountTotal: number;
  netRevenue: number;
  ordersCount: number;
  vehiclesCount: number;
  customersCount: number;
  averageTicket: number | null;
  receivedAmount: number;
  pendingAmount: number;
}

export interface CustomerAggregate {
  customerId: string;
  name: string | null;
  phone: string | null;
  vehicleModel: string | null;
  licensePlate: string | null;
  visits: number;
  totalSpent: number;
  averageTicket: number;
  lastVisit: string;
  services: string[];
}

export interface ServiceAggregate {
  description: string;
  category: OperationalServiceCategory;
  quantity: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  revenueShare: number;
  averageTicket: number;
}

export interface ExpenseRow {
  id: string;
  date: string;
  description: string;
  category: string;
  supplier: string | null;
  amount: number;
  dueDate: string;
  status: string;
  paymentMethod: string;
  source: string;
}

export interface ExpensesSummary {
  total: number;
  count: number;
  topCategory: { name: string; amount: number } | null;
  topSupplier: { name: string; amount: number } | null;
  overdueCount: number;
  upcomingCount: number;
  paidCount: number;
  unpaidCount: number;
  hasData: boolean;
}

export type FindingSeverity = "info" | "warning" | "critical";

export interface ManagementFinding {
  id: string;
  title: string;
  metric: string;
  comparison: string;
  period: string;
  evidence: string;
  recommendation: string;
  severity: FindingSeverity;
}

/** Missão 29 — comparação vs período anterior (mesma duração) dos indicadores mais consultados. Percentual null quando a base anterior é zero (nunca inventa "∞"/"0%"). */
export interface PainelGerencialComparison {
  netRevenue: PeriodComparison;
  grossRevenue: PeriodComparison;
  ordersCount: PeriodComparison;
  customersCount: PeriodComparison;
  averageTicket: PeriodComparison;
  expensesTotal: PeriodComparison;
  operationalResult: PeriodComparison;
}

export interface PainelGerencialResult {
  period: PeriodRange;
  /** Missão 29 — limites do período de comparação usado em `comparison` (mesma duração, imediatamente anterior). */
  previousPeriod: { from: string; to: string };
  jumpparkConfigured: boolean;
  jumpparkError: string | null;
  generatedAt: string;
  orders: ManagementOrderRow[];
  indicators: ManagementIndicators;
  customers: CustomerAggregate[];
  services: ServiceAggregate[];
  expenses: {
    rows: ExpenseRow[];
    summary: ExpensesSummary;
  };
  operationalResult: number;
  /** Validação Final — false quando faturamento (JumpPark) ou despesas (Contas a Pagar) não têm dado real no período; nesse caso `operationalResult` não deve ser apresentado como um resultado real. */
  operationalResultCalculable: boolean;
  comparison: PainelGerencialComparison;
  findings: ManagementFinding[];
}
