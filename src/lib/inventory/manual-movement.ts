import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { InventoryUnit, MovementType, StockMovement } from "@/lib/inventory/types";

/** Únicos tipos que um formulário manual pode registrar — os demais só nascem de fluxos automáticos (seed, contagem, calibração). */
export const MANUAL_MOVEMENT_TYPES: MovementType[] = [
  "ajuste_positivo",
  "ajuste_negativo",
  "perda",
  "avaria",
  "vencimento",
  "devolucao",
  "transferencia",
  "correcao_inventario",
];

export interface ManualMovementInput {
  itemId: string;
  type: MovementType;
  quantity: number;
  unit: InventoryUnit;
  date: string;
  responsible: string;
  reason: string;
  notes: string | null;
}

/**
 * Nunca sobrescreve o saldo diretamente — toda correção passa por uma movimentação nova
 * (ajuste ou correcao_inventario), nunca uma edição silenciosa de uma movimentação antiga.
 */
export async function recordManualMovement(input: ManualMovementInput): Promise<StockMovement> {
  if (!MANUAL_MOVEMENT_TYPES.includes(input.type)) {
    throw new Error("Este tipo de movimentação não pode ser registrado manualmente.");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantidade deve ser maior que zero.");
  }
  if (!input.responsible.trim()) {
    throw new Error("Responsável é obrigatório.");
  }
  if (!input.reason.trim()) {
    throw new Error("Motivo é obrigatório.");
  }

  const repo = getInventoryRepository();
  const combinedNotes = input.notes?.trim() ? `${input.reason.trim()} — ${input.notes.trim()}` : input.reason.trim();

  return repo.recordMovement({
    itemId: input.itemId,
    type: input.type,
    quantity: input.quantity,
    unit: input.unit,
    date: input.date,
    responsible: input.responsible.trim(),
    reference: null,
    notes: combinedNotes,
  });
}
