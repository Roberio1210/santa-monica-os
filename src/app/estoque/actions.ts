"use server";

import { revalidatePath } from "next/cache";
import { MANUAL_MOVEMENT_TYPES, recordManualMovement } from "@/lib/inventory/manual-movement";
import { confirmStocktake, type StocktakeLineInput } from "@/lib/inventory/stocktake";
import { registerPhysicalInventoryCount } from "@/lib/inventory/managerial-physical-count";
import { getProductManagerialInventorySummary, type ProductManagerialInventorySummary } from "@/lib/inventory/managerial-count-reconciliation";
import { recordManualEntry } from "@/lib/inventory/manual-entry";
import { EXIT_REASONS, recordManualExit, type ExitReason } from "@/lib/inventory/manual-exit";
import { updateItemDetails } from "@/lib/inventory/item-details";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { inventoryCategories } from "@/lib/inventory/types";
import type { InventoryCategory, InventoryUnit, MovementType } from "@/lib/inventory/types";
import type { FinancePaymentMethod } from "@/lib/finance/types";

const FINANCE_PAYMENT_METHODS: FinancePaymentMethod[] = ["dinheiro", "debito", "credito", "pix", "boleto", "transferencia", "outro", "desconhecido"];

function parsePaymentMethod(value: FormDataEntryValue | null): FinancePaymentMethod {
  const str = String(value ?? "");
  return (FINANCE_PAYMENT_METHODS as string[]).includes(str) ? (str as FinancePaymentMethod) : "desconhecido";
}

export interface FormActionState {
  error: string | null;
  success: string | null;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function recordManualMovementAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const itemId = String(formData.get("itemId") ?? "");
  const type = String(formData.get("type") ?? "") as MovementType;
  const quantityRaw = String(formData.get("quantity") ?? "").replace(",", ".");
  const unit = String(formData.get("unit") ?? "") as InventoryUnit;
  const date = String(formData.get("date") ?? "");
  const responsible = String(formData.get("responsible") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const notes = parseOptionalString(formData.get("notes"));

  if (!itemId) return { error: "Selecione um produto.", success: null };
  if (!MANUAL_MOVEMENT_TYPES.includes(type)) return { error: "Tipo de movimentação inválido.", success: null };
  const quantity = Number(quantityRaw);
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantidade deve ser maior que zero.", success: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Data inválida.", success: null };

  try {
    await recordManualMovement({ itemId, type, quantity, unit, date, responsible, reason, notes });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar movimentação.", success: null };
  }

  revalidatePath("/estoque/movimentacoes");
  revalidatePath("/estoque");
  revalidatePath(`/estoque/produtos/${itemId}`);
  return { error: null, success: "Movimentação registrada." };
}

export interface StocktakeActionState {
  error: string | null;
  success: string | null;
  movementsCreated: number;
}

export async function confirmStocktakeAction(_prevState: StocktakeActionState, formData: FormData): Promise<StocktakeActionState> {
  const reference = String(formData.get("reference") ?? "");
  const responsible = String(formData.get("responsible") ?? "");
  const linesRaw = String(formData.get("lines") ?? "[]");

  if (!responsible.trim()) return { error: "Responsável é obrigatório.", success: null, movementsCreated: 0 };

  let lines: StocktakeLineInput[];
  try {
    lines = JSON.parse(linesRaw);
  } catch {
    return { error: "Dados da contagem inválidos.", success: null, movementsCreated: 0 };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "Registre ao menos um item antes de confirmar.", success: null, movementsCreated: 0 };
  }

  try {
    const result = await confirmStocktake(reference, responsible, lines);
    revalidatePath("/estoque/movimentacoes");
    revalidatePath("/estoque");
    revalidatePath("/estoque/produtos");
    return {
      error: null,
      success: `Contagem confirmada: ${result.movements.length} posição(ões) física(s) confirmada(s) (${result.unchangedCount} sem divergência de saldo), ${result.notFoundCount} não encontrado(s), ${result.measurementPendingCount} com medição pendente.`,
      movementsCreated: result.movements.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao confirmar contagem.", success: null, movementsCreated: 0 };
  }
}

export interface QuickCountActionState {
  error: string | null;
  success: boolean;
  itemId: string | null;
  previousBalance: number | null;
  countedQuantity: number | null;
  difference: number | null;
  unit: string | null;
  resolvedMeasurementPending: boolean;
}

const initialQuickCountActionState: QuickCountActionState = {
  error: null,
  success: false,
  itemId: null,
  previousBalance: null,
  countedQuantity: null,
  difference: null,
  unit: null,
  resolvedMeasurementPending: false,
};

/**
 * Missão de UI Operacional de Contagem de Estoque V1 — contagem rápida de UM produto por vez
 * (distinta de `confirmStocktakeAction`, que confirma uma sessão em lote). Reaproveita
 * `registerPhysicalInventoryCount` sem duplicar lógica — o valor já chega convertido para a
 * unidade-base do item (conversão feita no cliente, `convertToBaseUnit`).
 */
export async function registerPhysicalCountAction(_prevState: QuickCountActionState, formData: FormData): Promise<QuickCountActionState> {
  const itemId = String(formData.get("itemId") ?? "");
  const countedQuantityRaw = String(formData.get("countedQuantity") ?? "");
  const countedAt = String(formData.get("countedAt") ?? "");
  const source = String(formData.get("source") ?? "");
  const notes = parseOptionalString(formData.get("notes"));

  if (!itemId) return { ...initialQuickCountActionState, error: "Produto não identificado." };
  const countedQuantity = Number(countedQuantityRaw);
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) return { ...initialQuickCountActionState, error: "Quantidade contada inválida." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(countedAt)) return { ...initialQuickCountActionState, error: "Data da contagem inválida." };
  if (!source.trim()) return { ...initialQuickCountActionState, error: "Informe quem realizou a contagem." };

  try {
    const result = await registerPhysicalInventoryCount({ itemId, countedQuantity, countedAt, source: source.trim(), notes });
    revalidatePath("/estoque/movimentacoes");
    revalidatePath("/estoque");
    revalidatePath("/estoque/produtos");
    revalidatePath(`/estoque/produtos/${itemId}`);
    revalidatePath("/estoque/contagem");
    revalidatePath("/estoque/consumo-gerencial");
    return {
      error: null,
      success: true,
      itemId,
      previousBalance: result.previousBalance,
      countedQuantity: result.countedQuantity,
      difference: result.difference,
      unit: result.movement.unit,
      resolvedMeasurementPending: result.resolvedMeasurementPending,
    };
  } catch (err) {
    return { ...initialQuickCountActionState, error: err instanceof Error ? err.message : "Falha ao registrar a contagem." };
  }
}

/**
 * Consulta (não é mutação, mas precisa ser Server Action para rodar sob demanda a partir de um
 * Client Component) do resumo gerencial de um produto — usada ao expandir o histórico de um
 * item na tela de contagem (Missão de UI Operacional de Contagem V1, seção 14). Nunca recalcula
 * matemática aqui: só repassa `getProductManagerialInventorySummary`.
 */
export async function fetchProductManagerialSummaryAction(itemId: string): Promise<ProductManagerialInventorySummary | { error: string }> {
  try {
    return await getProductManagerialInventorySummary(itemId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao carregar o resumo gerencial do produto." };
  }
}

/** "Entradas" (Missão 22) — sempre uma compra; nunca passa pelo formulário genérico de ajustes. */
export async function recordManualEntryAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const itemId = String(formData.get("itemId") ?? "");
  const quantityRaw = String(formData.get("quantity") ?? "").replace(",", ".");
  const unit = String(formData.get("unit") ?? "") as InventoryUnit;
  const date = String(formData.get("date") ?? "");
  const responsible = String(formData.get("responsible") ?? "");
  const supplier = parseOptionalString(formData.get("supplier"));
  const unitPricePaidRaw = parseOptionalString(formData.get("unitPricePaid"));
  const invoiceNumber = parseOptionalString(formData.get("invoiceNumber"));
  const notes = parseOptionalString(formData.get("notes"));
  const generateExpense = formData.get("generateExpense") === "on";
  const expenseDueDate = parseOptionalString(formData.get("expenseDueDate"));
  const expensePaymentMethod = parsePaymentMethod(formData.get("expensePaymentMethod"));

  if (!itemId) return { error: "Selecione um produto.", success: null };
  const quantity = Number(quantityRaw);
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantidade deve ser maior que zero.", success: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Data inválida.", success: null };
  const unitPricePaid = unitPricePaidRaw !== null ? Number(unitPricePaidRaw.replace(",", ".")) : null;
  if (unitPricePaid !== null && !Number.isFinite(unitPricePaid)) return { error: "Valor pago inválido.", success: null };

  let linkedExpenseId: string | null = null;
  try {
    const result = await recordManualEntry({
      itemId,
      quantity,
      unit,
      date,
      responsible,
      supplier,
      unitPricePaid,
      invoiceNumber,
      notes,
      generateExpense,
      expenseDueDate,
      expensePaymentMethod,
    });
    linkedExpenseId = result.linkedExpense?.id ?? null;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar entrada.", success: null };
  }

  revalidatePath("/estoque/movimentacoes");
  revalidatePath("/estoque");
  revalidatePath("/estoque/produtos");
  revalidatePath(`/estoque/produtos/${itemId}`);
  if (linkedExpenseId) revalidatePath("/financeiro/contas-a-pagar");

  return {
    error: null,
    success: linkedExpenseId ? `Entrada registrada. Despesa vinculada criada em Contas a Pagar (id ${linkedExpenseId}).` : "Entrada registrada.",
  };
}

/** "Saídas" (Missão 22) — baixa manual por motivo, mais direta que o formulário genérico de ajustes. */
export async function recordManualExitAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const itemId = String(formData.get("itemId") ?? "");
  const quantityRaw = String(formData.get("quantity") ?? "").replace(",", ".");
  const unit = String(formData.get("unit") ?? "") as InventoryUnit;
  const reason = String(formData.get("reason") ?? "") as ExitReason;
  const date = String(formData.get("date") ?? "");
  const responsible = String(formData.get("responsible") ?? "");
  const notes = parseOptionalString(formData.get("notes"));

  if (!itemId) return { error: "Selecione um produto.", success: null };
  if (!EXIT_REASONS.includes(reason)) return { error: "Motivo inválido.", success: null };
  const quantity = Number(quantityRaw);
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantidade deve ser maior que zero.", success: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Data inválida.", success: null };

  try {
    await recordManualExit({ itemId, quantity, unit, reason, date, responsible, notes });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar saída.", success: null };
  }

  revalidatePath("/estoque/movimentacoes");
  revalidatePath("/estoque");
  revalidatePath("/estoque/produtos");
  revalidatePath(`/estoque/produtos/${itemId}`);
  return { error: null, success: "Saída registrada." };
}

/** Edição de metadados complementares do produto (Missão 22, estendida com nome/marca/categoria na Missão de Fechamento de Lacunas Operacionais). */
export async function updateItemDetailsAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const itemId = String(formData.get("itemId") ?? "");
  const supplier = parseOptionalString(formData.get("supplier"));
  const location = parseOptionalString(formData.get("location"));
  const minimumStockRaw = parseOptionalString(formData.get("minimumStock"));
  const idealStockRaw = parseOptionalString(formData.get("idealStock"));
  const name = parseOptionalString(formData.get("name"));
  const brand = parseOptionalString(formData.get("brand"));
  const categoryRaw = parseOptionalString(formData.get("category"));

  if (!itemId) return { error: "Produto não identificado.", success: null };
  const minimumStock = minimumStockRaw !== null ? Number(minimumStockRaw.replace(",", ".")) : null;
  const idealStock = idealStockRaw !== null ? Number(idealStockRaw.replace(",", ".")) : null;
  if (minimumStock !== null && !Number.isFinite(minimumStock)) return { error: "Estoque mínimo inválido.", success: null };
  if (idealStock !== null && !Number.isFinite(idealStock)) return { error: "Estoque ideal inválido.", success: null };
  const category = categoryRaw !== null && (inventoryCategories as string[]).includes(categoryRaw) ? (categoryRaw as InventoryCategory) : undefined;
  if (categoryRaw !== null && category === undefined) return { error: "Categoria inválida.", success: null };

  try {
    await updateItemDetails({
      itemId,
      supplier,
      location,
      minimumStock,
      idealStock,
      ...(name !== null ? { name } : {}),
      ...(brand !== null ? { brand } : {}),
      ...(category !== undefined ? { category } : {}),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar dados do produto.", success: null };
  }

  revalidatePath("/estoque");
  revalidatePath("/estoque/produtos");
  revalidatePath(`/estoque/produtos/${itemId}`);
  return { error: null, success: "Dados do produto atualizados." };
}

/**
 * Ativar/desativar produto (Missão 23 — infraestrutura já existia via `setItemActive`, nunca
 * exposta na interface até a Missão de Fechamento de Lacunas Operacionais). Nunca exclui:
 * desativar apenas remove o produto de `listItems()`; histórico e detalhe continuam intactos.
 */
export async function toggleItemActiveAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const itemId = String(formData.get("itemId") ?? "");
  const nextActive = String(formData.get("active") ?? "") === "true";
  if (!itemId) return { error: "Produto não identificado.", success: null };

  try {
    await getInventoryRepository().setItemActive(itemId, nextActive);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao atualizar o status do produto.", success: null };
  }

  revalidatePath("/estoque");
  revalidatePath("/estoque/produtos");
  revalidatePath(`/estoque/produtos/${itemId}`);
  return { error: null, success: nextActive ? "Produto reativado." : "Produto desativado — continua acessível pelo histórico, mas não aparece mais na listagem padrão." };
}
