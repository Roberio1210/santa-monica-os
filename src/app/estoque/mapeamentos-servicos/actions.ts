"use server";

import { revalidatePath } from "next/cache";
import { confirmServiceMapping, unmapService } from "@/lib/jumppark-orders/service-mapping";

async function revalidate() {
  revalidatePath("/estoque/mapeamentos-servicos");
  revalidatePath("/estoque/ordens");
  revalidatePath("/estoque/consumo-automatico");
}

/**
 * Confirmação humana explícita do texto real do JumpPark → serviço canônico (Missão de
 * Automação JumpPark → Consumo, seção 7). Nunca por preço, nunca por aproximação — cada
 * confirmação é uma decisão individual do usuário nesta tela.
 */
export async function confirmServiceMappingAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const canonicalServiceId = String(formData.get("canonicalServiceId") ?? "");
  if (!id || !canonicalServiceId) throw new Error("Selecione um serviço do catálogo antes de confirmar.");
  await confirmServiceMapping(id, canonicalServiceId);
  await revalidate();
}

/** Volta um mapeamento confirmado para "não mapeado" — nunca apaga a linha, preserva o texto original. */
export async function unmapServiceMappingAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Mapeamento não identificado.");
  await unmapService(id);
  await revalidate();
}
