import "server-only";
import { and, eq, lte, gte } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { auditLogs } from "@/db/schema/system";
import { goalBonusTiers, goals } from "@/db/schema";
import type { Goal, GoalArea, GoalPace, GoalProgress, SetMonthlyGoalInput, SetMonthlyGoalResult } from "@/lib/goals/types";

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

const MONTH_NAMES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function lastDayOfMonthIso(year: number, month: number): string {
  // Dia 0 do mês seguinte = último dia do mês pedido (aritmética de calendário pura, sem fuso).
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, 10);
}

const GOAL_AREA_LABEL: Record<GoalArea, string> = { consolidado: "Consolidado", lavacao: "Estética/Lavação", estacionamento: "Estacionamento" };
const VALID_GOAL_AREAS = new Set<GoalArea>(["consolidado", "lavacao", "estacionamento"]);

/**
 * Missão 32 (Etapa D) / Missão 36 — o menor CRUD possível para uma meta mensal de UMA área
 * específica (Meta Geral = `consolidado`, Meta Estética = `lavacao`): um único upsert por
 * `(area, periodStart)`, reaproveitando o índice único já existente
 * (`goals_area_period_start_idx`) para garantir, no próprio banco, que nunca existam duas metas
 * ativas da MESMA área para o mesmo mês — não é uma checagem de aplicação, é uma garantia
 * estrutural. Como `area` sempre faz parte da chave do upsert, esta função NUNCA consegue tocar a
 * linha de outra área, mesmo por engano — definir a Meta Estética nunca sobrescreve a Meta Geral,
 * e vice-versa. Nunca toca `goal_bonus_tiers` (essa tela não lida com premiação) nem qualquer
 * meta de outro período.
 */
export async function setMonthlyGoal(input: SetMonthlyGoalInput, actorUserId: string | null): Promise<SetMonthlyGoalResult> {
  if (!VALID_GOAL_AREAS.has(input.area)) {
    return { status: "invalid", reason: "Área de meta inválida." };
  }
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
    return { status: "invalid", reason: "O valor da meta precisa ser um número maior que zero." };
  }
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    return { status: "invalid", reason: "Mês inválido." };
  }
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    return { status: "invalid", reason: "Ano inválido." };
  }

  const db = getDb();
  if (!db) throw new Error("setMonthlyGoal exige DATABASE_URL configurada.");

  const periodStart = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  const periodEnd = lastDayOfMonthIso(input.year, input.month);
  const label = `Meta mensal — ${GOAL_AREA_LABEL[input.area]} (${MONTH_NAMES_PT[input.month - 1]}/${input.year})`;
  const targetAmount = String(Math.round(input.targetAmount * 100) / 100);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(goals).where(and(eq(goals.area, input.area), eq(goals.periodStart, periodStart))).limit(1);

    const [row] = await tx
      .insert(goals)
      .values({ area: input.area, label, targetAmount, periodStart, periodEnd, active: true, source: "manual" })
      .onConflictDoUpdate({
        target: [goals.area, goals.periodStart],
        set: { label, targetAmount, periodEnd, active: true, updatedAt: new Date() },
      })
      .returning();

    await tx.insert(auditLogs).values({
      actorUserId,
      action: existing ? "goal_monthly_updated" : "goal_monthly_created",
      entityType: "goals",
      entityId: row.id,
      beforeState: existing ? { area: existing.area, targetAmount: existing.targetAmount, periodStart: existing.periodStart, periodEnd: existing.periodEnd, active: existing.active } : null,
      afterState: { area: row.area, targetAmount: row.targetAmount, periodStart: row.periodStart, periodEnd: row.periodEnd, active: row.active },
      source: "manual",
      notes: null,
    });

    const goal: Goal = { id: row.id, area: row.area, label: row.label, targetAmount: Number(row.targetAmount), periodStart: row.periodStart, periodEnd: row.periodEnd, bonusTiers: [] };
    return { status: existing ? "updated" : "created", goal };
  });
}
