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

describe("computeGoalProgress — Missão 32 (progresso 0%/exato/ultrapassado, sem NaN/Infinity)", () => {
  it("3. progresso 0% (nenhum faturamento ainda no mês) -> percentComplete 0, falta = meta inteira, sem crash", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, 0, "2026-07-10");
    expect(progress.percentComplete).toBe(0);
    expect(progress.remainingAmount).toBe(goal.targetAmount);
    expect(Number.isFinite(progress.percentComplete)).toBe(true);
  });

  it("5. meta exatamente atingida (100%) -> percentComplete 100, falta = 0", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, goal.targetAmount, "2026-07-20");
    expect(progress.percentComplete).toBe(100);
    expect(progress.remainingAmount).toBe(0);
  });

  it("6. meta ultrapassada -> percentComplete real (>100%) exibido no texto, falta continua 0 (nunca negativa)", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, goal.targetAmount * 1.4, "2026-07-20");
    expect(progress.percentComplete).toBeGreaterThan(100);
    expect(progress.remainingAmount).toBe(0); // 7. falta nunca negativa
  });

  it("8. targetAmount 0 (edge case defensivo) -> nunca NaN/Infinity em percentComplete/projectedPercent", () => {
    const goal: Goal = { ...lavacaoGoal(), targetAmount: 0 };
    const progress = computeGoalProgress(goal, 1000, "2026-07-15");
    expect(Number.isFinite(progress.percentComplete)).toBe(true);
    expect(progress.projectedPercent === null || Number.isFinite(progress.projectedPercent)).toBe(true);
    expect(progress.remainingAmount).toBe(0);
  });

  it("8b. currentAmount muito alto -> projectedAmount/projectedPercent continuam números finitos, nunca Infinity", () => {
    const goal = lavacaoGoal();
    const progress = computeGoalProgress(goal, 999_999_999, "2026-07-16");
    expect(Number.isFinite(progress.projectedAmount ?? 0)).toBe(true);
    expect(Number.isFinite(progress.projectedPercent ?? 0)).toBe(true);
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
