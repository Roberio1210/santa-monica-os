import "server-only";
import { and, eq, lte, gte } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { goalBonusTiers, goals } from "@/db/schema";
import type { Goal, GoalArea, GoalPace, GoalProgress } from "@/lib/goals/types";

/**
 * Metas (Sprint 4.0) — nada hardcoded: todo valor vem da tabela `goals`/`goal_bonus_tiers`
 * (ver src/db/schema/goals.ts). Sem Postgres configurado, `fetchActiveGoal` devolve `null`
 * honestamente — nunca uma meta inventada. `computeGoalProgress` é pura (sem I/O), testável
 * isoladamente.
 */

function diffDays(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/** Meta ativa de uma área para uma data — a que tem `periodStart <= asOfDate <= periodEnd`. Nunca reaproveita a meta de outro mês por engano. */
export async function fetchActiveGoal(area: GoalArea, asOfDate: string): Promise<Goal | null> {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(goals)
    .where(and(eq(goals.area, area), eq(goals.active, true), lte(goals.periodStart, asOfDate), gte(goals.periodEnd, asOfDate)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const tierRows = await db.select().from(goalBonusTiers).where(eq(goalBonusTiers.goalId, row.id)).orderBy(goalBonusTiers.sortOrder);

  return {
    id: row.id,
    area: row.area,
    label: row.label,
    targetAmount: Number(row.targetAmount),
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    bonusTiers: tierRows.map((t) => ({ thresholdAmount: Number(t.thresholdAmount), bonusAmount: Number(t.bonusAmount), description: t.description })),
  };
}

const PACE_TOLERANCE = 0.05;

/**
 * Progresso de uma meta — pura, sem I/O. Projeção é sempre linear (ritmo atual mantido até o
 * fim do período) e sempre rotulada como projeção na saída (`projectedAmount`), nunca misturada
 * com o valor real (`currentAmount`).
 */
export function computeGoalProgress(goal: Goal, currentAmount: number, asOfDate: string): GoalProgress {
  const daysTotal = diffDays(goal.periodStart, goal.periodEnd) + 1;
  const daysElapsedRaw = diffDays(goal.periodStart, asOfDate) + 1;
  const daysElapsed = Math.min(Math.max(daysElapsedRaw, 0), daysTotal);

  const percentComplete = goal.targetAmount > 0 ? Math.round((currentAmount / goal.targetAmount) * 10000) / 100 : 0;
  const remainingAmount = Math.max(0, Math.round((goal.targetAmount - currentAmount) * 100) / 100);

  let projectedAmount: number | null = null;
  let projectedPercent: number | null = null;
  let pace: GoalPace = "indeterminado";

  if (daysElapsed > 0 && daysTotal > 0) {
    projectedAmount = Math.round((currentAmount / daysElapsed) * daysTotal * 100) / 100;
    projectedPercent = goal.targetAmount > 0 ? Math.round((projectedAmount / goal.targetAmount) * 10000) / 100 : 0;

    const ratio = goal.targetAmount > 0 ? projectedAmount / goal.targetAmount : 0;
    if (ratio >= 1 + PACE_TOLERANCE) pace = "acima_do_ritmo";
    else if (ratio >= 1 - PACE_TOLERANCE) pace = "no_ritmo";
    else pace = "abaixo_do_ritmo";
  }

  const sortedTiers = [...goal.bonusTiers].sort((a, b) => a.thresholdAmount - b.thresholdAmount);
  const nextBonusTier = sortedTiers.find((t) => t.thresholdAmount > currentAmount) ?? null;
  const amountToNextBonus = nextBonusTier ? Math.round((nextBonusTier.thresholdAmount - currentAmount) * 100) / 100 : null;

  return { goal, currentAmount, percentComplete, remainingAmount, daysElapsed, daysTotal, projectedAmount, projectedPercent, pace, nextBonusTier, amountToNextBonus };
}
