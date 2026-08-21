import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";
import { mapStoneBrandIdToFeeTableBrand, type StoneFeeTableBrand } from "@/lib/integrations/stone/feeTable";

/**
 * Missão Financeiro V6 — custo real Stone por venda (MDR + antecipação D+1). Funções puras
 * (nenhum I/O aqui), consomem `StoneNormalizedTransactionRecord[]` já carregados por
 * `capturedAt` (data da VENDA, nunca a esperada/liquidada — ver `repository.ts`).
 *
 * Modelo de dois níveis, decisão explícita do gestor ("nunca inventar/estimar taxa"):
 *   1. MDR (`feeAmount`) — SEMPRE real, presente em toda parcela de venda. Fonte da verdade.
 *   2. Antecipação — só existe onde `settledAmount` foi persistido (liquidação já ocorreu e foi
 *      importada). Calculada como `netAmount - settledAmount` (o que a Stone reteve a mais por
 *      pagar D+1 em vez do prazo padrão da bandeira/parcelas). Nas parcelas sem `settledAmount`,
 *      o custo de antecipação é DESCONHECIDO — nunca extrapolado a partir das que têm.
 *
 * "Outras taxas" (mencionadas na tabela contratual como categoria) não têm campo próprio em
 * `stone_normalized_transactions` — o XML bruto da Stone tem outros campos (`SaleFee` completo),
 * mas só MDR e a liquidação sobrevivem à persistência (`persistence/mapping.ts`). Reportado como
 * indisponível, nunca estimado.
 *
 * Somas monetárias em centavos (inteiros) até o resultado final — mesmo padrão de
 * `reconciliationSummary.ts` — para nunca acumular erro de ponto flutuante.
 */

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function centsToAmount(cents: number): number {
  return cents / 100;
}

export type StoneCostMethod = "debito" | "credito" | "outro";

export interface StoneCostModality {
  method: StoneCostMethod;
  brand: StoneFeeTableBrand | null;
  installments: number;
}

export function classifyModality(record: StoneNormalizedTransactionRecord): StoneCostModality {
  const method = record.paymentMethod === "debito" || record.paymentMethod === "credito" ? record.paymentMethod : "outro";
  return { method, brand: mapStoneBrandIdToFeeTableBrand(record.brandId), installments: record.installmentNumber };
}

function modalityKey(modality: StoneCostModality): string {
  return `${modality.method}|${modality.brand ?? "sem_bandeira_mapeada"}|${modality.installments}`;
}

/** Antecipação da parcela — `null` quando ainda não liquidada (dado real ainda não existe, nunca estimado). */
export function computeInstallmentAdvanceFee(record: StoneNormalizedTransactionRecord): number | null {
  if (record.settledAmount === null) return null;
  return centsToAmount(toCents(record.netAmount) - toCents(record.settledAmount));
}

export type StoneAdvanceDataStatus = "completo" | "parcial" | "indisponivel";

function classifyAdvanceDataStatus(settledRows: number, totalRows: number): StoneAdvanceDataStatus {
  if (totalRows === 0 || settledRows === 0) return "indisponivel";
  if (settledRows === totalRows) return "completo";
  return "parcial";
}

/** Acumulador interno — evita reimplementar a mesma soma em centavos em cada função de agregação. */
interface CostAccumulator {
  installmentRowsCount: number;
  distinctSaleKeys: Set<string>;
  grossCents: number;
  mdrFeeCents: number;
  netExpectedCents: number;
  settledRowsCount: number;
  settledAmountCents: number;
  advanceFeeConfirmedCents: number;
}

function newAccumulator(): CostAccumulator {
  return { installmentRowsCount: 0, distinctSaleKeys: new Set(), grossCents: 0, mdrFeeCents: 0, netExpectedCents: 0, settledRowsCount: 0, settledAmountCents: 0, advanceFeeConfirmedCents: 0 };
}

function accumulate(acc: CostAccumulator, record: StoneNormalizedTransactionRecord): void {
  acc.installmentRowsCount += 1;
  acc.distinctSaleKeys.add(record.acquirerTransactionKey);
  acc.grossCents += toCents(record.grossAmount);
  acc.mdrFeeCents += toCents(record.feeAmount);
  acc.netExpectedCents += toCents(record.netAmount);
  if (record.settledAmount !== null) {
    acc.settledRowsCount += 1;
    acc.settledAmountCents += toCents(record.settledAmount);
    acc.advanceFeeConfirmedCents += toCents(record.netAmount) - toCents(record.settledAmount);
  }
}

export interface StoneCostFigures {
  installmentRowsCount: number;
  salesCount: number;
  grossAmountTotal: number;
  mdrFeeTotal: number;
  netExpectedTotal: number;
  settledRowsCount: number;
  unsettledRowsCount: number;
  settledAmountTotal: number;
  advanceFeeConfirmedTotal: number;
  advanceDataStatus: StoneAdvanceDataStatus;
  /** MDR (sempre real) + antecipação confirmada (só das parcelas liquidadas). Nunca inclui antecipação estimada. */
  totalConfirmedCost: number;
  /** Explica a composição do total acima — obrigatório exibir junto do número (decisão do gestor: nunca um valor sem a proveniência). */
  totalConfirmedCostLabel: string;
  /** MDR / bruto — sempre calculável. `null` só quando `grossAmountTotal === 0`. */
  effectiveMdrRatePercent: number | null;
  /** (MDR + antecipação confirmada) / bruto — só quando 100% das parcelas do período têm liquidação; caso contrário `null` (nunca uma taxa efetiva parcial disfarçada de total). */
  effectiveTotalRatePercent: number | null;
}

function figuresFromAccumulator(acc: CostAccumulator): StoneCostFigures {
  const advanceDataStatus = classifyAdvanceDataStatus(acc.settledRowsCount, acc.installmentRowsCount);
  const totalConfirmedCostCents = acc.mdrFeeCents + acc.advanceFeeConfirmedCents;
  const grossAmountTotal = centsToAmount(acc.grossCents);
  const mdrFeeTotal = centsToAmount(acc.mdrFeeCents);

  const totalConfirmedCostLabel =
    advanceDataStatus === "completo"
      ? "Custo total confirmado (MDR + antecipação — 100% das parcelas do período já liquidadas)"
      : advanceDataStatus === "parcial"
        ? `Custo total confirmado — MDR de todas as ${acc.installmentRowsCount} parcelas + antecipação confirmada apenas das ${acc.settledRowsCount} já liquidadas (${acc.installmentRowsCount - acc.settledRowsCount} ainda sem liquidação importada)`
        : "Custo total confirmado — apenas MDR (nenhuma parcela do período tem liquidação importada; composição de antecipação indisponível)";

  return {
    installmentRowsCount: acc.installmentRowsCount,
    salesCount: acc.distinctSaleKeys.size,
    grossAmountTotal,
    mdrFeeTotal,
    netExpectedTotal: centsToAmount(acc.netExpectedCents),
    settledRowsCount: acc.settledRowsCount,
    unsettledRowsCount: acc.installmentRowsCount - acc.settledRowsCount,
    settledAmountTotal: centsToAmount(acc.settledAmountCents),
    advanceFeeConfirmedTotal: centsToAmount(acc.advanceFeeConfirmedCents),
    advanceDataStatus,
    totalConfirmedCost: centsToAmount(totalConfirmedCostCents),
    totalConfirmedCostLabel,
    effectiveMdrRatePercent: grossAmountTotal !== 0 ? Math.round((mdrFeeTotal / grossAmountTotal) * 10000) / 100 : null,
    effectiveTotalRatePercent: grossAmountTotal !== 0 && advanceDataStatus === "completo" ? Math.round((totalConfirmedCostCents / acc.grossCents) * 10000) / 100 : null,
  };
}

export interface StoneEventBreakdown {
  count: number;
  grossAmountTotal: number;
}

function eventBreakdown(records: StoneNormalizedTransactionRecord[]): StoneEventBreakdown {
  return { count: records.length, grossAmountTotal: centsToAmount(records.reduce((sum, r) => sum + toCents(r.grossAmount), 0)) };
}

export interface StoneCostPeriodSummary extends StoneCostFigures {
  periodFrom: string;
  periodTo: string;
  cancellations: StoneEventBreakdown;
  chargebacks: StoneEventBreakdown;
  /** Sempre 0 nos dados atuais — PIX Stone não passa pelo layout de conciliação com cartão (`normalize.ts`/`mapping.ts` só produzem "debito"/"credito"/"outro"); mantido explícito para nunca esconder essa lacuna. */
  pixSalesCount: number;
}

/**
 * Resumo agregado do período. `records` deve conter TODAS as parcelas cujo `capturedAt` cai no
 * período (qualquer `eventType`) — a função separa venda de cancelamento/chargeback internamente,
 * nunca soma os três juntos nos totais principais (evita contar duas vezes o mesmo dinheiro).
 */
export function summarizePeriodCost(records: StoneNormalizedTransactionRecord[], periodFrom: string, periodTo: string): StoneCostPeriodSummary {
  const sales = records.filter((r) => r.eventType === "sale");
  const cancellations = records.filter((r) => r.eventType === "cancellation");
  const chargebacks = records.filter((r) => r.eventType === "chargeback" || r.eventType === "chargeback_refund");

  const acc = newAccumulator();
  for (const r of sales) accumulate(acc, r);

  return {
    ...figuresFromAccumulator(acc),
    periodFrom,
    periodTo,
    cancellations: eventBreakdown(cancellations),
    chargebacks: eventBreakdown(chargebacks),
    pixSalesCount: sales.filter((r) => r.paymentMethod === "pix").length,
  };
}

export interface StoneCostDailyRow extends StoneCostFigures {
  date: string;
}

/** Uma linha por dia de venda (`capturedAt` local, primeiros 10 caracteres do ISO), ordenada cronologicamente. Só considera `eventType === "sale"`. */
export function buildDailyCostBreakdown(records: StoneNormalizedTransactionRecord[]): StoneCostDailyRow[] {
  const byDate = new Map<string, CostAccumulator>();
  for (const r of records) {
    if (r.eventType !== "sale") continue;
    const date = r.capturedAt.slice(0, 10);
    const acc = byDate.get(date) ?? newAccumulator();
    accumulate(acc, r);
    byDate.set(date, acc);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, acc]) => ({ date, ...figuresFromAccumulator(acc) }));
}

/** O dia com maior custo total confirmado (MDR + antecipação onde disponível) — `null` se não houver nenhuma venda no período. */
export function findWorstCostDay(dailyRows: StoneCostDailyRow[]): StoneCostDailyRow | null {
  if (dailyRows.length === 0) return null;
  return dailyRows.reduce((worst, row) => (row.totalConfirmedCost > worst.totalConfirmedCost ? row : worst));
}

export interface StoneCostModalityRow extends StoneCostFigures {
  modality: StoneCostModality;
}

/** Uma linha por combinação (forma de pagamento × bandeira × nº de parcelas). Só `eventType === "sale"`. */
export function buildModalityCostBreakdown(records: StoneNormalizedTransactionRecord[]): StoneCostModalityRow[] {
  const byModality = new Map<string, { modality: StoneCostModality; acc: CostAccumulator }>();
  for (const r of records) {
    if (r.eventType !== "sale") continue;
    const modality = classifyModality(r);
    const key = modalityKey(modality);
    const entry = byModality.get(key) ?? { modality, acc: newAccumulator() };
    accumulate(entry.acc, r);
    byModality.set(key, entry);
  }
  return [...byModality.values()]
    .sort((a, b) => b.acc.grossCents - a.acc.grossCents)
    .map(({ modality, acc }) => ({ modality, ...figuresFromAccumulator(acc) }));
}

export interface StoneCostTransactionDetailRow {
  externalKey: string;
  acquirerTransactionKey: string;
  capturedAt: string;
  eventType: StoneNormalizedTransactionRecord["eventType"];
  modality: StoneCostModality;
  grossAmount: number;
  mdrFeeAmount: number;
  netExpectedAmount: number;
  settledAmount: number | null;
  advanceFeeAmount: number | null;
  expectedPaymentDate: string | null;
  settledPaymentDate: string | null;
  receivableState: StoneNormalizedTransactionRecord["receivableState"];
}

/** Uma linha por parcela — base da visão "detalhe por venda" (Fase 6). Inclui todos os `eventType` (a UI decide o que filtrar/exibir). */
export function buildTransactionDetailRows(records: StoneNormalizedTransactionRecord[]): StoneCostTransactionDetailRow[] {
  return records
    .map((r) => ({
      externalKey: r.externalKey,
      acquirerTransactionKey: r.acquirerTransactionKey,
      capturedAt: r.capturedAt,
      eventType: r.eventType,
      modality: classifyModality(r),
      grossAmount: r.grossAmount,
      mdrFeeAmount: r.feeAmount,
      netExpectedAmount: r.netAmount,
      settledAmount: r.settledAmount,
      advanceFeeAmount: computeInstallmentAdvanceFee(r),
      expectedPaymentDate: r.expectedPaymentDate,
      settledPaymentDate: r.settledPaymentDate,
      receivableState: r.receivableState,
    }))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}
