"use server";

import { revalidatePath } from "next/cache";
import { confirmOrderConsumption, reverseOrderConsumption, type ConfirmConsumptionLineInput, type RemovedItemLog } from "@/lib/orders/confirmation";
import { confirmServiceMapping } from "@/lib/orders/service-mapping";
import { setVehicleCategory } from "@/lib/orders/vehicle-category";
import { getInventoryConsumptionMode } from "@/lib/config/env";
import type { OrderVehicleCategory } from "@/lib/orders/types";

export interface FormActionState {
  error: string | null;
  success: string | null;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function confirmVehicleCategoryAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const externalId = String(formData.get("externalId") ?? "");
  const plate = String(formData.get("plate") ?? "");
  const category = String(formData.get("category") ?? "") as OrderVehicleCategory;
  const responsibleName = String(formData.get("responsibleName") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    await setVehicleCategory(plate, category, responsibleName, reason);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao confirmar categoria.", success: null };
  }

  revalidatePath(`/estoque/ordens/${externalId}`);
  revalidatePath("/estoque/ordens");
  return { error: null, success: "Categoria confirmada." };
}

export async function mapJumpparkServiceAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const externalId = String(formData.get("externalId") ?? "");
  const mappingId = String(formData.get("mappingId") ?? "");
  const canonicalServiceId = String(formData.get("canonicalServiceId") ?? "");

  if (!mappingId || !canonicalServiceId) return { error: "Selecione o serviço canônico.", success: null };

  try {
    await confirmServiceMapping(mappingId, canonicalServiceId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao mapear serviço.", success: null };
  }

  revalidatePath(`/estoque/ordens/${externalId}`);
  revalidatePath("/estoque/ordens");
  revalidatePath("/estoque/mapeamentos");
  return { error: null, success: "Serviço mapeado." };
}

export interface ConfirmConsumptionFormState {
  error: string | null;
  success: string | null;
}

export async function confirmConsumptionAction(_prevState: ConfirmConsumptionFormState, formData: FormData): Promise<ConfirmConsumptionFormState> {
  if (getInventoryConsumptionMode() !== "preview_and_confirm") {
    return { error: "O modo de operação atual não permite confirmar consumo — apenas visualizar a prévia. Ajuste INVENTORY_CONSUMPTION_MODE para preview_and_confirm.", success: null };
  }

  const externalId = String(formData.get("externalId") ?? "");
  const vehicleCategory = String(formData.get("vehicleCategory") ?? "") as OrderVehicleCategory;
  const responsibleName = String(formData.get("responsibleName") ?? "");
  const justification = parseOptionalString(formData.get("justification"));
  const isPartial = formData.get("isPartial") === "on";

  let lines: ConfirmConsumptionLineInput[];
  let removedItemsLog: RemovedItemLog[];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
    removedItemsLog = JSON.parse(String(formData.get("removedItemsLog") ?? "[]"));
  } catch {
    return { error: "Dados da confirmação inválidos.", success: null };
  }

  try {
    const result = await confirmOrderConsumption({ externalId, vehicleCategory, responsibleName, justification, lines, removedItemsLog, isPartial });
    revalidatePath(`/estoque/ordens/${externalId}`);
    revalidatePath("/estoque/ordens");
    revalidatePath("/estoque/consumos");
    revalidatePath("/estoque");
    return {
      error: null,
      success: result.alreadyExisted ? "Esta ordem já tinha uma confirmação registrada — nenhuma baixa nova foi criada." : `Consumo confirmado (${result.status}).`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao confirmar consumo.", success: null };
  }
}

export interface ReverseFormState {
  error: string | null;
  success: string | null;
}

export async function reverseConsumptionAction(_prevState: ReverseFormState, formData: FormData): Promise<ReverseFormState> {
  const externalId = String(formData.get("externalId") ?? "");
  const confirmationId = String(formData.get("confirmationId") ?? "");
  const responsibleName = String(formData.get("responsibleName") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    await reverseOrderConsumption(confirmationId, responsibleName, reason);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao estornar.", success: null };
  }

  revalidatePath(`/estoque/ordens/${externalId}`);
  revalidatePath("/estoque/ordens");
  revalidatePath("/estoque/consumos");
  revalidatePath("/estoque");
  return { error: null, success: "Consumo estornado — saldo restaurado." };
}
