"use server";

import { revalidatePath } from "next/cache";
import { MANUAL_MOVEMENT_TYPES, recordManualMovement } from "@/lib/inventory/manual-movement";
import { confirmStocktake, type StocktakeLineInput } from "@/lib/inventory/stocktake";
import type { InventoryUnit, MovementType } from "@/lib/inventory/types";

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
      success: `Contagem confirmada: ${result.movements.length} ajuste(s) gerado(s), ${result.unchangedCount} sem divergência, ${result.notFoundCount} não encontrado(s), ${result.measurementPendingCount} com medição pendente.`,
      movementsCreated: result.movements.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao confirmar contagem.", success: null, movementsCreated: 0 };
  }
}
