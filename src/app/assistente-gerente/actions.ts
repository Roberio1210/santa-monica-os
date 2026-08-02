"use server";

import { revalidatePath } from "next/cache";
import { registerDiscount, markNotificationSeen } from "@/lib/manager-assistant/service";
import type { CreateDiscountInput, Discount } from "@/lib/manager-assistant/types";

export interface DiscountFormState {
  error: string | null;
  discount: Discount | null;
}

export async function registerDiscountAction(input: CreateDiscountInput): Promise<DiscountFormState> {
  try {
    const discount = await registerDiscount(input);
    revalidatePath("/assistente-gerente");
    revalidatePath(`/atendimento/ordens/${input.serviceOrderId}`);
    revalidatePath("/operacao");
    return { error: null, discount };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar o desconto.", discount: null };
  }
}

export async function markNotificationSeenAction(notificationId: string): Promise<void> {
  await markNotificationSeen(notificationId, "vista");
  revalidatePath("/assistente-gerente");
  revalidatePath("/operacao");
}
