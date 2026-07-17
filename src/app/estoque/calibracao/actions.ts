"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addSample, createRecipe } from "@/lib/recipes/service";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { InventoryUnit } from "@/lib/inventory/types";
import type { ProcessStep, VehicleCategory } from "@/lib/recipes/types";

export interface CalibracaoState {
  error: string | null;
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

/**
 * Encontra a receita ativa da combinação ou cria uma nova em rascunho — nunca cria consumo
 * automático, só a estrutura da receita, exatamente como createRecipe já faz.
 */
export async function calibrarAction(_prevState: CalibracaoState, formData: FormData): Promise<CalibracaoState> {
  const serviceId = String(formData.get("serviceId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const vehicleCategory = String(formData.get("vehicleCategory") ?? "") as VehicleCategory;
  const processStep = String(formData.get("processStep") ?? "") as ProcessStep;

  if (!serviceId || !itemId || !vehicleCategory || !processStep) {
    return { error: "Serviço, produto, categoria de veículo e etapa são obrigatórios." };
  }

  const date = String(formData.get("date") ?? "");
  const quantityBefore = parseOptionalNumber(formData.get("quantityBefore"));
  const quantityAfter = parseOptionalNumber(formData.get("quantityAfter"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Data inválida." };
  if (quantityBefore === null || quantityAfter === null) return { error: "Quantidade antes e depois são obrigatórias." };

  const preparedQuantity = parseOptionalNumber(formData.get("preparedQuantity"));
  const dilutionRatio = parseOptionalNumber(formData.get("dilutionRatio"));
  const leftoverReused = parseOptionalNumber(formData.get("leftoverReused"));
  const discarded = parseOptionalNumber(formData.get("discarded"));
  const responsibleName = parseOptionalString(formData.get("responsibleName"));
  const serviceOrderExternalId = parseOptionalString(formData.get("serviceOrderExternalId"));
  const notes = parseOptionalString(formData.get("notes"));

  const repo = getRecipeRepository();
  let recipe = await repo.findActiveRecipe(serviceId, vehicleCategory, processStep, itemId);

  if (!recipe) {
    const item = await getInventoryRepository().getItem(itemId);
    if (!item) return { error: "Produto não encontrado." };
    try {
      recipe = await createRecipe({ serviceId, itemId, vehicleCategory, processStep, unit: item.unit as InventoryUnit, dilutionRatio, notes: null });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Falha ao criar receita para esta combinação." };
    }
  }

  if (recipe.status === "suspensa") {
    return { error: "A receita desta combinação está suspensa — crie uma nova versão em /estoque/receitas antes de calibrar." };
  }

  try {
    await addSample({
      recipeId: recipe.id,
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
    return { error: err instanceof Error ? err.message : "Falha ao registrar a amostra." };
  }

  revalidatePath("/estoque/receitas");
  revalidatePath(`/estoque/receitas/${recipe.id}`);
  revalidatePath("/estoque");
  redirect(`/estoque/receitas/${recipe.id}`);
}
