import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { computeWeightedAverageCost } from "@/lib/inventory/weighted-average-cost";
import { linkPurchaseToExpense, resolveRealSupplierOrThrow } from "@/lib/inventory/purchase-expense-link";
import type { InventoryItem, InventoryUnit, StockMovement } from "@/lib/inventory/types";
import type { AccountsPayable, FinancePaymentMethod } from "@/lib/finance/types";

export interface ManualEntryInput {
  itemId: string;
  quantity: number;
  unit: InventoryUnit;
  date: string;
  responsible: string;
  supplier: string | null;
  unitPricePaid: number | null;
  invoiceNumber: string | null;
  notes: string | null;
  /** Chave de idempotência opcional (Missão 34) — reprocessar a mesma compra com o mesmo `externalId` nunca duplica a entrada. */
  externalId?: string | null;
  /**
   * Missão de Instrumentação Gerencial — quando true, também gera uma conta a pagar real vinculada
   * a esta entrada (COMPRA → ESTOQUE → FINANCEIRO). Exige fornecedor (correspondendo a um
   * fornecedor real cadastrado), preço unitário e vencimento — nunca fabrica nenhum desses dados.
   */
  generateExpense?: boolean;
  expenseDueDate?: string | null;
  expensePaymentMethod?: FinancePaymentMethod;
}

export interface ManualEntryResult {
  movement: StockMovement;
  /** Preenchido só quando `generateExpense` foi pedido e a despesa foi criada (ou já existia, mesmo externalId). */
  linkedExpense: AccountsPayable | null;
}

/**
 * "Entradas" (Missão 22) — a única forma prevista de registrar uma compra/recebimento manual
 * (o formulário genérico de `manual-movement.ts` exclui `compra` de propósito — ver o aviso em
 * `movements-view.tsx`). Sempre grava como `compra`. Quando um preço pago é informado, recalcula
 * automaticamente o custo médio ponderado do item (nunca sobrescreve o custo sem base real);
 * quando um fornecedor é informado, atualiza o fornecedor mais recente conhecido do item. Nunca
 * sobrescreve saldo diretamente — passa por `recordMovement`, que sempre recalcula a partir do
 * saldo real no momento (mesma regra de `manual-movement.ts`).
 */
export async function recordManualEntry(input: ManualEntryInput): Promise<ManualEntryResult> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantidade deve ser maior que zero.");
  }
  if (!input.responsible.trim()) {
    throw new Error("Responsável é obrigatório.");
  }
  if (input.unitPricePaid !== null && (!Number.isFinite(input.unitPricePaid) || input.unitPricePaid < 0)) {
    throw new Error("Valor pago inválido.");
  }
  if (input.generateExpense) {
    if (!input.supplier?.trim()) throw new Error("Fornecedor é obrigatório para gerar a despesa vinculada.");
    if (input.unitPricePaid === null || input.unitPricePaid <= 0) throw new Error("Valor pago é obrigatório para gerar a despesa vinculada.");
    if (!input.expenseDueDate?.trim()) throw new Error("Vencimento é obrigatório para gerar a despesa vinculada.");
    // Valida o fornecedor ANTES de tocar no estoque — nunca deixa uma movimentação real órfã quando a despesa não pode ser gerada.
    await resolveRealSupplierOrThrow(input.supplier.trim());
  }

  const repo = getInventoryRepository();
  const item = await repo.getItem(input.itemId);
  if (!item) throw new Error("Produto não encontrado.");

  const externalId = input.externalId?.trim() || null;
  if (externalId) {
    const existing = (await repo.listMovements(input.itemId)).find((m) => m.externalId === externalId);
    if (existing) {
      const linkedExpense = input.generateExpense ? await linkExpenseForEntry(existing, input, item.name) : null;
      return { movement: existing, linkedExpense };
    }
  }

  const supplier = input.supplier?.trim() || null;

  const movement = await repo.recordMovement({
    itemId: input.itemId,
    type: "compra",
    quantity: input.quantity,
    unit: input.unit,
    date: input.date,
    responsible: input.responsible.trim(),
    reference: input.invoiceNumber?.trim() || null,
    supplier,
    unitPricePaid: input.unitPricePaid,
    notes: input.notes?.trim() || null,
    externalId,
  });

  const patch: Partial<Pick<InventoryItem, "unitCost" | "supplier">> = {};
  if (input.unitPricePaid !== null && input.unitPricePaid > 0) {
    patch.unitCost = computeWeightedAverageCost({
      currentQuantity: item.currentQuantity,
      currentUnitCost: item.unitCost,
      enteredQuantity: input.quantity,
      unitPricePaid: input.unitPricePaid,
    });
  }
  if (supplier) {
    patch.supplier = supplier;
  }
  if (Object.keys(patch).length > 0) {
    await repo.updateItemDetails(input.itemId, patch);
  }

  const linkedExpense = input.generateExpense ? await linkExpenseForEntry(movement, input, item.name) : null;

  return { movement, linkedExpense };
}

async function linkExpenseForEntry(movement: StockMovement, input: ManualEntryInput, itemName: string): Promise<AccountsPayable> {
  return linkPurchaseToExpense({
    movementId: movement.id,
    itemName,
    quantity: input.quantity,
    unit: input.unit,
    unitPricePaid: input.unitPricePaid as number,
    supplierText: input.supplier?.trim() as string,
    date: input.date,
    dueDate: input.expenseDueDate?.trim() as string,
    invoiceNumber: input.invoiceNumber?.trim() || null,
    paymentMethod: input.expensePaymentMethod ?? "desconhecido",
  });
}
