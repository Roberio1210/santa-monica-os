import { classifyReceivableState } from "@/lib/integrations/stone/receivableState";
import type { NormalizedConciliation } from "@/lib/integrations/stone/normalize";
import { average, centsToAmount, percentageOf, sumCents } from "@/lib/finance/intelligence/utils/money";
import { isoWeekLabel, monthLabel } from "@/lib/finance/intelligence/utils/dates";
import type { AmountByGroup, DailyRevenuePoint, FinancialMetricSet, FinancialPeriodInput } from "@/lib/finance/intelligence/types";

/**
 * Motor de métricas executivas (Sprint 8, seção "MOTOR DE MÉTRICAS") — puro, síncrono, sem I/O.
 * Cada métrica é calculada por uma função independente e testável isoladamente; `computeFinancialMetrics`
 * só as combina. Nunca lê `client.ts`/rede/banco — só o `NormalizedConciliation[]` já buscado.
 */

const BRAND_LABELS: Record<number, string> = {
  1: "Visa",
  2: "Mastercard",
  3: "Elo",
  4: "American Express",
  5: "Hipercard",
  6: "Diners Club",
};

function brandLabel(brandId: number): string {
  return BRAND_LABELS[brandId] ?? `Bandeira ${brandId}`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  debito: "Débito",
  credito: "Crédito",
};

export function totalRevenue(sales: { grossAmount: number }[]): number {
  return centsToAmount(sumCents(sales.map((s) => s.grossAmount)));
}

export function netRevenue(sales: { netAmount: number }[]): number {
  return centsToAmount(sumCents(sales.map((s) => s.netAmount)));
}

export function totalFees(sales: { feeAmount: number }[]): number {
  return centsToAmount(sumCents(sales.map((s) => s.feeAmount)));
}

export function feePercentage(gross: number, fees: number): number {
  return percentageOf(fees, gross);
}

export function averageTicket(sales: { grossAmount: number }[]): number {
  return average(sales.map((s) => s.grossAmount));
}

export function averageTransactionValue(sales: { netAmount: number }[]): number {
  return average(sales.map((s) => s.netAmount));
}

export function highestSale(sales: { grossAmount: number }[]): number {
  if (sales.length === 0) return 0;
  return Math.max(...sales.map((s) => s.grossAmount));
}

export function lowestSale(sales: { grossAmount: number }[]): number {
  if (sales.length === 0) return 0;
  return Math.min(...sales.map((s) => s.grossAmount));
}

/** 0-100 — participação dos ~10% maiores valores de venda (mínimo 1) na receita bruta total. Mede concentração/dependência de poucas vendas grandes. */
export function topSalesConcentration(sales: { grossAmount: number }[]): number {
  if (sales.length === 0) return 0;
  const sorted = [...sales].map((s) => s.grossAmount).sort((a, b) => b - a);
  const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));
  const topTotal = centsToAmount(sumCents(sorted.slice(0, topCount)));
  const grandTotal = centsToAmount(sumCents(sorted));
  return percentageOf(topTotal, grandTotal);
}

function distributionBy<S extends { grossAmount: number }, T>(sales: S[], keyOf: (sale: S) => T, labelOf: (key: T) => string): AmountByGroup[] {
  const grandTotal = centsToAmount(sumCents(sales.map((s) => s.grossAmount)));
  const byKey = new Map<string, { label: string; count: number; amountCents: number }>();
  for (const sale of sales) {
    const key = String(keyOf(sale));
    const entry = byKey.get(key);
    if (entry) {
      entry.count += 1;
      entry.amountCents += Math.round(sale.grossAmount * 100);
    } else {
      byKey.set(key, { label: labelOf(keyOf(sale)), count: 1, amountCents: Math.round(sale.grossAmount * 100) });
    }
  }
  return [...byKey.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count, amount: centsToAmount(v.amountCents), percentageOfTotal: percentageOf(centsToAmount(v.amountCents), grandTotal) }))
    .sort((a, b) => b.amount - a.amount);
}

export function brandDistribution(sales: { grossAmount: number; brandId: number }[]): AmountByGroup[] {
  return distributionBy(sales, (s) => s.brandId, (id) => brandLabel(id as number));
}

export function paymentMethodDistribution(sales: { grossAmount: number; cardFlow: string }[]): AmountByGroup[] {
  return distributionBy(sales, (s) => s.cardFlow, (flow) => PAYMENT_METHOD_LABELS[flow as string] ?? String(flow));
}

export function installmentDistribution(sales: { grossAmount: number; installmentsCount: number }[]): AmountByGroup[] {
  return distributionBy(
    sales,
    (s) => s.installmentsCount,
    (n) => ((n as number) <= 1 ? "À vista" : `${n}x`),
  );
}

export function dailyRevenue(sales: { grossAmount: number; netAmount: number; capturedAt: string }[]): DailyRevenuePoint[] {
  const byDate = new Map<string, { grossCents: number; netCents: number; count: number }>();
  for (const sale of sales) {
    const date = sale.capturedAt.slice(0, 10);
    const entry = byDate.get(date);
    if (entry) {
      entry.grossCents += Math.round(sale.grossAmount * 100);
      entry.netCents += Math.round(sale.netAmount * 100);
      entry.count += 1;
    } else {
      byDate.set(date, { grossCents: Math.round(sale.grossAmount * 100), netCents: Math.round(sale.netAmount * 100), count: 1 });
    }
  }
  return [...byDate.entries()]
    .map(([date, v]) => ({ date, grossAmount: centsToAmount(v.grossCents), netAmount: centsToAmount(v.netCents), transactionCount: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function weeklyRevenue(daily: DailyRevenuePoint[]): AmountByGroup[] {
  return aggregateDailyBy(daily, (d) => isoWeekLabel(d.date), (label) => label);
}

export function monthlyRevenue(daily: DailyRevenuePoint[]): AmountByGroup[] {
  return aggregateDailyBy(daily, (d) => monthLabel(d.date), (label) => label);
}

function aggregateDailyBy(daily: DailyRevenuePoint[], keyOf: (point: DailyRevenuePoint) => string, labelOf: (key: string) => string): AmountByGroup[] {
  const grandTotal = centsToAmount(sumCents(daily.map((d) => d.grossAmount)));
  const byKey = new Map<string, { count: number; amountCents: number }>();
  for (const point of daily) {
    const key = keyOf(point);
    const entry = byKey.get(key);
    if (entry) {
      entry.count += point.transactionCount;
      entry.amountCents += Math.round(point.grossAmount * 100);
    } else {
      byKey.set(key, { count: point.transactionCount, amountCents: Math.round(point.grossAmount * 100) });
    }
  }
  return [...byKey.entries()]
    .map(([key, v]) => ({ key, label: labelOf(key), count: v.count, amount: centsToAmount(v.amountCents), percentageOfTotal: percentageOf(centsToAmount(v.amountCents), grandTotal) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

interface ReceivableRecord {
  netAmount: number;
  expectedPaymentDate: string | null;
  settledPaymentDate: string | null;
  settledAmount: number | null;
  isAdvance: boolean;
  state: ReturnType<typeof classifyReceivableState>;
}

function receivableKey(saleExternalReference: string, installmentNumber: number): string {
  return `${saleExternalReference}#${installmentNumber}`;
}

/**
 * Religa cada parcela prevista à sua liquidação real, quando existir — mesma lógica de
 * `financialSchedule.ts:buildReceivables`, reescrita aqui (nunca importada: módulos independentes
 * por camada) porque este motor precisa de granularidade por parcela (prazo de liquidação, valor
 * antecipado) que `FinancialSchedule` não expõe.
 */
function buildReceivableRecords(days: NormalizedConciliation[], dataAvailableThroughDate: string): ReceivableRecord[] {
  const settlementByKey = new Map<string, { date: string; amount: number; isAdvance: boolean }>();
  for (const day of days) {
    for (const s of day.settlements) settlementByKey.set(receivableKey(s.saleExternalReference, s.installmentNumber), { date: s.settledPaymentDate, amount: s.netAmount, isAdvance: s.isAdvance });
  }

  const totalCancelledSales = new Set<string>();
  const partiallyCancelledKeys = new Set<string>();
  for (const day of days) {
    for (const sale of day.sales) {
      for (const c of sale.cancellations) {
        if (c.installmentNumber === null) totalCancelledSales.add(sale.acquirerTransactionKey);
        else partiallyCancelledKeys.add(receivableKey(sale.acquirerTransactionKey, c.installmentNumber));
      }
    }
  }

  const chargedBackKeys = new Set<string>();
  for (const day of days) {
    for (const cb of day.chargebacks) chargedBackKeys.add(receivableKey(cb.saleExternalReference, cb.installmentNumber));
  }

  const records: ReceivableRecord[] = [];
  const seen = new Set<string>();
  for (const day of days) {
    for (const ep of day.expectedPayments) {
      const key = receivableKey(ep.saleExternalReference, ep.installmentNumber);
      if (seen.has(key)) continue;
      seen.add(key);

      const settlement = settlementByKey.get(key) ?? null;
      const cancelled = totalCancelledSales.has(ep.saleExternalReference) || partiallyCancelledKeys.has(key);
      const chargeback = chargedBackKeys.has(key);

      records.push({
        netAmount: ep.amount,
        expectedPaymentDate: ep.expectedPaymentDate,
        settledPaymentDate: settlement?.date ?? null,
        settledAmount: settlement?.amount ?? null,
        isAdvance: settlement?.isAdvance ?? false,
        state: classifyReceivableState({ expectedPaymentDate: ep.expectedPaymentDate, settledPaymentDate: settlement?.date ?? null, cancelled, chargeback, dataAvailableThroughDate }),
      });
    }
  }
  return records;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

/** Dias corridos entre previsão e liquidação real, média entre as parcelas liquidadas com as duas datas conhecidas — `null` quando não há nenhuma. */
export function averageSettlementDays(records: ReceivableRecord[]): number | null {
  const settled = records.filter((r) => r.settledPaymentDate && r.expectedPaymentDate);
  if (settled.length === 0) return null;
  const lags = settled.map((r) => daysBetween(r.expectedPaymentDate!, r.settledPaymentDate!));
  return Math.round((lags.reduce((sum, l) => sum + l, 0) / lags.length) * 100) / 100;
}

/**
 * Calcula todas as métricas executivas de um período — único ponto de entrada síncrono do motor
 * de métricas. Nunca lança; um período sem vendas devolve um `FinancialMetricSet` honesto com
 * tudo zerado (nunca `undefined`/`NaN`).
 */
export function computeFinancialMetrics(input: FinancialPeriodInput): FinancialMetricSet {
  const sales = input.days.flatMap((d) => d.sales);
  const gross = totalRevenue(sales);
  const net = netRevenue(sales);
  const fees = totalFees(sales);
  const daily = dailyRevenue(sales);
  const receivables = buildReceivableRecords(input.days, input.dataAvailableThroughDate);

  const pending = receivables.filter((r) => r.state === "scheduled" || r.state === "due_today");
  const overdue = receivables.filter((r) => r.state === "overdue");
  const settled = receivables.filter((r) => r.settledAmount !== null);
  const advanced = settled.filter((r) => r.isAdvance);

  const pendingAmount = centsToAmount(sumCents(pending.map((r) => r.netAmount)));
  const overdueAmount = centsToAmount(sumCents(overdue.map((r) => r.netAmount)));
  const settledAmount = centsToAmount(sumCents(settled.map((r) => r.settledAmount ?? 0)));
  const advancedAmount = centsToAmount(sumCents(advanced.map((r) => r.settledAmount ?? 0)));

  return {
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    transactionCount: sales.length,
    grossRevenue: gross,
    netRevenue: net,
    totalFees: fees,
    feePercentage: feePercentage(gross, fees),
    averageTicket: averageTicket(sales),
    averageTransactionValue: averageTransactionValue(sales),
    highestSale: highestSale(sales),
    lowestSale: lowestSale(sales),
    topSalesConcentration: topSalesConcentration(sales),
    brandDistribution: brandDistribution(sales),
    paymentMethodDistribution: paymentMethodDistribution(sales),
    installmentDistribution: installmentDistribution(sales),
    dailyRevenue: daily,
    weeklyRevenue: weeklyRevenue(daily),
    monthlyRevenue: monthlyRevenue(daily),
    pendingReceivablesAmount: pendingAmount,
    overdueReceivablesAmount: overdueAmount,
    settledReceivablesAmount: settledAmount,
    settledReceivablesPercentage: percentageOf(settledAmount, settledAmount + overdueAmount + pendingAmount),
    averageSettlementDays: averageSettlementDays(receivables),
    advancedAmount,
    advancedPercentage: percentageOf(advancedAmount, settledAmount),
  };
}
