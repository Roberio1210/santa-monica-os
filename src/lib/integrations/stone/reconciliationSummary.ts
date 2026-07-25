import "server-only";
import { getConciliationFile } from "@/lib/integrations/stone/service";
import { normalizeConciliation } from "@/lib/integrations/stone/normalize";
import { buildTransactionExternalKey } from "@/lib/integrations/stone/identity";
import type { StoneResultStatus } from "@/lib/integrations/stone/types";

/**
 * Resumo de conciliação financeira (Sprint 7.0, Z2) — o único ponto que o restante do sistema
 * (capacidade `stone_reconciliation_summary`, `tools/executor.ts`) deve chamar. Orquestra
 * `service.ts` (I/O) + `normalize.ts` (renomeação/organização) + `identity.ts` (chave externa) e
 * devolve fatos financeiros já agregados — nenhum Diretor precisa conhecer `WalletPosition`,
 * `PrevisionPaymentDate`, XML, gzip ou credenciais.
 *
 * Somas monetárias são feitas em centavos (inteiros) e só convertidas de volta a decimal no
 * resultado final — nunca uma soma de `number` decimal acumulando erro de ponto flutuante.
 */

const SUPPORTED_LAYOUTS = ["XML2_2", "XML2_4"] as const;
type SupportedLayout = (typeof SUPPORTED_LAYOUTS)[number];

function isSupportedLayout(value: string): value is SupportedLayout {
  return (SUPPORTED_LAYOUTS as readonly string[]).includes(value);
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function sumCents(amounts: number[]): number {
  return amounts.reduce((sum, a) => sum + toCents(a), 0);
}

function centsToAmount(cents: number): number {
  return cents / 100;
}

/** Mais de 3 dias entre a data de referência do arquivo e "agora" — a posição ainda é real, só velha. Nunca usado para esconder o dado, só para sinalizar cautela (`status: "stale_data"`). */
const STALE_POSITION_THRESHOLD_DAYS = 3;

export function isPositionStale(referenceDateIso: string, now: Date): boolean {
  const referenceDate = new Date(`${referenceDateIso}T00:00:00Z`);
  if (Number.isNaN(referenceDate.getTime())) return false;
  const diffDays = (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > STALE_POSITION_THRESHOLD_DAYS;
}

/**
 * Fato de posição financeira — sempre presente na resposta (nunca `null` solto), com `status`
 * próprio, independente do `status` geral do resumo (decisão do usuário: "se não houver
 * WalletPosition, status = no_data" — é um status por fato, não uma falha do arquivo inteiro).
 */
export interface StoneFinancialPositionFact {
  status: StoneResultStatus;
  amount: number | null;
  referenceDate: string | null;
  processedAt: string;
  origin: string;
  limitation: string;
}

export interface StoneReconciliationSummary {
  status: StoneResultStatus;
  error: string | null;
  limitations: string[];

  referenceDate: string | null;
  generationDateTime: string | null;
  processedAt: string;
  establishmentCode: string | null;
  terminalSerialNumbers: string[];

  transactionCount: number;
  grossAmountTotal: number;
  netAmountTotal: number;
  feesTotal: number;
  debitTransactionCount: number;
  creditTransactionCount: number;
  installmentSaleCount: number;
  installmentCount: number;

  expectedPaymentsCount: number;
  expectedPaymentsAmountTotal: number;
  realizedPaymentsCount: number;
  realizedPaymentsAmountTotal: number;

  cancellationCount: number;
  refundCount: number;
  chargebackCount: number;
  advanceCount: number;

  /** Sempre `false` neste checkpoint — PIX é um arquivo/fluxo separado (ver `pixNote`), nunca incluído no arquivo diário principal. */
  pixIncluded: boolean;
  pixNote: string;

  financialPosition: StoneFinancialPositionFact;

  /** Uma chave por parcela — nunca persistida neste checkpoint, só gerada para provar determinismo (ver `identity.ts`). */
  transactionExternalKeys: string[];
}

const PIX_NOTE = "PIX não está incluído no arquivo diário de conciliação — é um arquivo/fluxo assíncrono separado (POST .../conciliation-file/pix/{referenceDate} + webhook), ainda não conectado neste checkpoint (ver docs/stone-integration-architecture.md).";

function emptySummary(overrides: Partial<StoneReconciliationSummary> & { status: StoneResultStatus; processedAt: string }): StoneReconciliationSummary {
  return {
    status: overrides.status,
    error: overrides.error ?? null,
    limitations: overrides.limitations ?? [],
    referenceDate: overrides.referenceDate ?? null,
    generationDateTime: null,
    processedAt: overrides.processedAt,
    establishmentCode: null,
    terminalSerialNumbers: [],
    transactionCount: 0,
    grossAmountTotal: 0,
    netAmountTotal: 0,
    feesTotal: 0,
    debitTransactionCount: 0,
    creditTransactionCount: 0,
    installmentSaleCount: 0,
    installmentCount: 0,
    expectedPaymentsCount: 0,
    expectedPaymentsAmountTotal: 0,
    realizedPaymentsCount: 0,
    realizedPaymentsAmountTotal: 0,
    cancellationCount: 0,
    refundCount: 0,
    chargebackCount: 0,
    advanceCount: 0,
    pixIncluded: false,
    pixNote: PIX_NOTE,
    financialPosition: { status: overrides.status, amount: null, referenceDate: overrides.referenceDate ?? null, processedAt: overrides.processedAt, origin: "Stone — arquivo de conciliação diário", limitation: overrides.error ?? "Sem dado disponível." },
    transactionExternalKeys: [],
  };
}

/**
 * `referenceDate` no formato ISO `AAAA-MM-DD`. Nunca lança — toda falha vira `status`/`error`
 * honestos, mesmo padrão do resto do sistema desde a Sprint 4/5.
 */
export async function buildReconciliationSummary(referenceDate: string, layout: string = "XML2_4"): Promise<StoneReconciliationSummary> {
  const processedAt = new Date().toISOString();

  if (!isSupportedLayout(layout)) {
    return emptySummary({ status: "temporary_failure", error: `Layout "${layout}" não é suportado.`, limitations: ["Só os layouts XML2_2 e XML2_4 são suportados pela documentação oficial da Stone."], processedAt, referenceDate });
  }

  const fileResult = await getConciliationFile(referenceDate, layout);
  if (fileResult.status !== "ok" || !fileResult.file) {
    return emptySummary({ status: fileResult.status, error: fileResult.error, limitations: fileResult.limitations, processedAt, referenceDate: fileResult.referenceDate });
  }

  const normalized = normalizeConciliation(fileResult.file);

  const transactionExternalKeys = normalized.sales.flatMap((sale) =>
    sale.raw.installments.map((installment) =>
      buildTransactionExternalKey({
        acquirerTransactionKey: sale.acquirerTransactionKey,
        authorizationCode: sale.authorizationCode,
        initiatorTransactionKey: sale.raw.initiatorTransactionKey,
        establishmentCode: normalized.establishmentCode,
        terminalSerialNumber: sale.terminalSerialNumber,
        capturedAt: sale.capturedAt,
        installmentNumber: installment.installmentNumber,
        amount: installment.netAmount,
      }),
    ),
  );

  const debitTransactionCount = normalized.sales.filter((s) => s.cardFlow === "debito").length;
  const creditTransactionCount = normalized.sales.filter((s) => s.cardFlow === "credito").length;
  const installmentSaleCount = normalized.sales.filter((s) => s.installmentsCount > 1).length;
  const installmentCount = normalized.sales.reduce((sum, s) => sum + s.raw.installments.length, 0);

  const grossAmountTotal = centsToAmount(sumCents(normalized.sales.map((s) => s.grossAmount)));
  const netAmountTotal = centsToAmount(sumCents(normalized.sales.map((s) => s.netAmount)));
  const feesTotal = centsToAmount(sumCents(normalized.sales.map((s) => s.feeAmount)));

  const expectedPaymentsAmountTotal = centsToAmount(sumCents(normalized.expectedPayments.map((p) => p.amount)));
  const realizedPaymentsAmountTotal = centsToAmount(sumCents(normalized.realizedPayments.map((p) => p.amount)));

  const cancellationCount = normalized.sales.reduce((sum, s) => sum + s.cancellations.length, 0);

  const limitations = [...fileResult.limitations];
  let financialPosition: StoneFinancialPositionFact;
  if (normalized.financialPositions.length === 0) {
    financialPosition = {
      status: "no_data",
      amount: null,
      referenceDate: normalized.referenceDate,
      processedAt,
      origin: "Stone — arquivo de conciliação diário",
      limitation: "Nenhuma posição financeira (WalletPosition) neste arquivo — ausente no Layout 2.2 ou não habilitada para este dia.",
    };
  } else {
    const totalPosition = centsToAmount(sumCents(normalized.financialPositions.map((p) => p.amount)));
    const stale = isPositionStale(normalized.referenceDate, new Date(processedAt));
    financialPosition = {
      status: stale ? "stale_data" : "ok",
      amount: totalPosition,
      referenceDate: normalized.referenceDate,
      processedAt,
      origin: "Stone — arquivo de conciliação diário",
      limitation: stale
        ? `Esta é a última posição financeira processada pela Stone, referente a ${normalized.referenceDate} — mais de ${STALE_POSITION_THRESHOLD_DAYS} dias atrás, tratar com cautela. Nunca representa saldo em tempo real.`
        : "Esta é a última posição financeira processada pela Stone, não um saldo em tempo real.",
    };
  }

  return {
    status: "ok",
    error: null,
    limitations,
    referenceDate: normalized.referenceDate,
    generationDateTime: normalized.generationDateTime,
    processedAt,
    establishmentCode: normalized.establishmentCode,
    terminalSerialNumbers: normalized.terminalSerialNumbers,
    transactionCount: normalized.sales.length,
    grossAmountTotal,
    netAmountTotal,
    feesTotal,
    debitTransactionCount,
    creditTransactionCount,
    installmentSaleCount,
    installmentCount,
    expectedPaymentsCount: normalized.expectedPayments.length,
    expectedPaymentsAmountTotal,
    realizedPaymentsCount: normalized.realizedPayments.length,
    realizedPaymentsAmountTotal,
    cancellationCount,
    refundCount: normalized.chargebackRefunds.length,
    chargebackCount: normalized.chargebacks.length,
    advanceCount: normalized.advances.length,
    pixIncluded: false,
    pixNote: PIX_NOTE,
    financialPosition,
    transactionExternalKeys,
  };
}
