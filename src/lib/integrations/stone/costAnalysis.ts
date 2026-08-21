import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";
import { mapStoneBrandIdToFeeTableBrand, type StoneFeeTableBrand } from "@/lib/integrations/stone/feeTable";

/**
 * Missão Financeiro V6/V6.1 — custo real Stone por venda (MDR + antecipação D+1 + outras taxas).
 * Funções puras (nenhum I/O aqui), consomem `StoneNormalizedTransactionRecord[]` já carregados
 * por `capturedAt` (data da VENDA, nunca a esperada/liquidada — ver `repository.ts`).
 *
 * Missão V6.1 (Fase 1/2) descobriu que a Stone envia, no MESMO arquivo já sincronizado, campos
 * oficiais até então descartados por `persistence/mapping.ts`: `Installment.MdrAmount`/`SaleFee`
 * (lado `FinancialTransactions`, sempre presente na venda) e `AdvanceRateAmount` (lado
 * `FinancialTransactionsAccounts`, container de liquidação). Esses campos agora são persistidos
 * (`mdrAmountStone`/`saleFeeCombined`/`advanceFeeAmountStone`) e têm PRIORIDADE sobre qualquer
 * valor derivado por subtração — nunca o contrário. Hierarquia por parcela, da mais para a menos
 * autoritativa (nunca inventa/estima o que não está numa destas fontes):
 *
 *   1. `settledAmount` presente (liquidação real já importada) → líquido recebido = o valor
 *      exatamente liquidado; custo total = bruto - liquidado. O mais forte de todos: dinheiro que
 *      realmente entrou, sem depender de somar componentes arredondados.
 *   2. `saleFeeCombined` presente (Stone cobra 1 taxa única combinando MDR+antecipação, FeeType 2)
 *      → custo total = essa taxa única; MDR e antecipação NÃO são separáveis nesse regime (nunca
 *      forçar uma divisão arbitrária de um valor que a própria Stone não divide).
 *   3. `mdrAmountStone` presente (FeeType separado) → MDR = valor oficial; antecipação = oficial
 *      (`advanceFeeAmountStone`) quando presente, senão desconhecida.
 *   4. Nenhum campo oficial presente (realidade de 100% das parcelas reais até 21/08/2026,
 *      confirmada por auditoria) → mesmo comportamento da V6: MDR = `feeAmount` (bruto-líquido,
 *      real porém derivado), antecipação desconhecida, custo total = só MDR (rotulado como tal,
 *      nunca apresentado como custo total completo).
 *
 * "Outras taxas" só é reportada como número quando IDENTIFICÁVEL por subtração entre dois valores
 * reais (ex.: custo total via liquidação real menos MDR oficial menos antecipação oficial) — caso
 * contrário fica `null` com status explícito, nunca 0 assumido nem estimativa.
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

/** Fonte de cada componente do custo — sempre exibida junto do número (decisão do gestor: nunca um valor sem proveniência). */
export type StoneCostFieldSource = "liquidacao_real" | "oficial_stone" | "derivado" | "indisponivel";

export interface StoneInstallmentCostBreakdown {
  grossAmount: number;
  /** `null` só quando a taxa vem embutida numa cobrança única (`saleFeeCombined`) — nesse regime não existe MDR separável. */
  mdrAmount: number | null;
  mdrSource: StoneCostFieldSource;
  advanceFeeAmount: number | null;
  advanceSource: StoneCostFieldSource;
  /** Só preenchido quando sobra um resíduo identificável entre custo total (via liquidação real) e MDR+antecipação oficiais — nunca 0 assumido por padrão. */
  otherFeesAmount: number | null;
  otherFeesSource: StoneCostFieldSource;
  /** MDR + antecipação + outras taxas (ou a taxa combinada, ou bruto-liquidado quando há liquidação real) — sempre um número, mas só é o custo total DE VERDADE quando `totalCostComplete === true`. */
  totalCostAmount: number;
  /** `false` = valor acima é só um piso conhecido (ex.: só MDR), nunca o custo total real da parcela. */
  totalCostComplete: boolean;
  netReceivedAmount: number;
  netReceivedComplete: boolean;
}

/** Decompõe uma parcela seguindo a hierarquia de autoridade documentada no topo do arquivo. Pura, nunca estima o que não está numa das fontes reais. */
export function computeInstallmentCostBreakdown(record: StoneNormalizedTransactionRecord): StoneInstallmentCostBreakdown {
  // Reaproveita o `feeAmount` já persistido (sempre = max(0, gross-net), calculado uma única vez em `persistence/mapping.ts`) em vez de recalcular aqui — nunca duas fontes de verdade para o mesmo número.
  const derivedMdr = record.feeAmount;

  if (record.settledAmount !== null) {
    const totalCostCents = toCents(record.grossAmount) - toCents(record.settledAmount);
    const mdrAmount = record.mdrAmountStone ?? derivedMdr;
    const mdrSource: StoneCostFieldSource = record.mdrAmountStone !== null ? "oficial_stone" : "derivado";
    const advanceFeeAmount = record.advanceFeeAmountStone ?? centsToAmount(toCents(record.netAmount) - toCents(record.settledAmount));
    const advanceSource: StoneCostFieldSource = record.advanceFeeAmountStone !== null ? "oficial_stone" : "derivado";
    const residualCents = totalCostCents - toCents(mdrAmount) - toCents(advanceFeeAmount);
    const otherFeesIdentifiable = mdrSource === "oficial_stone" || record.advanceFeeAmountStone !== null;
    return {
      grossAmount: record.grossAmount,
      mdrAmount,
      mdrSource,
      advanceFeeAmount,
      advanceSource,
      otherFeesAmount: otherFeesIdentifiable ? centsToAmount(residualCents) : null,
      otherFeesSource: otherFeesIdentifiable ? "liquidacao_real" : "indisponivel",
      totalCostAmount: centsToAmount(totalCostCents),
      totalCostComplete: true,
      netReceivedAmount: record.settledAmount,
      netReceivedComplete: true,
    };
  }

  if (record.saleFeeCombined !== null) {
    return {
      grossAmount: record.grossAmount,
      mdrAmount: null,
      mdrSource: "indisponivel",
      advanceFeeAmount: null,
      advanceSource: "indisponivel",
      otherFeesAmount: null,
      otherFeesSource: "indisponivel",
      totalCostAmount: record.saleFeeCombined,
      totalCostComplete: true,
      netReceivedAmount: centsToAmount(toCents(record.grossAmount) - toCents(record.saleFeeCombined)),
      netReceivedComplete: true,
    };
  }

  if (record.mdrAmountStone !== null) {
    const mdrAmount = record.mdrAmountStone;
    if (record.advanceFeeAmountStone !== null) {
      const totalCostCents = toCents(mdrAmount) + toCents(record.advanceFeeAmountStone);
      return {
        grossAmount: record.grossAmount,
        mdrAmount,
        mdrSource: "oficial_stone",
        advanceFeeAmount: record.advanceFeeAmountStone,
        advanceSource: "oficial_stone",
        otherFeesAmount: null,
        otherFeesSource: "indisponivel",
        totalCostAmount: centsToAmount(totalCostCents),
        totalCostComplete: true,
        netReceivedAmount: centsToAmount(toCents(record.grossAmount) - totalCostCents),
        netReceivedComplete: true,
      };
    }
    return {
      grossAmount: record.grossAmount,
      mdrAmount,
      mdrSource: "oficial_stone",
      advanceFeeAmount: null,
      advanceSource: "indisponivel",
      otherFeesAmount: null,
      otherFeesSource: "indisponivel",
      totalCostAmount: mdrAmount,
      totalCostComplete: false,
      netReceivedAmount: centsToAmount(toCents(record.grossAmount) - toCents(mdrAmount)),
      netReceivedComplete: false,
    };
  }

  return {
    grossAmount: record.grossAmount,
    mdrAmount: derivedMdr,
    mdrSource: "derivado",
    advanceFeeAmount: null,
    advanceSource: "indisponivel",
    otherFeesAmount: null,
    otherFeesSource: "indisponivel",
    totalCostAmount: derivedMdr,
    totalCostComplete: false,
    netReceivedAmount: record.netAmount,
    netReceivedComplete: false,
  };
}

/** Compat V6 — antecipação isolada da parcela (`null` quando indisponível). Mantido para os call-sites/testes existentes; internamente delega para `computeInstallmentCostBreakdown`. */
export function computeInstallmentAdvanceFee(record: StoneNormalizedTransactionRecord): number | null {
  return computeInstallmentCostBreakdown(record).advanceFeeAmount;
}

export type StoneAdvanceDataStatus = "completo" | "parcial" | "indisponivel";

function classifyCompletionStatus(completeRows: number, totalRows: number): StoneAdvanceDataStatus {
  if (totalRows === 0 || completeRows === 0) return "indisponivel";
  if (completeRows === totalRows) return "completo";
  return "parcial";
}

/** Acumulador interno — evita reimplementar a mesma soma em centavos em cada função de agregação. */
interface CostAccumulator {
  installmentRowsCount: number;
  distinctSaleKeys: Set<string>;
  grossCents: number;
  mdrCents: number;
  mdrRowsCount: number;
  advanceCents: number;
  advanceRowsCount: number;
  otherFeesCents: number;
  otherFeesRowsCount: number;
  totalCostCents: number;
  totalCostCompleteRowsCount: number;
  netReceivedCents: number;
  netReceivedCompleteRowsCount: number;
}

function newAccumulator(): CostAccumulator {
  return {
    installmentRowsCount: 0,
    distinctSaleKeys: new Set(),
    grossCents: 0,
    mdrCents: 0,
    mdrRowsCount: 0,
    advanceCents: 0,
    advanceRowsCount: 0,
    otherFeesCents: 0,
    otherFeesRowsCount: 0,
    totalCostCents: 0,
    totalCostCompleteRowsCount: 0,
    netReceivedCents: 0,
    netReceivedCompleteRowsCount: 0,
  };
}

function accumulate(acc: CostAccumulator, record: StoneNormalizedTransactionRecord): void {
  const breakdown = computeInstallmentCostBreakdown(record);
  acc.installmentRowsCount += 1;
  acc.distinctSaleKeys.add(record.acquirerTransactionKey);
  acc.grossCents += toCents(record.grossAmount);
  if (breakdown.mdrAmount !== null) {
    acc.mdrCents += toCents(breakdown.mdrAmount);
    acc.mdrRowsCount += 1;
  }
  if (breakdown.advanceFeeAmount !== null) {
    acc.advanceCents += toCents(breakdown.advanceFeeAmount);
    acc.advanceRowsCount += 1;
  }
  if (breakdown.otherFeesAmount !== null) {
    acc.otherFeesCents += toCents(breakdown.otherFeesAmount);
    acc.otherFeesRowsCount += 1;
  }
  acc.totalCostCents += toCents(breakdown.totalCostAmount);
  if (breakdown.totalCostComplete) acc.totalCostCompleteRowsCount += 1;
  acc.netReceivedCents += toCents(breakdown.netReceivedAmount);
  if (breakdown.netReceivedComplete) acc.netReceivedCompleteRowsCount += 1;
}

export interface StoneCostFigures {
  installmentRowsCount: number;
  salesCount: number;
  grossAmountTotal: number;
  /** Soma de MDR nas parcelas onde é separável (exclui parcelas com taxa combinada — ver `mdrRowsCount`). */
  mdrFeeTotal: number;
  mdrRowsCount: number;
  advanceFeeConfirmedTotal: number;
  advanceRowsCount: number;
  advanceDataStatus: StoneAdvanceDataStatus;
  /** Só não-nulo quando identificável por subtração entre valores reais (liquidação real vs. MDR+antecipação oficiais). */
  otherFeesTotal: number | null;
  otherFeesRowsCount: number;
  otherFeesStatus: StoneAdvanceDataStatus;
  /** MDR + antecipação + outras taxas (ou liquidação real, ou taxa combinada) — sempre a melhor estimativa real disponível por parcela, nunca inventada. */
  totalConfirmedCost: number;
  totalCostDataStatus: StoneAdvanceDataStatus;
  /** Explica a composição do total acima — obrigatório exibir junto do número. */
  totalConfirmedCostLabel: string;
  netReceivedTotal: number;
  netReceivedDataStatus: StoneAdvanceDataStatus;
  /** MDR confirmado / bruto — sempre calculável a partir das parcelas com MDR separável. `null` só quando `grossAmountTotal === 0`. */
  effectiveMdrRatePercent: number | null;
  /** Custo total / bruto — só quando 100% das parcelas do período têm custo total completo (`totalCostDataStatus === "completo"`); nunca uma taxa parcial disfarçada de total. */
  effectiveTotalRatePercent: number | null;
}

function figuresFromAccumulator(acc: CostAccumulator): StoneCostFigures {
  const advanceDataStatus = classifyCompletionStatus(acc.advanceRowsCount, acc.installmentRowsCount);
  const otherFeesStatus = classifyCompletionStatus(acc.otherFeesRowsCount, acc.installmentRowsCount);
  const totalCostDataStatus = classifyCompletionStatus(acc.totalCostCompleteRowsCount, acc.installmentRowsCount);
  const netReceivedDataStatus = classifyCompletionStatus(acc.netReceivedCompleteRowsCount, acc.installmentRowsCount);
  const grossAmountTotal = centsToAmount(acc.grossCents);
  const mdrFeeTotal = centsToAmount(acc.mdrCents);

  const totalConfirmedCostLabel =
    totalCostDataStatus === "completo"
      ? "Custo total confirmado (100% das parcelas do período com liquidação real, taxa combinada ou MDR+antecipação oficiais da Stone)"
      : totalCostDataStatus === "parcial"
        ? `Custo total confirmado — ${acc.totalCostCompleteRowsCount} de ${acc.installmentRowsCount} parcela(s) totalmente decompostas; as demais entram só pelo MDR (piso conhecido, nunca o custo total real dessas parcelas)`
        : "Custo total confirmado — apenas MDR de todas as parcelas (nenhuma tem antecipação/liquidação real disponível ainda; este número é um piso, não o custo total real)";

  return {
    installmentRowsCount: acc.installmentRowsCount,
    salesCount: acc.distinctSaleKeys.size,
    grossAmountTotal,
    mdrFeeTotal,
    mdrRowsCount: acc.mdrRowsCount,
    advanceFeeConfirmedTotal: centsToAmount(acc.advanceCents),
    advanceRowsCount: acc.advanceRowsCount,
    advanceDataStatus,
    otherFeesTotal: acc.otherFeesRowsCount > 0 ? centsToAmount(acc.otherFeesCents) : null,
    otherFeesRowsCount: acc.otherFeesRowsCount,
    otherFeesStatus,
    totalConfirmedCost: centsToAmount(acc.totalCostCents),
    totalCostDataStatus,
    totalConfirmedCostLabel,
    netReceivedTotal: centsToAmount(acc.netReceivedCents),
    netReceivedDataStatus,
    effectiveMdrRatePercent: grossAmountTotal !== 0 && acc.mdrRowsCount > 0 ? Math.round((mdrFeeTotal / grossAmountTotal) * 10000) / 100 : null,
    effectiveTotalRatePercent: grossAmountTotal !== 0 && totalCostDataStatus === "completo" ? Math.round((acc.totalCostCents / acc.grossCents) * 10000) / 100 : null,
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

/** Para cada R$ 100 vendidos, quanto a Santa Mônica paga à Stone — só quando o custo total do período está 100% confirmado (nunca uma projeção a partir de dado parcial). */
export function computeCostPerHundredReais(summary: StoneCostPeriodSummary): number | null {
  if (summary.totalCostDataStatus !== "completo" || summary.grossAmountTotal === 0) return null;
  return Math.round((summary.totalConfirmedCost / summary.grossAmountTotal) * 100 * 100) / 100;
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

/** O dia com maior custo total confirmado (MDR + antecipação/outras taxas onde disponível) — `null` se não houver nenhuma venda no período. */
export function findWorstCostDay(dailyRows: StoneCostDailyRow[]): StoneCostDailyRow | null {
  if (dailyRows.length === 0) return null;
  return dailyRows.reduce((worst, row) => (row.totalConfirmedCost > worst.totalConfirmedCost ? row : worst));
}

/** O dia com menor custo total confirmado (entre os que têm venda) — útil para "melhor modalidade/dia" no relatório. `null` se vazio. */
export function findBestCostDay(dailyRows: StoneCostDailyRow[]): StoneCostDailyRow | null {
  if (dailyRows.length === 0) return null;
  return dailyRows.reduce((best, row) => (row.totalConfirmedCost < best.totalConfirmedCost ? row : best));
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

/** A modalidade com maior taxa MDR efetiva (entre as que têm MDR calculável) — usada pelo relatório "pior modalidade". `null` se nenhuma tiver taxa calculável. */
export function findWorstModality(modalityRows: StoneCostModalityRow[]): StoneCostModalityRow | null {
  const withRate = modalityRows.filter((m) => m.effectiveMdrRatePercent !== null);
  if (withRate.length === 0) return null;
  return withRate.reduce((worst, row) => ((row.effectiveMdrRatePercent as number) > (worst.effectiveMdrRatePercent as number) ? row : worst));
}

/** A modalidade com menor taxa MDR efetiva (entre as que têm MDR calculável) — usada pelo relatório "melhor modalidade". `null` se nenhuma tiver taxa calculável. */
export function findBestModality(modalityRows: StoneCostModalityRow[]): StoneCostModalityRow | null {
  const withRate = modalityRows.filter((m) => m.effectiveMdrRatePercent !== null);
  if (withRate.length === 0) return null;
  return withRate.reduce((best, row) => ((row.effectiveMdrRatePercent as number) < (best.effectiveMdrRatePercent as number) ? row : best));
}

export interface StoneCostTransactionDetailRow {
  externalKey: string;
  acquirerTransactionKey: string;
  capturedAt: string;
  eventType: StoneNormalizedTransactionRecord["eventType"];
  modality: StoneCostModality;
  installmentNumber: number;
  grossAmount: number;
  breakdown: StoneInstallmentCostBreakdown;
  expectedPaymentDate: string | null;
  settledPaymentDate: string | null;
  receivableState: StoneNormalizedTransactionRecord["receivableState"];
}

/** Uma linha por parcela — base da visão "detalhe por venda". Inclui todos os `eventType` (a UI decide o que filtrar/exibir). */
export function buildTransactionDetailRows(records: StoneNormalizedTransactionRecord[]): StoneCostTransactionDetailRow[] {
  return records
    .map((r) => ({
      externalKey: r.externalKey,
      acquirerTransactionKey: r.acquirerTransactionKey,
      capturedAt: r.capturedAt,
      eventType: r.eventType,
      modality: classifyModality(r),
      installmentNumber: r.installmentNumber,
      grossAmount: r.grossAmount,
      breakdown: computeInstallmentCostBreakdown(r),
      expectedPaymentDate: r.expectedPaymentDate,
      settledPaymentDate: r.settledPaymentDate,
      receivableState: r.receivableState,
    }))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.installmentNumber - b.installmentNumber);
}

/** Agrupa as linhas de detalhe por venda (`acquirerTransactionKey`) — usado pela visão "abrir uma venda e ver as N parcelas". */
export function groupDetailRowsBySale(rows: StoneCostTransactionDetailRow[]): Map<string, StoneCostTransactionDetailRow[]> {
  const bySale = new Map<string, StoneCostTransactionDetailRow[]>();
  for (const row of rows) {
    const bucket = bySale.get(row.acquirerTransactionKey) ?? [];
    bucket.push(row);
    bySale.set(row.acquirerTransactionKey, bucket);
  }
  return bySale;
}
