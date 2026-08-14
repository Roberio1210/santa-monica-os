"use server";

import { revalidatePath } from "next/cache";
import { dryRunBankStatementImport, confirmBankStatementImport, type DryRunResult } from "@/lib/finance/bankStatement/importService";
import { attemptStoneSettlementReconciliation, markBankStatementLineIgnored, processBankStatementLine } from "@/lib/finance/bankStatement/lineProcessingService";
import type { BankStatementLineType } from "@/lib/finance/bankStatement/types";

export interface FormActionState {
  error: string | null;
  success: string | null;
}

export interface DryRunState extends FormActionState {
  preview: DryRunResult | null;
  csvContent: string | null;
  filename: string | null;
}

const initialDryRunState: DryRunState = { error: null, success: null, preview: null, csvContent: null, filename: null };

/** Fase C — Etapa 1: só calcula e mostra contagens (novas/duplicadas/inválidas). Nunca escreve no banco. */
export async function dryRunImportAction(_prevState: DryRunState, formData: FormData): Promise<DryRunState> {
  const file = formData.get("file");
  const financialAccountId = String(formData.get("financialAccountId") ?? "");

  if (!(file instanceof File) || file.size === 0) return { ...initialDryRunState, error: "Selecione um arquivo CSV." };
  if (!financialAccountId) return { ...initialDryRunState, error: "Conta financeira inválida." };

  const csvContent = await file.text();

  try {
    const preview = await dryRunBankStatementImport(financialAccountId, csvContent);
    return { error: null, success: null, preview, csvContent, filename: file.name };
  } catch (err) {
    return { ...initialDryRunState, error: err instanceof Error ? err.message : "Falha ao analisar o arquivo." };
  }
}

/** Fase C — Etapa 2: persiste só as linhas novas (a mesma análise da Etapa 1 é refeita aqui, contra o estado real do banco no momento da confirmação). */
export async function confirmImportAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const financialAccountId = String(formData.get("financialAccountId") ?? "");
  const csvContent = String(formData.get("csvContent") ?? "");
  const filename = String(formData.get("filename") ?? "") || null;
  const importedBy = String(formData.get("importedBy") ?? "").trim();

  if (!financialAccountId || !csvContent) return { error: "Sessão de importação expirada — refaça a análise do arquivo.", success: null };
  if (!importedBy) return { error: "Informe seu nome para confirmar a importação.", success: null };

  try {
    const result = await confirmBankStatementImport({ financialAccountId, fileFormat: "csv", filename, importedBy, csvContent });
    revalidatePath("/financeiro/conta-stone");
    return { error: null, success: `Importado: ${result.newRowCount} linha(s) nova(s), ${result.duplicateRowCount} duplicata(s) descartada(s).` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao importar.", success: null };
  }
}

/** Tenta conciliar uma linha "recebimento de vendas"/"antecipação" contra a liquidação Stone conhecida — nunca cria receita nova. */
export async function reconcileLineAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const lineId = String(formData.get("lineId") ?? "");
  const financialAccountId = String(formData.get("financialAccountId") ?? "");
  if (!lineId || !financialAccountId) return { error: "Linha inválida.", success: null };

  try {
    const updated = await attemptStoneSettlementReconciliation(lineId, financialAccountId);
    revalidatePath("/financeiro/conta-stone");
    return { error: null, success: updated.status === "conciliado" ? "Conciliado com a liquidação Stone." : updated.reconciliationNote };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao conciliar.", success: null };
  }
}

/** Decisão explícita do operador — transforma a linha num movimento real. */
export async function processLineAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const lineId = String(formData.get("lineId") ?? "");
  const financialAccountId = String(formData.get("financialAccountId") ?? "");
  const resultingType = String(formData.get("resultingType") ?? "") as BankStatementLineType;
  const performedBy = String(formData.get("performedBy") ?? "").trim();
  const counterAccountId = String(formData.get("counterAccountId") ?? "").trim() || null;
  const linkedAccountsReceivableId = String(formData.get("linkedAccountsReceivableId") ?? "").trim() || null;
  const linkedAccountsPayableId = String(formData.get("linkedAccountsPayableId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!lineId || !financialAccountId || !resultingType) return { error: "Dados inválidos.", success: null };

  try {
    await processBankStatementLine({ lineId, resultingType, performedBy, counterAccountId, linkedAccountsReceivableId, linkedAccountsPayableId, notes }, financialAccountId);
    revalidatePath("/financeiro/conta-stone");
    revalidatePath("/financeiro/classificacao");
    revalidatePath("/financeiro/fluxo-de-caixa");
    return { error: null, success: "Linha processada." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao processar a linha.", success: null };
  }
}

export async function ignoreLineAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const lineId = String(formData.get("lineId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const performedBy = String(formData.get("performedBy") ?? "").trim();
  if (!lineId) return { error: "Linha inválida.", success: null };

  try {
    await markBankStatementLineIgnored(lineId, reason, performedBy);
    revalidatePath("/financeiro/conta-stone");
    return { error: null, success: "Linha marcada como ignorada." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao ignorar a linha.", success: null };
  }
}
