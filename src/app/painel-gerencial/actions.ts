"use server";

import { revalidatePath } from "next/cache";
import { setMonthlyGoal } from "@/lib/goals/service";
import type { GoalArea } from "@/lib/goals/types";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Missão 32 (Etapa D) / Missão 36 — o menor CRUD possível para uma meta mensal de UMA área
 * (Meta Geral = `consolidado`, Meta Estética = `lavacao`) exibida no Painel Gerencial. `area`
 * vem SEMPRE explícita no `FormData` (campo oculto no formulário de cada card, ver
 * `GoalSection`/`GoalForm`) — nunca inferida, nunca com valor padrão que possa apontar para a
 * área errada. Segue o padrão `useActionState` já usado em outras ações de risco baixo/médio do
 * projeto (ex.: `reverseConsumptionAction`, `resolvePlateConflictSameVehicleAction`): nunca
 * lança para o cliente, sempre devolve `{error, success}`.
 */
export interface SetMonthlyGoalActionState {
  error: string | null;
  success: string | null;
}

const VALID_GOAL_AREAS = new Set<GoalArea>(["consolidado", "lavacao", "estacionamento"]);

export async function setMonthlyGoalAction(_prevState: SetMonthlyGoalActionState, formData: FormData): Promise<SetMonthlyGoalActionState> {
  const areaRaw = String(formData.get("area") ?? "").trim();
  const targetAmountRaw = String(formData.get("targetAmount") ?? "").trim();
  const monthRaw = String(formData.get("month") ?? "").trim(); // "YYYY-MM" (input type="month")

  if (!VALID_GOAL_AREAS.has(areaRaw as GoalArea)) {
    return { error: "Área da meta não identificada — recarregue a página e tente novamente.", success: null };
  }
  const area = areaRaw as GoalArea;

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
  const result = await setMonthlyGoal({ area, targetAmount, year, month }, user?.id ?? null);

  if (result.status === "invalid") {
    return { error: result.reason, success: null };
  }

  revalidatePath("/painel-gerencial");
  return {
    error: null,
    success: result.status === "created" ? "Meta mensal criada." : "Meta mensal atualizada.",
  };
}
