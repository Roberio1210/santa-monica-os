import { buildSourceFileName } from "@/lib/integrations/stone/persistence/mapping";
import type { StonePaymentGroupRecord } from "@/lib/integrations/stone/persistence/types";
import type { NormalizedConciliation } from "@/lib/integrations/stone/normalize";

/**
 * Missão 81 (FASE 2) — formação determinística de grupos de repasse Stone (`stone_payment_groups`),
 * a partir da identidade real comprovada na Missão 77: `paymentId`. Pura — nenhum I/O aqui, mesma
 * separação de `crossDaySettlement.ts`. Quem persiste os grupos e associa vendas é `importRun.ts`.
 *
 * Regras (Missão 78/81, decisão do usuário — nunca inventar agrupamento):
 * - agrupamento é EXCLUSIVAMENTE por `paymentId` — nunca data+valor, nunca `acquirerTransactionKey`;
 * - `totalAmount` é sempre o valor OFICIAL de `Payments[].TotalAmount` (`day.realizedPayments`,
 *   já normalizado) — nunca a soma das parcelas calculada por nós;
 * - `paymentDate` é o `settledPaymentDate` comum às parcelas daquele `paymentId` — se divergir
 *   entre parcelas do mesmo grupo, é CONFLITO, nunca resolvido por maioria/primeiro/último;
 * - settlement sem `paymentId` nunca forma grupo nem é associado a um;
 * - `paymentId` sem `realizedPayment` correspondente (não deveria acontecer segundo a doc da
 *   Stone, mas defensivo) também é CONFLITO — nunca criamos grupo sem o valor oficial.
 */

export type PaymentGroupBuildConflict =
  | { type: "payment_date_mismatch"; paymentId: string; dates: string[] }
  | { type: "missing_realized_payment"; paymentId: string }
  | { type: "duplicate_realized_payment_mismatch"; paymentId: string };

export interface BuildPaymentGroupsResult {
  groups: StonePaymentGroupRecord[];
  conflicts: PaymentGroupBuildConflict[];
}

export function buildPaymentGroupsForDay(day: NormalizedConciliation, importRunId: string | null): BuildPaymentGroupsResult {
  const conflicts: PaymentGroupBuildConflict[] = [];

  // `day.realizedPayments` já é a fonte oficial (`Payments[].TotalAmount`) — deduplica por
  // paymentId, marcando conflito só quando duas entradas do MESMO paymentId divergem de verdade
  // (nunca escolhendo "primeira"/"última" nesse caso — o paymentId inteiro fica sem grupo).
  const realizedByPaymentId = new Map<string, { amount: number; walletTypeId: number }>();
  const brokenPaymentIds = new Set<string>();
  for (const p of day.realizedPayments) {
    const existing = realizedByPaymentId.get(p.paymentId);
    if (!existing) {
      realizedByPaymentId.set(p.paymentId, { amount: p.amount, walletTypeId: p.walletTypeId });
      continue;
    }
    const amountMatches = Math.abs(existing.amount - p.amount) < 0.005;
    const walletMatches = existing.walletTypeId === p.walletTypeId;
    if (!amountMatches || !walletMatches) {
      brokenPaymentIds.add(p.paymentId);
      conflicts.push({ type: "duplicate_realized_payment_mismatch", paymentId: p.paymentId });
    }
  }

  const settlementsByPaymentId = new Map<string, string[]>(); // paymentId -> datas distintas vistas
  for (const s of day.settlements) {
    if (s.paymentId === null) continue;
    if (!settlementsByPaymentId.has(s.paymentId)) settlementsByPaymentId.set(s.paymentId, []);
    const dates = settlementsByPaymentId.get(s.paymentId)!;
    if (!dates.includes(s.settledPaymentDate)) dates.push(s.settledPaymentDate);
  }

  const sourceFile = buildSourceFileName(day.establishmentCode, day.referenceDate, day.layout);
  const groups: StonePaymentGroupRecord[] = [];

  for (const [paymentId, dates] of settlementsByPaymentId) {
    if (brokenPaymentIds.has(paymentId)) continue; // já reportado acima, nunca forma grupo

    if (dates.length > 1) {
      conflicts.push({ type: "payment_date_mismatch", paymentId, dates });
      continue;
    }

    const realized = realizedByPaymentId.get(paymentId);
    if (!realized) {
      conflicts.push({ type: "missing_realized_payment", paymentId });
      continue;
    }

    groups.push({
      paymentId,
      paymentDate: dates[0],
      totalAmount: realized.amount,
      walletTypeId: realized.walletTypeId,
      sourceFile,
      importRunId,
    });
  }

  return { groups, conflicts };
}
