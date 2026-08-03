import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { EXIT_REASONS, EXIT_REASON_LABELS, EXIT_REASON_TO_MOVEMENT_TYPE, type ExitReason } from "@/lib/inventory/manual-exit-reasons";
import type { InventoryUnit, StockMovement } from "@/lib/inventory/types";

export { EXIT_REASONS, EXIT_REASON_LABELS, EXIT_REASON_TO_MOVEMENT_TYPE, type ExitReason };

export interface ManualExitInput {
  itemId: string;
  quantity: number;
  unit: InventoryUnit;
  reason: ExitReason;
  date: string;
  responsible: string;
  notes: string | null;
}

/** "Saídas" (Missão 22) — baixa manual simples por motivo, mais direta que o formulário genérico de ajustes. */
export async function recordManualExit(input: ManualExitInput): Promise<StockMovement> {
  if (!EXIT_REASONS.includes(input.reason)) {
    throw new Error("Motivo inválido.");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantidade deve ser maior que zero.");
  }
  if (!input.responsible.trim()) {
    throw new Error("Responsável é obrigatório.");
  }

  const repo = getInventoryRepository();
  const notes = input.notes?.trim() ? `${EXIT_REASON_LABELS[input.reason]} — ${input.notes.trim()}` : EXIT_REASON_LABELS[input.reason];

  return repo.recordMovement({
    itemId: input.itemId,
    type: EXIT_REASON_TO_MOVEMENT_TYPE[input.reason],
    quantity: input.quantity,
    unit: input.unit,
    date: input.date,
    responsible: input.responsible.trim(),
    reference: null,
    notes,
  });
}
