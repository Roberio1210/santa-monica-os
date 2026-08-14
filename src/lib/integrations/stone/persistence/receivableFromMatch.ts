import "server-only";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import type { FinancePaymentMethod } from "@/lib/finance/types";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import type { StoneReceivableStateRecord } from "@/lib/integrations/stone/persistence/types";

/**
 * Missão Financeiro V2 (Prioridade 1) — ponte entre uma conciliação Stone×JumpPark já revisada
 * e o módulo Contas a Receber, reaproveitando integralmente a infraestrutura existente
 * (`createAccountsReceivable`/`recordReceivablePayment`, que já cria `payments`/`cash_movements`
 * atomicamente). Nunca chamada em lote/automaticamente — só a partir de um clique explícito do
 * operador em UM resultado de conciliação por vez (`confirmReconciliationReceivableAction`).
 *
 * Regra de segurança (missão): EXACT/HIGH_CONFIDENCE (aqui: `exact_match`/`probable_match`) podem
 * virar recebível, mas SEMPRE por confirmação humana explícita desta ação — nunca silenciosamente
 * a partir do sync. REVIEW/AMBIGUOUS/UNMATCHED nunca são elegíveis (rejeitados abaixo,
 * `not_eligible`). Nunca funde/baixa por reconciliação com `confidence: "low"`.
 */

const ELIGIBLE_MATCH_TYPES = new Set(["exact_match", "probable_match"]);
/** Transação Stone que nunca representa receita real — nunca vira recebível. */
const BLOCKED_RECEIVABLE_STATES = new Set<StoneReceivableStateRecord>(["cancelled", "reversed", "chargeback"]);
/** Nome real da conta Stone já seeded em `financial_accounts` (ver `src/lib/finance/data/financial-accounts.ts`) — o tipo de domínio `FinancialAccount` não expõe `externalId`, então o vínculo é pelo nome estável. */
const STONE_ACCOUNT_NAME = "Stone";

const KNOWN_PAYMENT_METHODS: FinancePaymentMethod[] = ["dinheiro", "debito", "credito", "pix", "boleto", "transferencia", "outro"];

function toFinancePaymentMethod(raw: string | null): FinancePaymentMethod {
  return raw && (KNOWN_PAYMENT_METHODS as string[]).includes(raw) ? (raw as FinancePaymentMethod) : "desconhecido";
}

export type ConfirmReconciliationReceivableStatus = "created" | "already_exists" | "not_eligible";

export interface ConfirmReconciliationAsReceivableResult {
  status: ConfirmReconciliationReceivableStatus;
  accountsReceivableId: string | null;
  /** true quando a Stone já reportava liquidação real da parcela — a baixa foi registrada junto, sem redigitação. */
  settled: boolean;
  reason: string | null;
}

export async function confirmReconciliationAsReceivable(reconciliationResultId: string, performedBy: string): Promise<ConfirmReconciliationAsReceivableResult> {
  const responsible = performedBy.trim();
  if (!responsible) return { status: "not_eligible", accountsReceivableId: null, settled: false, reason: "Responsável é obrigatório." };

  const stoneRepo = getStonePersistenceRepository();
  const financeRepo = getFinanceRepository();

  const match = await stoneRepo.getReconciliationResultById(reconciliationResultId);
  if (!match) return { status: "not_eligible", accountsReceivableId: null, settled: false, reason: "Resultado de conciliação não encontrado." };

  if (!ELIGIBLE_MATCH_TYPES.has(match.matchType)) {
    return {
      status: "not_eligible",
      accountsReceivableId: null,
      settled: false,
      reason: `Tipo "${match.matchType}" nunca vira recebível por esta ação — só exact_match/probable_match, sempre com confirmação humana explícita. Ambíguos/não encontrados/duplicados continuam em revisão manual.`,
    };
  }
  if (!match.stoneSaleExternalKey) {
    return { status: "not_eligible", accountsReceivableId: null, settled: false, reason: "Este resultado não tem transação Stone vinculada." };
  }

  // Idempotência: reprocessar/reconfirmar o mesmo resultado nunca cria um segundo recebível.
  const externalId = `stone-reconciliation:${match.naturalKey}`;
  const existing = await financeRepo.getAccountsReceivableByExternalId(externalId);
  if (existing) return { status: "already_exists", accountsReceivableId: existing.id, settled: existing.status === "paid", reason: null };

  const transaction = await stoneRepo.getNormalizedTransactionByExternalKey(match.stoneSaleExternalKey);
  if (!transaction) {
    return { status: "not_eligible", accountsReceivableId: null, settled: false, reason: "Transação Stone normalizada não encontrada — sincronize novamente antes de confirmar." };
  }
  if (BLOCKED_RECEIVABLE_STATES.has(transaction.receivableState)) {
    return {
      status: "not_eligible",
      accountsReceivableId: null,
      settled: false,
      reason: `Transação Stone está "${transaction.receivableState}" — cancelamento/estorno/chargeback nunca vira recebível.`,
    };
  }

  const accounts = await financeRepo.listFinancialAccounts();
  const stoneAccount = accounts.find((a) => a.name === STONE_ACCOUNT_NAME) ?? null;
  const paymentMethod = toFinancePaymentMethod(transaction.paymentMethod);
  const competenceDate = transaction.capturedAt.slice(0, 10);
  const dueDate = transaction.expectedPaymentDate ?? competenceDate;
  const installmentLabel = transaction.installmentNumber > 1 ? ` (parcela ${transaction.installmentNumber})` : "";

  const [receivable] = await financeRepo.createAccountsReceivable({
    description: `Venda Stone${match.jumpparkOrderExternalId ? ` — ordem JumpPark ${match.jumpparkOrderExternalId}` : ""}${installmentLabel}`,
    financialAccountId: stoneAccount?.id ?? null,
    competenceDate,
    dueDate,
    expectedAmount: transaction.grossAmount,
    paymentMethod,
    status: "open",
    responsibleName: responsible,
    notes: `Criado a partir de conciliação Stone×JumpPark confirmada manualmente por ${responsible} (tipo: ${match.matchType}, confiança: ${match.confidence}). Chave da transação Stone: ${transaction.acquirerTransactionKey}. Nunca gerado automaticamente — sempre por clique explícito nesta ação.`,
    externalId,
  });

  // A Stone já reportar liquidação real da parcela é um fato da adquirente (não uma inferência
  // probabilística) — registra a baixa junto, evitando redigitação (missão, Prioridade 1, seção 7).
  let settled = false;
  if (transaction.settledPaymentDate && transaction.settledAmount !== null && (transaction.receivableState === "settled_on_time" || transaction.receivableState === "settled_early")) {
    await financeRepo.recordReceivablePayment({
      accountsReceivableId: receivable.id,
      amount: transaction.grossAmount,
      paidAt: transaction.settledPaymentDate,
      method: paymentMethod,
      financialAccountId: stoneAccount?.id ?? null,
      feeAmount: transaction.feeAmount,
      notes: `Baixa automática a partir do arquivo Stone — liquidação já confirmada pela adquirente (${transaction.receivableState}).`,
    });
    settled = true;
  }

  return { status: "created", accountsReceivableId: receivable.id, settled, reason: null };
}
