import { addDaysIso } from "@/lib/utils/timezone";
import { classifyReceivableState, type ReceivableState } from "@/lib/integrations/stone/receivableState";
import type { NormalizedConciliation } from "@/lib/integrations/stone/normalize";

/**
 * Agenda Financeira própria do Santa Monica OS (Sprint 7.0, Z3, decisão do usuário) — pertence ao
 * Diretor Financeiro; a Stone só fornece os fatos-base (`expectedPaymentDate`, `settledPaymentDate`,
 * valores, parcela, tipo). Função pura: opera só sobre `NormalizedConciliation[]` já buscados
 * (por `multiDay.ts`) — nunca faz I/O, nunca projeta recebível além do que está realmente presente
 * nos arquivos processados. Somas em centavos (nunca float impreciso).
 *
 * Nomenclatura deliberada: `netAmountExpected`/`settledAmount` — nunca "dinheiro disponível" nem
 * "saldo da conta" (decisão do usuário, reforçada desde o Z1/Z2).
 */

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function centsToAmount(cents: number): number {
  return cents / 100;
}

function sumCents(values: number[]): number {
  return values.reduce((sum, v) => sum + toCents(v), 0);
}

interface ReceivableRecord {
  saleExternalReference: string;
  installmentNumber: number;
  expectedPaymentDate: string | null;
  grossAmountCents: number;
  netAmountCents: number;
  settledPaymentDate: string | null;
  settledAmountCents: number | null;
  state: ReceivableState;
}

function receivableKey(saleExternalReference: string, installmentNumber: number): string {
  return `${saleExternalReference}#${installmentNumber}`;
}

/**
 * Liga cada parcela prevista (`expectedPayments`, de `FinancialTransactions`) à sua liquidação
 * real, quando existir (`settlements`, de `FinancialTransactionsAccounts`) e ao seu status de
 * cancelamento/chargeback (de `sales`/`chargebacks`) — tudo já normalizado, nenhum cálculo novo
 * de dado bruto, só religação de fatos já extraídos.
 */
function buildReceivables(days: NormalizedConciliation[], dataAvailableThroughDate: string): ReceivableRecord[] {
  const settlementByKey = new Map<string, { date: string; amountCents: number }>();
  for (const day of days) {
    for (const s of day.settlements) {
      settlementByKey.set(receivableKey(s.saleExternalReference, s.installmentNumber), { date: s.settledPaymentDate, amountCents: toCents(s.netAmount) });
    }
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

  const receivables: ReceivableRecord[] = [];
  const seen = new Set<string>();
  for (const day of days) {
    for (const ep of day.expectedPayments) {
      const key = receivableKey(ep.saleExternalReference, ep.installmentNumber);
      if (seen.has(key)) continue; // defensivo — a mesma parcela nunca deveria aparecer em dois arquivos diferentes
      seen.add(key);

      const settlement = settlementByKey.get(key) ?? null;
      const cancelled = totalCancelledSales.has(ep.saleExternalReference) || partiallyCancelledKeys.has(key);
      const chargeback = chargedBackKeys.has(key);

      const state = classifyReceivableState({
        expectedPaymentDate: ep.expectedPaymentDate,
        settledPaymentDate: settlement?.date ?? null,
        cancelled,
        chargeback,
        dataAvailableThroughDate,
      });

      receivables.push({
        saleExternalReference: ep.saleExternalReference,
        installmentNumber: ep.installmentNumber,
        expectedPaymentDate: ep.expectedPaymentDate,
        grossAmountCents: toCents(ep.grossAmount),
        netAmountCents: toCents(ep.amount),
        settledPaymentDate: settlement?.date ?? null,
        settledAmountCents: settlement?.amountCents ?? null,
        state,
      });
    }
  }
  return receivables;
}

export interface DailyScheduleBucket {
  date: string;
  grossAmountExpected: number;
  feesExpected: number;
  netAmountExpected: number;
  settledAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  /** Vendas distintas com ao menos uma parcela prevista nesta data. */
  paymentCount: number;
  /** Total de parcelas previstas nesta data (uma venda parcelada pode contribuir mais de uma). */
  installmentCount: number;
  earlySettledCount: number;
  overdueCount: number;
  pendingCount: number;
  settledCount: number;
  /** `settledAmount - netAmountExpected` — nunca escondida, mesmo quando pequena (seção 11, decisão do usuário). */
  differenceExpectedVsSettled: number;
}

function buildDailySchedule(receivables: ReceivableRecord[]): DailyScheduleBucket[] {
  const byDate = new Map<string, ReceivableRecord[]>();
  for (const r of receivables) {
    if (!r.expectedPaymentDate) continue;
    const list = byDate.get(r.expectedPaymentDate);
    if (list) list.push(r);
    else byDate.set(r.expectedPaymentDate, [r]);
  }

  const buckets: DailyScheduleBucket[] = [];
  for (const [date, list] of byDate) {
    const settledList = list.filter((r) => r.settledAmountCents !== null);
    const pendingList = list.filter((r) => r.state === "scheduled" || r.state === "due_today");
    const overdueList = list.filter((r) => r.state === "overdue");
    const earlyList = list.filter((r) => r.state === "settled_early");

    const grossCents = list.reduce((sum, r) => sum + r.grossAmountCents, 0);
    const netCents = list.reduce((sum, r) => sum + r.netAmountCents, 0);
    const settledCents = settledList.reduce((sum, r) => sum + (r.settledAmountCents ?? 0), 0);
    const pendingCents = pendingList.reduce((sum, r) => sum + r.netAmountCents, 0);
    const overdueCents = overdueList.reduce((sum, r) => sum + r.netAmountCents, 0);

    buckets.push({
      date,
      grossAmountExpected: centsToAmount(grossCents),
      feesExpected: centsToAmount(grossCents - netCents),
      netAmountExpected: centsToAmount(netCents),
      settledAmount: centsToAmount(settledCents),
      pendingAmount: centsToAmount(pendingCents),
      overdueAmount: centsToAmount(overdueCents),
      paymentCount: new Set(list.map((r) => r.saleExternalReference)).size,
      installmentCount: list.length,
      earlySettledCount: earlyList.length,
      overdueCount: overdueList.length,
      pendingCount: pendingList.length,
      settledCount: settledList.length,
      differenceExpectedVsSettled: centsToAmount(settledCents - netCents),
    });
  }
  return buckets.sort((a, b) => a.date.localeCompare(b.date));
}

export type FinancialScheduleCurveLabel = "hoje" | "proximos_7_dias" | "proximos_30_dias" | "mes_atual";

export interface FinancialScheduleCurve {
  label: FinancialScheduleCurveLabel;
  windowStart: string;
  windowEnd: string;
  grossAmountExpected: number;
  netAmountExpected: number;
  settledAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  feesExpected: number;
  receivableCount: number;
  pendingCount: number;
  settledCount: number;
}

function aggregateCurve(label: FinancialScheduleCurveLabel, windowStart: string, windowEnd: string, daily: DailyScheduleBucket[]): FinancialScheduleCurve {
  const inWindow = daily.filter((b) => b.date >= windowStart && b.date <= windowEnd);
  return {
    label,
    windowStart,
    windowEnd,
    grossAmountExpected: centsToAmount(sumCents(inWindow.map((b) => b.grossAmountExpected))),
    netAmountExpected: centsToAmount(sumCents(inWindow.map((b) => b.netAmountExpected))),
    settledAmount: centsToAmount(sumCents(inWindow.map((b) => b.settledAmount))),
    pendingAmount: centsToAmount(sumCents(inWindow.map((b) => b.pendingAmount))),
    overdueAmount: centsToAmount(sumCents(inWindow.map((b) => b.overdueAmount))),
    feesExpected: centsToAmount(sumCents(inWindow.map((b) => b.feesExpected))),
    receivableCount: inWindow.reduce((sum, b) => sum + b.installmentCount, 0),
    pendingCount: inWindow.reduce((sum, b) => sum + b.pendingCount, 0),
    settledCount: inWindow.reduce((sum, b) => sum + b.settledCount, 0),
  };
}

function lastDayOfMonthIso(dateIso: string): string {
  const [y, m] = dateIso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

export interface FinancialSchedule {
  dataAvailableThroughDate: string;
  daily: DailyScheduleBucket[];
  curves: FinancialScheduleCurve[];
  limitations: string[];
}

/**
 * `days` deve conter só os arquivos já buscados (`multiDay.ts`) — nunca uma projeção além deles.
 * `todayIso` é a data de "hoje" real (para ancorar as janelas 7/30 dias e o mês atual);
 * `dataAvailableThroughDate` é a última data com visibilidade real de liquidação (considera a
 * defasagem do arquivo diário) — usada só para classificar atraso, nunca para as janelas da curva.
 */
export function buildFinancialSchedule(days: NormalizedConciliation[], todayIso: string, dataAvailableThroughDate: string): FinancialSchedule {
  const receivables = buildReceivables(days, dataAvailableThroughDate);
  const daily = buildDailySchedule(receivables);

  const curves: FinancialScheduleCurve[] = [
    aggregateCurve("hoje", todayIso, todayIso, daily),
    aggregateCurve("proximos_7_dias", todayIso, addDaysIso(todayIso, 7), daily),
    aggregateCurve("proximos_30_dias", todayIso, addDaysIso(todayIso, 30), daily),
    aggregateCurve("mes_atual", `${todayIso.slice(0, 7)}-01`, lastDayOfMonthIso(todayIso), daily),
  ];

  const limitations = [`Cobre só os recebíveis presentes nos ${days.length} arquivo(s) diário(s) já processado(s) — parcelas de vendas capturadas fora dessa janela não aparecem aqui, nunca uma projeção ou estimativa de venda futura.`];
  if (receivables.length === 0) limitations.push("Nenhum recebível encontrado nos arquivos processados.");

  return { dataAvailableThroughDate, daily, curves, limitations };
}
