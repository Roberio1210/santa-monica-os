import "server-only";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { getBankStatementRepository } from "@/lib/finance/bankStatement/repository-factory";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import { matchStatementLineAgainstStoneSettlements } from "@/lib/finance/bankStatement/reconciliation";
import { initialStatusForType } from "@/lib/finance/bankStatement/classification";
import { STONE_SETTLEMENT_LINE_TYPES } from "@/lib/finance/bankStatement/types";
import type { AccountTransferType } from "@/lib/finance/types";
import type { BankStatementLine, BankStatementLineType, ProcessBankStatementLineInput } from "@/lib/finance/bankStatement/types";

/**
 * Missão Financeiro V2.1 (Fase B/D) — tenta conciliar automaticamente uma linha "recebimento de
 * vendas"/"antecipação" contra `stone_normalized_transactions` (liquidação real). NUNCA cria
 * `accounts_receivable`/receita nova: quando bate, só confirma e cria o `cash_movements`
 * correspondente (o dinheiro realmente entrou na conta) com `nature: null` — fica de fora da DRE
 * até uma classificação explícita (comportamento padrão seguro de `resolveClassification`,
 * `dre.ts:130`), nunca contado como receita automaticamente.
 */
export async function attemptStoneSettlementReconciliation(lineId: string, financialAccountId: string): Promise<BankStatementLine> {
  const bankRepo = getBankStatementRepository();
  const line = await bankRepo.getLine(lineId);
  if (!line) throw new Error(`Linha de extrato não encontrada: ${lineId}`);
  if (!STONE_SETTLEMENT_LINE_TYPES.includes(line.type)) throw new Error(`Linha do tipo "${line.type}" não é elegível a conciliação automática Stone.`);
  if (line.linkedCashMovementId) return line; // já processada — idempotente

  const stoneRepo = getStonePersistenceRepository();
  const settledTransactions = await stoneRepo.listNormalizedTransactionsBySettledDateRange(line.date, line.date);
  const match = matchStatementLineAgainstStoneSettlements(line.amount, line.date, settledTransactions);

  const updated = await bankRepo.updateLine({
    id: lineId,
    status: match.status,
    matchedStoneAmount: match.matchedStoneAmount,
    matchedStoneDivergence: match.matchedStoneDivergence,
    reconciliationNote: match.note,
  });

  if (match.status === "conciliado") {
    const financeRepo = getFinanceRepository();
    const movement = await financeRepo.createCashMovement({
      date: line.date,
      type: "entrada",
      nature: null, // nunca "receita" — a venda já foi reconhecida via JumpPark/Stone, isto só confirma a liquidação em caixa.
      amount: line.amount,
      description: `${line.description} (conciliado com extrato Stone — receita já reconhecida, não lançar novamente)`,
      financialAccountId,
      documentRef: line.counterparty,
      notes: match.note,
    });
    return bankRepo.updateLine({ id: lineId, linkedCashMovementId: movement.id, processedBy: "sistema (conciliação automática Stone)" });
  }

  return updated;
}

/**
 * Mapeia o tipo de linha decidido pelo operador para o `AccountTransferType` real (Fase B, casos
 * 3 e 4) — "aporte"/"retirada" nunca são inferidos automaticamente na importação (ver
 * `classification.ts`), só confirmados aqui por decisão explícita.
 */
const TRANSFER_LINE_TYPES: ProcessBankStatementLineInput["resultingType"][] = ["transferencia_entrada", "transferencia_saida", "aporte", "retirada"];

function transferTypeFor(resultingType: ProcessBankStatementLineInput["resultingType"]): AccountTransferType {
  if (resultingType === "aporte") return "aporte_socios";
  if (resultingType === "retirada") return "retirada";
  return "transferencia";
}

/**
 * Decisão explícita do operador (Fase B/G) — transforma a linha num `cash_movements` real ou
 * numa `account_transfers` real, nunca ambos, nunca automático. Idempotente: reprocessar uma
 * linha já processada lança erro claro em vez de criar um segundo movimento.
 */
export async function processBankStatementLine(input: ProcessBankStatementLineInput, financialAccountId: string): Promise<BankStatementLine> {
  if (!input.performedBy.trim()) throw new Error("Informe quem está processando esta linha.");

  const bankRepo = getBankStatementRepository();
  const line = await bankRepo.getLine(input.lineId);
  if (!line) throw new Error(`Linha de extrato não encontrada: ${input.lineId}`);
  if (line.linkedCashMovementId || line.linkedAccountTransferId) throw new Error("Esta linha já foi processada — não é possível processar novamente.");

  const financeRepo = getFinanceRepository();
  const isTransfer = TRANSFER_LINE_TYPES.includes(input.resultingType);

  if (isTransfer) {
    const transferType = transferTypeFor(input.resultingType);
    const transfer = await financeRepo.recordAccountTransfer({
      type: transferType,
      fromAccountId: line.direction === "saida" ? financialAccountId : (input.counterAccountId ?? null),
      toAccountId: line.direction === "entrada" ? financialAccountId : (input.counterAccountId ?? null),
      amount: line.amount,
      date: line.date,
      description: line.description,
      responsibleName: input.performedBy,
      notes: input.notes,
    });
    return bankRepo.updateLine({
      id: input.lineId,
      status: "conciliado",
      type: input.resultingType,
      linkedAccountTransferId: transfer.id,
      processedBy: input.performedBy,
      reconciliationNote: "Transferência/aporte/retirada — nunca conta como receita/despesa.",
    });
  }

  // Vínculo com um recebível/pagável JÁ EXISTENTE — a baixa correta é recordReceivablePayment/
  // recordPayablePayment (gera settlement + cash_movement de forma consistente com o resto do
  // sistema), nunca um createCashMovement solto que perderia esse vínculo.
  if (input.linkedAccountsReceivableId) {
    await financeRepo.recordReceivablePayment({
      accountsReceivableId: input.linkedAccountsReceivableId,
      amount: line.amount,
      paidAt: line.date,
      method: "desconhecido",
      financialAccountId,
      notes: input.notes ?? `Baixa a partir da conciliação do extrato bancário (linha ${line.id}).`,
    });
    return bankRepo.updateLine({
      id: input.lineId,
      status: "conciliado",
      type: input.resultingType,
      linkedAccountsReceivableId: input.linkedAccountsReceivableId,
      processedBy: input.performedBy,
    });
  }

  if (input.linkedAccountsPayableId) {
    await financeRepo.recordPayablePayment({
      accountsPayableId: input.linkedAccountsPayableId,
      amount: line.amount,
      paidAt: line.date,
      method: "desconhecido",
      financialAccountId,
      notes: input.notes ?? `Baixa a partir da conciliação do extrato bancário (linha ${line.id}).`,
    });
    return bankRepo.updateLine({
      id: input.lineId,
      status: "conciliado",
      type: input.resultingType,
      linkedAccountsPayableId: input.linkedAccountsPayableId,
      processedBy: input.performedBy,
    });
  }

  const movement = await financeRepo.createCashMovement({
    date: line.date,
    type: line.direction === "entrada" ? "entrada" : "saida",
    nature: cashMovementNatureForResultingType(input.resultingType),
    amount: line.amount,
    description: line.description,
    financialAccountId,
    categoryId: input.categoryId ?? null,
    supplierId: input.supplierId ?? null,
    partnerId: input.partnerId ?? null,
    responsibleName: input.performedBy,
    notes: input.notes,
  });

  return bankRepo.updateLine({
    id: input.lineId,
    status: "conciliado",
    type: input.resultingType,
    categoryId: input.categoryId ?? null,
    supplierId: input.supplierId ?? null,
    partnerId: input.partnerId ?? null,
    linkedCashMovementId: movement.id,
    processedBy: input.performedBy,
  });
}

function cashMovementNatureForResultingType(type: ProcessBankStatementLineInput["resultingType"]) {
  switch (type) {
    case "tarifa":
      return "tarifa" as const;
    case "mensalidade_stone":
      return "tarifa" as const;
    case "devolucao":
      return "estorno" as const;
    default:
      return null; // pix/pagamento/recebimento seguem para a fila de classificação existente — nunca decidido aqui sem regra explícita.
  }
}

export async function markBankStatementLineIgnored(lineId: string, reason: string, performedBy: string): Promise<BankStatementLine> {
  if (!reason.trim()) throw new Error("Informe a justificativa para ignorar esta linha — nunca sem motivo auditável.");
  const bankRepo = getBankStatementRepository();
  const line = await bankRepo.getLine(lineId);
  if (!line) throw new Error(`Linha de extrato não encontrada: ${lineId}`);
  return bankRepo.updateLine({ id: lineId, status: "ignorado", reconciliationNote: reason, processedBy: performedBy });
}

export interface CorrectLineTypeInput {
  lineId: string;
  correctedType: BankStatementLineType;
  /** Evidência que justifica a correção (ex.: "linha vizinha 794 é o pagamento real da Stylus; rótulo de bandeira Maestro|Débito confirma venda Stone") — nunca uma correção sem motivo auditável. */
  reason: string;
  performedBy: string;
}

/**
 * Missão Financeiro V2.2 (Fase D/G item 7D) — corrige o `type` de uma linha quando há evidência
 * de que o classificador inicial (ou o próprio parser do PDF) errou (ex.: rótulo de bandeira de
 * cartão "Maestro | Débito" que na real é uma liquidação de venda Stone, não um pagamento ao
 * fornecedor cujo nome vazou de uma linha vizinha). Sempre grava auditoria (antes/depois +
 * motivo). Só permitida ANTES da linha virar um movimento real (`cash_movements`/
 * `account_transfers`) — depois disso a correção precisa ser uma reversão explícita, não uma
 * reclassificação silenciosa.
 */
export async function correctLineType(input: CorrectLineTypeInput): Promise<BankStatementLine> {
  if (!input.reason.trim()) throw new Error("Informe a evidência que justifica a correção — nunca sem motivo auditável.");
  if (!input.performedBy.trim()) throw new Error("Informe quem está corrigindo.");

  const bankRepo = getBankStatementRepository();
  const line = await bankRepo.getLine(input.lineId);
  if (!line) throw new Error(`Linha de extrato não encontrada: ${input.lineId}`);
  if (line.linkedCashMovementId || line.linkedAccountTransferId) {
    throw new Error("Esta linha já virou um movimento real — corrigir o tipo agora exigiria reverter o movimento primeiro, nunca uma reclassificação silenciosa.");
  }

  const newStatus = initialStatusForType(input.correctedType);
  const updated = await bankRepo.updateLine({ id: input.lineId, type: input.correctedType, status: newStatus, reconciliationNote: input.reason, processedBy: input.performedBy });

  await getFinanceRepository().createAuditLogEntry({
    action: "correct_line_type",
    entityType: "bank_statement_line",
    entityId: input.lineId,
    beforeState: { type: line.type, status: line.status },
    afterState: { type: input.correctedType, status: newStatus, reason: input.reason, performedBy: input.performedBy },
  });

  return updated;
}
