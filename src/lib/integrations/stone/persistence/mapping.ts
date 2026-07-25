import { createHash } from "node:crypto";
import type { NormalizedConciliation, NormalizedSaleTransaction } from "@/lib/integrations/stone/normalize";
import { buildTransactionExternalKey } from "@/lib/integrations/stone/identity";
import { classifyReceivableState } from "@/lib/integrations/stone/receivableState";
import type { StoneNormalizedTransactionRecord, StoneTransactionEventType } from "@/lib/integrations/stone/persistence/types";

/**
 * Converte fatos já normalizados (Z2/Z3, `normalize.ts`) em linhas persistíveis por parcela
 * (Z4). Pura — nenhum I/O aqui, só religação e cálculo do que já foi extraído em checkpoints
 * anteriores. Reaproveita `identity.ts` (Z2) e `classifyReceivableState` (Z3) sem redesenhar
 * nenhuma das duas decisões.
 */

function receivableKey(saleExternalReference: string, installmentNumber: number): string {
  return `${saleExternalReference}#${installmentNumber}`;
}

/** Nome do arquivo confirmado na documentação oficial: `{stoneCode}-{referenceDate}-{layout}-without_reversals.xml`. */
export function buildSourceFileName(establishmentCode: string, referenceDate: string, layout: "XML2_2" | "XML2_4"): string {
  return `${establishmentCode}-${referenceDate.replaceAll("-", "")}-${layout}-without_reversals.xml`;
}

/** Hash determinístico do conteúdo já normalizado (nunca o XML/gzip bruto) — suficiente para detectar reprocessamento de conteúdo idêntico vs. alterado. */
export function hashNormalizedConciliation(day: NormalizedConciliation): string {
  return createHash("sha256").update(JSON.stringify(day)).digest("hex");
}

export function buildNormalizedTransactionRecords(day: NormalizedConciliation, dataAvailableThroughDate: string, importRunId: string | null): StoneNormalizedTransactionRecord[] {
  const saleByKey = new Map<string, NormalizedSaleTransaction>();
  for (const sale of day.sales) saleByKey.set(sale.acquirerTransactionKey, sale);

  const settlementByKey = new Map<string, { date: string; amount: number }>();
  for (const s of day.settlements) settlementByKey.set(receivableKey(s.saleExternalReference, s.installmentNumber), { date: s.settledPaymentDate, amount: s.netAmount });

  const totalCancelledSales = new Set<string>();
  const partiallyCancelledKeys = new Set<string>();
  for (const sale of day.sales) {
    for (const c of sale.cancellations) {
      if (c.installmentNumber === null) totalCancelledSales.add(sale.acquirerTransactionKey);
      else partiallyCancelledKeys.add(receivableKey(sale.acquirerTransactionKey, c.installmentNumber));
    }
  }

  const chargedBackKeys = new Set<string>();
  for (const cb of day.chargebacks) chargedBackKeys.add(receivableKey(cb.saleExternalReference, cb.installmentNumber));

  const sourceFile = buildSourceFileName(day.establishmentCode, day.referenceDate, day.layout);
  const records: StoneNormalizedTransactionRecord[] = [];

  for (const ep of day.expectedPayments) {
    const sale = saleByKey.get(ep.saleExternalReference);
    if (!sale) continue; // defensivo — todo expectedPayment vem de uma venda do mesmo arquivo, nunca deveria faltar

    const key = receivableKey(ep.saleExternalReference, ep.installmentNumber);
    const settlement = settlementByKey.get(key) ?? null;
    const cancelled = totalCancelledSales.has(ep.saleExternalReference) || partiallyCancelledKeys.has(key);
    const chargeback = chargedBackKeys.has(key);

    const receivableState = classifyReceivableState({
      expectedPaymentDate: ep.expectedPaymentDate,
      settledPaymentDate: settlement?.date ?? null,
      cancelled,
      chargeback,
      dataAvailableThroughDate,
    });

    const eventType: StoneTransactionEventType = chargeback ? "chargeback" : cancelled ? "cancellation" : "sale";

    records.push({
      externalKey: buildTransactionExternalKey({
        acquirerTransactionKey: sale.acquirerTransactionKey,
        authorizationCode: sale.authorizationCode,
        initiatorTransactionKey: sale.raw.initiatorTransactionKey,
        establishmentCode: day.establishmentCode,
        terminalSerialNumber: sale.terminalSerialNumber,
        capturedAt: sale.capturedAt,
        installmentNumber: ep.installmentNumber,
        amount: ep.amount,
      }),
      acquirerTransactionKey: sale.acquirerTransactionKey,
      authorizationCode: sale.authorizationCode,
      initiatorTransactionKey: sale.raw.initiatorTransactionKey,
      establishmentCode: day.establishmentCode,
      terminalSerialNumber: sale.terminalSerialNumber,
      capturedAt: sale.capturedAt,
      installmentNumber: ep.installmentNumber,
      grossAmount: ep.grossAmount,
      feeAmount: Math.max(0, ep.grossAmount - ep.amount),
      netAmount: ep.amount,
      paymentMethod: sale.cardFlow,
      brandId: String(sale.brandId),
      eventType,
      receivableState,
      expectedPaymentDate: ep.expectedPaymentDate,
      settledPaymentDate: settlement?.date ?? null,
      settledAmount: settlement?.amount ?? null,
      sourceFile,
      importRunId,
    });
  }

  return records;
}
