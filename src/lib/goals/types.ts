export type GoalArea = "lavacao" | "estacionamento" | "consolidado";

export interface GoalBonusTier {
  thresholdAmount: number;
  bonusAmount: number;
  description: string;
}

export interface Goal {
  id: string;
  area: GoalArea;
  label: string;
  targetAmount: number;
  periodStart: string;
  periodEnd: string;
  bonusTiers: GoalBonusTier[];
}

export type GoalPace = "acima_do_ritmo" | "no_ritmo" | "abaixo_do_ritmo" | "indeterminado";

export interface GoalProgress {
  goal: Goal;
  currentAmount: number;
  percentComplete: number;
  remainingAmount: number;
  daysElapsed: number;
  daysTotal: number;
  /** Projeção linear (ritmo atual mantido até o fim do período) — sempre rotulada como projeção, nunca certeza. */
  projectedAmount: number | null;
  projectedPercent: number | null;
  pace: GoalPace;
  nextBonusTier: GoalBonusTier | null;
  amountToNextBonus: number | null;
}

/**
 * Missão 32 (Etapa D) / Missão 36 — entrada mínima para definir/editar uma meta mensal de
 * qualquer área. `area` é sempre explícito (nunca inferido) — quem chama decide se está mexendo
 * na Meta Geral (`consolidado`) ou na Meta Estética (`lavacao`); o upsert só pode tocar a linha
 * exata dessa área+período (índice único `(area, periodStart)`), nunca a de outra área.
 */
export interface SetMonthlyGoalInput {
  area: GoalArea;
  targetAmount: number;
  /** 1-12. */
  month: number;
  year: number;
}

export type SetMonthlyGoalResult = { status: "created" | "updated"; goal: Goal } | { status: "invalid"; reason: string };
