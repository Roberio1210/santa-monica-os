import "server-only";
import { fetchOperationalOrders, computeOperationalSummary, comparePeriods, type OperationalOrder, type PeriodComparison } from "@/lib/integrations/jumppark/operations-summary";
import { computeWashCategoryGroups } from "@/lib/integrations/jumppark/wash-grouping";
import { fetchCashLedger, fetchDreReport } from "@/lib/finance/service";
import { isJumpParkConfigured } from "@/lib/config/env";
import type { PeriodRange } from "@/lib/utils/timezone";
import type { CashLedgerEntry } from "@/lib/finance/types";

/**
 * Motor de comparação entre dois períodos (Camada B/C do Zézinho 2.0) — reaproveita
 * integralmente os services já existentes (JumpPark, Fluxo de Caixa, DRE); nenhuma lógica
 * financeira nova, só agregação e comparação sobre dados já calculados por eles.
 */

export type MetricUnit = "currency" | "count";

/**
 * Contrato de uma métrica comparada: `a` é sempre o valor do período atual (periodA —
 * "currentValue"), `b` é sempre o valor do período anterior (periodB — "previousValue", `null`
 * quando não há comparação). `comparison` (de `comparePeriods`) segue a mesma convenção:
 * `current`=a, `previous`=b. Toda narração deve ler "de b (anterior) para a (atual)", nunca o
 * inverso — essa inversão foi a causa de um bug de frases como "de 41 para 22" quando o valor
 * na verdade subiu de 22 para 41.
 */
export interface ComparisonMetric {
  key: string;
  label: string;
  unit: MetricUnit;
  /** Valor do período atual (periodA) — "currentValue". */
  a: number;
  /** Valor do período anterior (periodB) — "previousValue"; `null` quando não há periodB. */
  b: number | null;
  comparison: PeriodComparison;
  source: string;
}

export interface PackageCounts {
  Bronze: number;
  Silver: number;
  Gold: number;
}

export interface PeakHour {
  hour: string;
  count: number;
}

export interface ComparisonReport {
  periodA: PeriodRange;
  periodB: PeriodRange | null;
  filterKind: "lavacao" | "estacionamento" | null;
  jumpparkConfigured: boolean;
  metrics: ComparisonMetric[];
  packageCountsA: PackageCounts;
  packageCountsB: PackageCounts;
  topServicesA: { description: string; amount: number }[];
  topServicesB: { description: string; amount: number }[];
  peakHourA: PeakHour | null;
  peakHourB: PeakHour | null;
  errors: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computePeakHour(orders: OperationalOrder[]): PeakHour | null {
  const counts = new Map<string, number>();
  for (const o of orders) {
    if (!o.exitTime) continue;
    const hour = `${o.exitTime.slice(0, 2)}h`;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? { hour: sorted[0][0], count: sorted[0][1] } : null;
}

export function topServicesByRevenue(orders: OperationalOrder[], limit = 5): { description: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const o of orders) for (const s of o.services) totals.set(s.description, round2((totals.get(s.description) ?? 0) + s.amount));
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([description, amount]) => ({ description, amount }));
}

function sumCashInRange(ledger: CashLedgerEntry[], from: string, to: string): { entradas: number; saidas: number; resultado: number } {
  const inRange = ledger.filter((e) => e.kind === "movimento" && e.date >= from && e.date <= to);
  const entradas = round2(inRange.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0));
  const saidas = round2(Math.abs(inRange.filter((e) => e.amount < 0).reduce((sum, e) => sum + e.amount, 0)));
  return { entradas, saidas, resultado: round2(entradas - saidas) };
}

function packageCounts(groups: { label: string; count: number }[]): PackageCounts {
  return {
    Bronze: groups.find((g) => g.label === "Bronze")?.count ?? 0,
    Silver: groups.find((g) => g.label === "Silver")?.count ?? 0,
    Gold: groups.find((g) => g.label === "Gold")?.count ?? 0,
  };
}

function metric(key: string, label: string, unit: MetricUnit, a: number, b: number | null, hasB: boolean, source: string): ComparisonMetric {
  return { key, label, unit, a, b: hasB ? b : null, comparison: comparePeriods(a, hasB ? (b ?? 0) : null), source };
}

/**
 * Monta o relatório comparativo completo entre `periodA` e `periodB` (ou só o resumo de
 * `periodA`, quando `periodB` for `null`). Nunca lança: falhas de uma fonte viram entradas em
 * `errors`, sem derrubar o restante — o chamador decide como comunicar isso.
 */
export async function buildComparisonReport(periodA: PeriodRange, periodB: PeriodRange | null, filter?: { kind?: "lavacao" | "estacionamento" }): Promise<ComparisonReport> {
  const errors: string[] = [];
  const filterKind = filter?.kind ?? null;

  if (!isJumpParkConfigured()) {
    return {
      periodA,
      periodB,
      filterKind,
      jumpparkConfigured: false,
      metrics: [],
      packageCountsA: { Bronze: 0, Silver: 0, Gold: 0 },
      packageCountsB: { Bronze: 0, Silver: 0, Gold: 0 },
      topServicesA: [],
      topServicesB: [],
      peakHourA: null,
      peakHourB: null,
      errors: ["JumpPark não configurado neste ambiente."],
    };
  }

  const [resultA, resultB, ledger, dreA, dreB] = await Promise.all([
    fetchOperationalOrders(periodA.from, periodA.to),
    periodB ? fetchOperationalOrders(periodB.from, periodB.to) : Promise.resolve(null),
    fetchCashLedger().catch(() => {
      errors.push("Não foi possível consultar o Fluxo de Caixa (Neon).");
      return [] as CashLedgerEntry[];
    }),
    fetchDreReport("competencia", periodA.from, periodA.to, "consolidado").catch(() => {
      errors.push("Não foi possível consultar o resultado gerencial (DRE) do período atual.");
      return null;
    }),
    periodB
      ? fetchDreReport("competencia", periodB.from, periodB.to, "consolidado").catch(() => {
          errors.push("Não foi possível consultar o resultado gerencial (DRE) do período anterior.");
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (resultA.error) errors.push(`JumpPark (${periodA.label}): ${resultA.error}`);
  if (resultB?.error && periodB) errors.push(`JumpPark (${periodB.label}): ${resultB.error}`);

  const ordersA = filterKind ? resultA.orders.filter((o) => o.kind === filterKind) : resultA.orders;
  const ordersB = resultB ? (filterKind ? resultB.orders.filter((o) => o.kind === filterKind) : resultB.orders) : [];
  const hasB = !!periodB;

  const summaryA = computeOperationalSummary(ordersA);
  const summaryB = hasB ? computeOperationalSummary(ordersB) : null;

  const [groupsA, groupsB] = await Promise.all([
    computeWashCategoryGroups(ordersA.filter((o) => o.kind === "lavacao")),
    hasB ? computeWashCategoryGroups(ordersB.filter((o) => o.kind === "lavacao")) : Promise.resolve([]),
  ]);

  const cashA = sumCashInRange(ledger, periodA.from, periodA.to);
  const cashB = hasB && periodB ? sumCashInRange(ledger, periodB.from, periodB.to) : null;

  const metrics: ComparisonMetric[] = [
    metric("revenue", "Faturamento operacional", "currency", summaryA.revenue, summaryB?.revenue ?? null, hasB, "JumpPark"),
    metric("orders", "Ordens finalizadas", "count", summaryA.ordersCount, summaryB?.ordersCount ?? null, hasB, "JumpPark"),
    metric("vehicles", "Veículos atendidos", "count", summaryA.vehiclesServed, summaryB?.vehiclesServed ?? null, hasB, "JumpPark"),
    metric("clients", "Clientes identificados", "count", summaryA.clientsIdentified, summaryB?.clientsIdentified ?? null, hasB, "JumpPark"),
    metric("avgTicket", "Ticket médio", "currency", summaryA.averageTicket ?? 0, summaryB?.averageTicket ?? null, hasB, "JumpPark"),
    metric("washCount", "Lavações", "count", summaryA.washCount, summaryB?.washCount ?? null, hasB, "JumpPark"),
    metric("washRevenue", "Faturamento de lavação", "currency", summaryA.washRevenue, summaryB?.washRevenue ?? null, hasB, "JumpPark"),
    metric("parkingCount", "Ordens de estacionamento", "count", summaryA.parkingCount, summaryB?.parkingCount ?? null, hasB, "JumpPark"),
    metric("parkingRevenue", "Faturamento de estacionamento", "currency", summaryA.parkingRevenue, summaryB?.parkingRevenue ?? null, hasB, "JumpPark"),
    metric("cashEntradas", "Entradas de caixa", "currency", cashA.entradas, cashB?.entradas ?? null, hasB, "Fluxo de Caixa (Neon)"),
    metric("cashSaidas", "Saídas de caixa", "currency", cashA.saidas, cashB?.saidas ?? null, hasB, "Fluxo de Caixa (Neon)"),
    metric("cashResultado", "Resultado de caixa", "currency", cashA.resultado, cashB?.resultado ?? null, hasB, "Fluxo de Caixa (Neon)"),
  ];

  if (dreA) {
    metrics.push(metric("dreResultado", "Resultado gerencial (DRE)", "currency", dreA.resultadoOperacional, dreB?.resultadoOperacional ?? null, hasB && !!dreB, "DRE Gerencial"));
  }

  return {
    periodA,
    periodB,
    filterKind,
    jumpparkConfigured: true,
    metrics,
    packageCountsA: packageCounts(groupsA),
    packageCountsB: packageCounts(groupsB),
    topServicesA: topServicesByRevenue(ordersA),
    topServicesB: topServicesByRevenue(ordersB),
    peakHourA: computePeakHour(ordersA),
    peakHourB: hasB ? computePeakHour(ordersB) : null,
    errors,
  };
}
