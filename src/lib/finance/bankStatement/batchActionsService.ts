import "server-only";
import { getBankStatementRepository } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { processBankStatementLine, markBankStatementLineIgnored } from "@/lib/finance/bankStatement/lineProcessingService";
import { validateRuleNotTooBroad } from "@/lib/finance/bankStatement/evidence";
import type { BankStatementLineType } from "@/lib/finance/bankStatement/types";

/**
 * Missão Financeiro V2.2 (Fase I/V/W) — ações em lote sobre um grupo já revisado pelo gestor.
 * NUNCA executado sem confirmação humana explícita (o `performedBy` + a chamada em si SÃO a
 * confirmação) — reaproveita `processBankStatementLine`/`markBankStatementLineIgnored`
 * (Missão V2.1) linha a linha dentro do grupo, nunca um caminho de escrita paralelo. Toda
 * confirmação grava auditoria (`audit_logs`, reaproveitado — Fase W).
 */
export interface ConfirmGroupInput {
  lineIds: string[];
  resultingType: BankStatementLineType;
  categoryId?: string | null;
  supplierId?: string | null;
  partnerId?: string | null;
  counterAccountId?: string | null;
  performedBy: string;
  /** Contexto adicional gravado no movimento real (ex.: "recebido por engano, devolvido no mesmo dia") — nunca obrigatório, sempre auditável quando informado. */
  notes?: string | null;
  /** Fase V — aprendizado controlado: cria uma regra determinística a partir deste grupo. */
  createRule?: { criteriaDirection?: "entrada" | "saida" | null; criteriaCounterpartyPattern?: string | null; criteriaDescriptionKeyword?: string | null };
}

export interface ConfirmGroupResult {
  processedLineIds: string[];
  failedLineIds: { lineId: string; error: string }[];
  createdRuleId: string | null;
}

export async function confirmGroup(input: ConfirmGroupInput, financialAccountId: string): Promise<ConfirmGroupResult> {
  if (!input.performedBy.trim()) throw new Error("Informe quem está confirmando este grupo.");
  if (input.lineIds.length === 0) throw new Error("Nenhuma linha selecionada.");

  const bankRepo = getBankStatementRepository();
  const financeRepo = getFinanceRepository();
  const processedLineIds: string[] = [];
  const failedLineIds: { lineId: string; error: string }[] = [];

  for (const lineId of input.lineIds) {
    try {
      const before = await bankRepo.getLine(lineId);
      const updated = await processBankStatementLine(
        {
          lineId,
          resultingType: input.resultingType,
          performedBy: input.performedBy,
          categoryId: input.categoryId ?? null,
          supplierId: input.supplierId ?? null,
          partnerId: input.partnerId ?? null,
          counterAccountId: input.counterAccountId ?? null,
          notes: input.notes ?? null,
        },
        financialAccountId,
      );
      await financeRepo.createAuditLogEntry({
        action: "classify_group",
        entityType: "bank_statement_line",
        entityId: lineId,
        beforeState: before ? { status: before.status, type: before.type } : null,
        afterState: { status: updated.status, type: updated.type, supplierId: updated.supplierId, categoryId: updated.categoryId, performedBy: input.performedBy },
      });
      processedLineIds.push(lineId);
    } catch (err) {
      failedLineIds.push({ lineId, error: err instanceof Error ? err.message : "Falha desconhecida." });
    }
  }

  let createdRuleId: string | null = null;
  if (input.createRule && processedLineIds.length > 0) {
    const validationError = validateRuleNotTooBroad({
      criteriaCounterpartyPattern: input.createRule.criteriaCounterpartyPattern ?? null,
      criteriaDescriptionKeyword: input.createRule.criteriaDescriptionKeyword ?? null,
    });
    if (validationError) throw new Error(validationError);

    const rule = await bankRepo.createClassificationRule({
      criteriaDirection: input.createRule.criteriaDirection ?? null,
      criteriaCounterpartyPattern: input.createRule.criteriaCounterpartyPattern ?? null,
      criteriaDescriptionKeyword: input.createRule.criteriaDescriptionKeyword ?? null,
      resultingType: input.resultingType,
      categoryId: input.categoryId ?? null,
      supplierId: input.supplierId ?? null,
      partnerId: input.partnerId ?? null,
      createdBy: input.performedBy,
    });
    createdRuleId = rule.id;
    await financeRepo.createAuditLogEntry({
      action: "create_rule",
      entityType: "bank_statement_classification_rule",
      entityId: rule.id,
      beforeState: null,
      afterState: { criteria: input.createRule, resultingType: input.resultingType, createdBy: input.performedBy },
    });
  }

  return { processedLineIds, failedLineIds, createdRuleId };
}

export interface RejectGroupInput {
  lineIds: string[];
  reason: string;
  performedBy: string;
}

export async function rejectGroup(input: RejectGroupInput): Promise<{ processedLineIds: string[]; failedLineIds: { lineId: string; error: string }[] }> {
  const financeRepo = getFinanceRepository();
  const processedLineIds: string[] = [];
  const failedLineIds: { lineId: string; error: string }[] = [];

  for (const lineId of input.lineIds) {
    try {
      await markBankStatementLineIgnored(lineId, input.reason, input.performedBy);
      await financeRepo.createAuditLogEntry({
        action: "reject_group_suggestion",
        entityType: "bank_statement_line",
        entityId: lineId,
        beforeState: null,
        afterState: { status: "ignorado", reason: input.reason, performedBy: input.performedBy },
      });
      processedLineIds.push(lineId);
    } catch (err) {
      failedLineIds.push({ lineId, error: err instanceof Error ? err.message : "Falha desconhecida." });
    }
  }

  return { processedLineIds, failedLineIds };
}
