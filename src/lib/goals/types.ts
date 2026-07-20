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
