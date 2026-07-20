import { describe, expect, it } from "vitest";
import { computeGoalProgress } from "@/lib/goals/service";
import type { Goal } from "@/lib/goals/types";

/** Meta real da lavação (Sprint 4.0) — R$30.000 base + prêmio, +R$500 aos R$35k, +R$1.000 aos R$40k. */
function lavacaoGoal(): Goal {
  return {
    id: "g1",
    area: "lavacao",
    label: "Meta mensal — Lavação (julho/2026)",
    targetAmount: 30000,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    bonusTiers: [
      { thresholdAmount: 30000, bonusAmount: 1000, description: "Prêmio de R$1.000 dividido entre três colaboradores ao atingir a meta." },
      { thresholdAmount: 35000, bonusAmount: 500, description: "+R$500 ao atingir R$35.000." },
      { thresholdAmount: 40000, bonusAmount: 1000, description: "+R$1.000 ao atingir R$40.000." },
    ],
  };
}

describe("computeGoalProgress — percentual, ritmo e projeção", () => {
  it("metade do mês, metade da meta -> exatamente no ritmo", () => {
    const goal = lavacaoGoal(); // julho tem 31 dias
    const progress = computeGoalProgress(goal, 15000, "2026-07-16"); // dia 16 de 31 (~metade)
    expect(progress.percentComplete).toBe(50);
    expect(progress.daysTotal).toBe(31);
    expect(progress.pace).toBe("no_ritmo");
    expect(progress.projectedAmount).not.toBeNull();
  });

  it("ritmo muito abaixo do necessário -> abaixo_do_ritmo", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, 3000, "2026-07-16"); // bem abaixo de 15000 esperado
    expect(progress.pace).toBe("abaixo_do_ritmo");
    expect(progress.projectedAmount).toBeLessThan(goal.targetAmount);
  });

  it("ritmo acima do necessário -> acima_do_ritmo", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, 25000, "2026-07-16");
    expect(progress.pace).toBe("acima_do_ritmo");
    expect(progress.projectedAmount).toBeGreaterThan(goal.targetAmount);
  });

  it("nenhum dia decorrido ainda -> pace indeterminado, sem projeção inventada", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, 0, "2026-06-30"); // antes do período começar
    expect(progress.pace).toBe("indeterminado");
    expect(progress.projectedAmount).toBeNull();
  });

  it("remainingAmount nunca fica negativo mesmo passando da meta", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, 45000, "2026-07-20");
    expect(progress.remainingAmount).toBe(0);
  });
});

describe("computeGoalProgress — faixas de premiação (bug real: prêmio na própria meta, não só acima dela)", () => {
  it("abaixo de R$30.000 -> próxima faixa é a meta em si (R$30.000, prêmio R$1.000)", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, 28000, "2026-07-20");
    expect(progress.nextBonusTier?.thresholdAmount).toBe(30000);
    expect(progress.nextBonusTier?.bonusAmount).toBe(1000);
    expect(progress.amountToNextBonus).toBe(2000);
  });

  it("entre R$30.000 e R$35.000 -> próxima faixa é R$35.000 (+R$500)", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, 32000, "2026-07-25");
    expect(progress.nextBonusTier?.thresholdAmount).toBe(35000);
    expect(progress.nextBonusTier?.bonusAmount).toBe(500);
  });

  it("acima de R$40.000 -> nenhuma próxima faixa (já atingiu a maior)", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, 41000, "2026-07-28");
    expect(progress.nextBonusTier).toBeNull();
    expect(progress.amountToNextBonus).toBeNull();
  });
});
