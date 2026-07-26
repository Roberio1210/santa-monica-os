import { addDaysIso } from "@/lib/utils/timezone";
import type { NormalizedConciliation } from "@/lib/integrations/stone/normalize";
import type { PeriodBounds } from "@/lib/finance/intelligence/types";

/**
 * Recortes de período (Sprint 8) — sempre a partir de `addDaysIso` (já existente,
 * `@/lib/utils/timezone`, nunca reimplementado). Cada função devolve limites `from`/`to`
 * (`YYYY-MM-DD`, inclusive nos dois extremos).
 */

export function lastNDays(todayIso: string, n: number): PeriodBounds {
  return { from: addDaysIso(todayIso, -(n - 1)), to: todayIso };
}

/** Os `n` dias imediatamente anteriores à janela `lastNDays(todayIso, n)` — nunca sobrepõe. */
export function priorNDays(todayIso: string, n: number): PeriodBounds {
  return { from: addDaysIso(todayIso, -(2 * n - 1)), to: addDaysIso(todayIso, -n) };
}

export function singleDay(dateIso: string): PeriodBounds {
  return { from: dateIso, to: dateIso };
}

export function currentMonth(todayIso: string): PeriodBounds {
  return { from: `${todayIso.slice(0, 7)}-01`, to: todayIso };
}

export function previousMonth(todayIso: string): PeriodBounds {
  const [year, month] = todayIso.slice(0, 7).split("-").map(Number);
  const from = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

/** Filtra os dias já buscados (`multiDay.ts`) para os que caem dentro de `bounds` — nunca busca de novo. */
export function daysWithinBounds(days: NormalizedConciliation[], bounds: PeriodBounds): NormalizedConciliation[] {
  return days.filter((d) => d.referenceDate >= bounds.from && d.referenceDate <= bounds.to);
}

/** Rótulo de semana ISO (`AAAA-Www`) de uma data — usado para agrupar receita semanal. */
export function isoWeekLabel(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  const dayNumber = (date.getUTCDay() + 6) % 7; // 0 = segunda
  date.setUTCDate(date.getUTCDate() - dayNumber + 3); // quinta-feira da mesma semana ISO
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function monthLabel(dateIso: string): string {
  return dateIso.slice(0, 7);
}
