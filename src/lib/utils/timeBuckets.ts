import { addDaysIso } from "@/lib/utils/timezone";

/**
 * Missão 32 — utilitários de bucketing por data, extraídos de `serviceAnalytics.ts`/
 * `servicesQuery.ts` (Missão 31) para reuso em Fornecedores sem uma terceira cópia manual do
 * cálculo de semana ISO (facilmente errado de reimplementar). Nenhuma mudança de comportamento —
 * mesma lógica, só centralizada.
 */

export type TimeGranularity = "day" | "week" | "month";

export function isoWeekBucket(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const dayNum = (d.getUTCDay() + 6) % 7; // segunda=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // quinta-feira da semana ISO
  const isoYearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - isoYearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function timeBucketOf(dateIso: string, granularity: TimeGranularity): string {
  if (granularity === "day") return dateIso;
  if (granularity === "week") return isoWeekBucket(dateIso);
  return dateIso.slice(0, 7);
}

export function dailyBuckets(from: string, to: string): string[] {
  const buckets: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    buckets.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return buckets;
}

/**
 * Amostragem a cada 7 dias a partir de `from` sempre cobre exatamente as semanas ISO tocadas
 * pelo intervalo [from, to], mesmo quando `from` não cai numa segunda-feira — a filiação a uma
 * semana ISO é periódica de 7 em 7 dias, então o passo de amostragem nunca pula nem repete uma
 * semana, independente do dia da semana em que `from` começa.
 */
export function weeklyBuckets(from: string, to: string): string[] {
  const buckets = new Set<string>();
  let cursor = from;
  while (cursor <= to) {
    buckets.add(isoWeekBucket(cursor));
    cursor = addDaysIso(cursor, 7);
  }
  return Array.from(buckets).sort();
}

export function monthlyBuckets(monthsBack: number, asOfMonth: string): string[] {
  const [year, month] = asOfMonth.split("-").map(Number);
  const buckets: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    buckets.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return buckets;
}
