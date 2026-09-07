"use server";

import { revalidatePath } from "next/cache";
import { setConsolidatedMonthlyGoal } from "@/lib/goals/service";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Missão 32 (Etapa D) — o menor CRUD possível para a meta mensal consolidada exibida no Painel
 * Gerencial. Segue o padrão `useActionState` já usado em outras ações de risco baixo/médio do
 * projeto (ex.: `reverseConsumptionAction`, `resolvePlateConflictSameVehicleAction`): nunca
 * lança para o cliente, sempre devolve `{error, success}`.
 */
export interface SetMonthlyGoalActionState {
  error: string | null;
  success: string | null;
}

export async function setMonthlyGoalAction(_prevState: SetMonthlyGoalActionState, formData: FormData): Promise<SetMonthlyGoalActionState> {
  const targetAmountRaw = String(formData.get("targetAmount") ?? "").trim();
  const monthRaw = String(formData.get("month") ?? "").trim(); // "YYYY-MM" (input type="month")

  const targetAmount = Number(targetAmountRaw.replace(",", "."));
  const [yearStr, monthStr] = monthRaw.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!targetAmountRaw || Number.isNaN(targetAmount)) {
    return { error: "Informe um valor de meta válido.", success: null };
  }
  if (!monthRaw || Number.isNaN(year) || Number.isNaN(month)) {
    return { error: "Informe o mês correspondente à meta.", success: null };
  }

  const user = await getCurrentUser();
  const result = await setConsolidatedMonthlyGoal({ targetAmount, year, month }, user?.id ?? null);

  if (result.status === "invalid") {
    return { error: result.reason, success: null };
  }

  revalidatePath("/painel-gerencial");
  return {
    error: null,
    success: result.status === "created" ? "Meta mensal criada." : "Meta mensal atualizada.",
  };
}
