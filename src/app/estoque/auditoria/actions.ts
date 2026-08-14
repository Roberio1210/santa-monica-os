"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordDuplicateDecision, type DuplicatePairDecision } from "@/lib/inventory/duplicate-decisions";
import { consolidateItems, type ConsolidationOverrides } from "@/lib/inventory/consolidation";
import { createPurchaseImportPreview, confirmPurchaseImportLine } from "@/lib/inventory/purchase-import-service";
import { linkPurchaseImportToExpense } from "@/lib/inventory/purchase-expense-link";
import { STOCK_CONSUMABLE_CLASSIFICATIONS, type InventoryCategory, type InventoryUnit, type ItemClassification, type PurchaseLineDecision } from "@/lib/inventory/types";
import type { FinancePaymentMethod } from "@/lib/finance/types";

export interface FormActionState {
  error: string | null;
  success: string | null;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  const str = String(value ?? "").trim().replace(",", ".");
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/** Seção 3 — "Não são duplicados" / "Revisar depois". Nunca altera nenhum cadastro, só registra a decisão. */
export async function recordDuplicateDecisionAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const itemAId = String(formData.get("itemAId") ?? "");
  const itemBId = String(formData.get("itemBId") ?? "");
  const decision = String(formData.get("decision") ?? "") as DuplicatePairDecision;
  const performedBy = String(formData.get("performedBy") ?? "");

  if (decision !== "nao_sao_duplicados" && decision !== "revisar_depois") return { error: "Decisão inválida.", success: null };

  try {
    await recordDuplicateDecision(itemAId, itemBId, decision, performedBy);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar decisão.", success: null };
  }

  revalidatePath("/estoque/auditoria");
  return { error: null, success: decision === "nao_sao_duplicados" ? "Marcado como não-duplicado." : "Marcado para revisar depois." };
}

export interface ConsolidationFormState {
  error: string | null;
  success: string | null;
  resultMasterId: string | null;
}

/** Seção 4 — Assistente de Consolidação. Sempre transacional (ver consolidation.ts); nunca parcial. */
export async function startConsolidationAction(_prevState: ConsolidationFormState, formData: FormData): Promise<ConsolidationFormState> {
  const masterItemId = String(formData.get("masterItemId") ?? "");
  const mergedItemIds = formData.getAll("mergedItemIds").map(String).filter(Boolean);
  const unitBase = String(formData.get("unitBase") ?? "") as InventoryUnit;
  const performedBy = String(formData.get("performedBy") ?? "");
  const reason = parseOptionalString(formData.get("reason"));

  if (!masterItemId) return { error: "Selecione o produto mestre.", success: null, resultMasterId: null };
  if (mergedItemIds.length === 0) return { error: "Selecione ao menos um cadastro para incorporar.", success: null, resultMasterId: null };

  const overrides: ConsolidationOverrides = {};
  const name = parseOptionalString(formData.get("overrideName"));
  const brand = parseOptionalString(formData.get("overrideBrand"));
  const category = parseOptionalString(formData.get("overrideCategory"));
  const supplier = parseOptionalString(formData.get("overrideSupplier"));
  const location = parseOptionalString(formData.get("overrideLocation"));
  const minimumStock = parseOptionalNumber(formData.get("overrideMinimumStock"));
  const idealStock = parseOptionalNumber(formData.get("overrideIdealStock"));
  if (name) overrides.name = name;
  if (brand) overrides.brand = brand;
  if (category) overrides.category = category as InventoryCategory;
  if (supplier !== null) overrides.supplier = supplier;
  if (location !== null) overrides.location = location;
  if (minimumStock !== null) overrides.minimumStock = minimumStock;
  if (idealStock !== null) overrides.idealStock = idealStock;

  try {
    const result = await consolidateItems({ masterItemId, mergedItemIds, unitBase, reason, performedBy, overrides: Object.keys(overrides).length > 0 ? overrides : undefined });
    revalidatePath("/estoque/auditoria");
    revalidatePath("/estoque/produtos");
    revalidatePath("/estoque");
    return {
      error: null,
      success: result.alreadyExisted ? "Estes cadastros já haviam sido incorporados a este mestre antes — nada novo foi processado." : `Consolidação concluída: ${result.processedItemIds.length} cadastro(s) incorporado(s).`,
      resultMasterId: result.masterItemId,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao consolidar.", success: null, resultMasterId: null };
  }
}

export interface ImportUploadState {
  error: string | null;
}

/** Seção 7/8 (Etapa 1) — só calcula e grava a prévia; nada de estoque é alterado aqui. */
export async function createImportPreviewAction(_prevState: ImportUploadState, formData: FormData): Promise<ImportUploadState> {
  const file = formData.get("file");
  const importedBy = String(formData.get("importedBy") ?? "");

  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo CSV ou JSON." };

  const filename = file.name;
  const isJson = filename.toLowerCase().endsWith(".json");
  const content = await file.text();

  let importId: string;
  try {
    const result = await createPurchaseImportPreview({ fileFormat: isJson ? "json" : "csv", filename, content, importedBy });
    importId = result.importId;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao processar o arquivo." };
  }

  redirect(`/estoque/auditoria/importar-compras/${importId}`);
}

export interface ConfirmLineState {
  error: string | null;
  success: string | null;
}

/** Seção 8 (Etapa 2) — uma linha por vez, sempre com decisão explícita do usuário. */
export async function confirmImportLineAction(_prevState: ConfirmLineState, formData: FormData): Promise<ConfirmLineState> {
  const lineId = String(formData.get("lineId") ?? "");
  const importId = String(formData.get("importId") ?? "");
  const decision = String(formData.get("decision") ?? "") as PurchaseLineDecision;
  const performedBy = String(formData.get("performedBy") ?? "");
  const linkItemId = parseOptionalString(formData.get("linkItemId")) ?? undefined;

  const newProductCategory = parseOptionalString(formData.get("newProductCategory"));
  const newProductBrand = parseOptionalString(formData.get("newProductBrand"));
  const newProductClassification = parseOptionalString(formData.get("newProductClassification"));
  const newProduct =
    decision === "criar_produto" && newProductCategory && newProductBrand && newProductClassification
      ? { category: newProductCategory as InventoryCategory, brand: newProductBrand, classification: newProductClassification as ItemClassification }
      : undefined;

  if (decision === "criar_produto" && (!newProduct || !STOCK_CONSUMABLE_CLASSIFICATIONS.includes(newProduct.classification))) {
    return { error: "Para criar produto, informe categoria, marca e uma classificação de consumo (químico, sólido ou consumível).", success: null };
  }

  try {
    await confirmPurchaseImportLine({ lineId, decision, performedBy, linkItemId, newProduct });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao confirmar linha.", success: null };
  }

  revalidatePath(`/estoque/auditoria/importar-compras/${importId}`);
  revalidatePath("/estoque/produtos");
  revalidatePath("/estoque");
  return { error: null, success: "Linha confirmada." };
}

/**
 * Missão Financeiro V2 (Prioridade 8) — ponte Compra de Estoque → Conta a Pagar. Só chamada
 * explicitamente pelo usuário na tela de detalhe da importação; nunca lança despesa automática
 * para compras antigas. Idempotente via `linkPurchaseImportToExpense` (externalId
 * `purchase-import:{id}`) — reenviar o formulário nunca duplica.
 */
export async function linkPurchaseImportToExpenseAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const purchaseImportId = String(formData.get("purchaseImportId") ?? "");
  const supplierText = String(formData.get("supplierText") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "");
  const paymentMethod = String(formData.get("paymentMethod") ?? "desconhecido") as FinancePaymentMethod;
  const financialAccountId = parseOptionalString(formData.get("financialAccountId"));
  const installmentTotalRaw = parseOptionalNumber(formData.get("installmentTotal"));
  const notes = parseOptionalString(formData.get("notes"));

  if (!purchaseImportId) return { error: "Compra inválida.", success: null };
  if (!supplierText) return { error: "Informe o fornecedor.", success: null };
  if (!dueDate) return { error: "Informe o vencimento.", success: null };

  try {
    const created = await linkPurchaseImportToExpense({
      purchaseImportId,
      supplierText,
      dueDate,
      paymentMethod,
      financialAccountId,
      installmentTotal: installmentTotalRaw ?? undefined,
      notes,
    });
    revalidatePath(`/estoque/auditoria/importar-compras/${purchaseImportId}`);
    revalidatePath("/financeiro/contas-a-pagar");
    revalidatePath("/financeiro");
    return { error: null, success: `Despesa lançada: R$ ${created.originalAmount.toFixed(2)} — vencimento ${created.dueDate}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao lançar a despesa.", success: null };
  }
}
