"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addSample as addSampleService,
  approveRecipe,
  createNewVersion,
  createRecipe,
  editRecipe,
  excludeSample,
  suspendRecipe,
} from "@/lib/recipes/service";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { InventoryUnit } from "@/lib/inventory/types";
import type { ProcessStep, VehicleCategory } from "@/lib/recipes/types";

export interface FormActionState {
  error: string | null;
  success: string | null;
}

const initialState: FormActionState = { error: null, success: null };
export { initialState as initialRecipeActionState };

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

export async function createRecipeAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const serviceId = String(formData.get("serviceId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const vehicleCategory = String(formData.get("vehicleCategory") ?? "") as VehicleCategory;
  const processStep = String(formData.get("processStep") ?? "") as ProcessStep;
  const dilutionRatio = parseOptionalNumber(formData.get("dilutionRatio"));
  const notes = parseOptionalString(formData.get("notes"));

  if (!serviceId || !itemId || !vehicleCategory || !processStep) {
    return { error: "Serviço, produto, categoria de veículo e etapa são obrigatórios.", success: null };
  }

  const item = await getInventoryRepository().getItem(itemId);
  if (!item) return { error: "Produto não encontrado.", success: null };

  let created;
  try {
    created = await createRecipe({ serviceId, itemId, vehicleCategory, processStep, unit: item.unit as InventoryUnit, dilutionRatio, notes });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao criar receita.", success: null };
  }

  revalidatePath("/estoque/receitas");
  redirect(`/estoque/receitas/${created.id}`);
}

export async function editRecipeAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Receita não identificada.", success: null };

  const dilutionRatio = parseOptionalNumber(formData.get("dilutionRatio"));
  const notes = parseOptionalString(formData.get("notes"));

  try {
    await editRecipe(id, { dilutionRatio, notes });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao editar receita.", success: null };
  }

  revalidatePath(`/estoque/receitas/${id}`);
  return { error: null, success: "Receita atualizada." };
}

export async function addSampleAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const recipeId = String(formData.get("recipeId") ?? "");
  const date = String(formData.get("date") ?? "");
  const quantityBefore = parseOptionalNumber(formData.get("quantityBefore"));
  const quantityAfter = parseOptionalNumber(formData.get("quantityAfter"));
  const preparedQuantity = parseOptionalNumber(formData.get("preparedQuantity"));
  const leftoverReused = parseOptionalNumber(formData.get("leftoverReused"));
  const discarded = parseOptionalNumber(formData.get("discarded"));
  const dilutionRatio = parseOptionalNumber(formData.get("dilutionRatio"));
  const responsibleName = parseOptionalString(formData.get("responsibleName"));
  const serviceOrderExternalId = parseOptionalString(formData.get("serviceOrderExternalId"));
  const notes = parseOptionalString(formData.get("notes"));

  if (!recipeId) return { error: "Receita não identificada.", success: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Data inválida.", success: null };
  if (quantityBefore === null || quantityAfter === null) return { error: "Quantidade antes e depois são obrigatórias.", success: null };

  try {
    await addSampleService({
      recipeId,
      serviceOrderExternalId,
      date,
      quantityBefore,
      quantityAfter,
      preparedQuantity,
      leftoverReused,
      discarded,
      dilutionRatio,
      responsibleName,
      notes,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar amostra.", success: null };
  }

  revalidatePath(`/estoque/receitas/${recipeId}`);
  revalidatePath("/estoque/receitas");
  return { error: null, success: "Amostra registrada e estatísticas recalculadas." };
}

export async function excludeSampleAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const sampleId = String(formData.get("sampleId") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!sampleId) return { error: "Amostra não identificada.", success: null };

  try {
    await excludeSample(sampleId, reason);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao excluir amostra.", success: null };
  }

  revalidatePath(`/estoque/receitas/${recipeId}`);
  revalidatePath("/estoque/receitas");
  return { error: null, success: "Amostra excluída do cálculo (permanece registrada com a justificativa)." };
}

export async function approveRecipeAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Receita não identificada.");
  await approveRecipe(id);
  revalidatePath(`/estoque/receitas/${id}`);
  revalidatePath("/estoque/receitas");
  revalidatePath("/estoque");
  redirect(`/estoque/receitas/${id}`);
}

export async function suspendRecipeAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Receita não identificada.");
  await suspendRecipe(id);
  revalidatePath(`/estoque/receitas/${id}`);
  revalidatePath("/estoque/receitas");
  revalidatePath("/estoque");
  redirect(`/estoque/receitas/${id}`);
}

export async function createNewVersionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Receita não identificada.");
  const newVersion = await createNewVersion(id);
  revalidatePath(`/estoque/receitas/${id}`);
  revalidatePath("/estoque/receitas");
  redirect(`/estoque/receitas/${newVersion.id}`);
}
