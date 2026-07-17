"use server";

import { revalidatePath } from "next/cache";
import { confirmSuggestion, markSuggestionPending, rejectSuggestion, replaceSuggestionItem } from "@/lib/inventory/suggestions";

async function revalidate() {
  revalidatePath("/estoque/mapeamentos");
  revalidatePath("/estoque/pendencias");
  revalidatePath("/estoque");
}

export async function confirmSuggestionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Sugestão não identificada.");
  await confirmSuggestion(id);
  await revalidate();
}

export async function rejectSuggestionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Sugestão não identificada.");
  await rejectSuggestion(id);
  await revalidate();
}

export async function markSuggestionPendingAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Sugestão não identificada.");
  await markSuggestionPending(id);
  await revalidate();
}

export async function replaceSuggestionItemAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const newItemId = String(formData.get("newItemId") ?? "");
  if (!id || !newItemId) throw new Error("Dados insuficientes para substituir o produto.");
  await replaceSuggestionItem(id, newItemId);
  await revalidate();
}
