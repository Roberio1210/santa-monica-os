import { extractCounterpartyKey } from "@/lib/finance/bankStatement/normalization";
import type { BankStatementLine, BankStatementLineDirection, BankStatementLineType } from "@/lib/finance/bankStatement/types";

/**
 * Missão Financeiro V2.2 (Fase C) — agrupamento puro por padrão (contraparte + direção + tipo),
 * nunca lançamento por lançamento. Cada grupo carrega as estatísticas que a revisão em lote
 * precisa mostrar ANTES de qualquer confirmação (Fase I): quantidade, período, valores,
 * recorrência.
 */
export interface BankStatementLineGroup {
  groupKey: string;
  counterpartyKey: string;
  direction: BankStatementLineDirection;
  type: BankStatementLineType;
  lines: BankStatementLine[];
  count: number;
  totalAmount: number;
  averageAmount: number;
  minAmount: number;
  maxAmount: number;
  periodFrom: string;
  periodTo: string;
  /** Meses distintos em que o padrão aparece — sinal de recorrência real, nunca coincidência de 1 mês. */
  distinctMonths: number;
  /** Dias do mês em que a linha ocorre (ex.: sempre perto do dia 10) — apoio a RECURRENCE_PATTERN. */
  daysOfMonth: number[];
}

function buildGroupKey(counterpartyKey: string, direction: BankStatementLineDirection, type: BankStatementLineType): string {
  return `${direction}|${type}|${counterpartyKey}`;
}

export function groupBankStatementLines(lines: BankStatementLine[]): BankStatementLineGroup[] {
  const buckets = new Map<string, BankStatementLine[]>();

  for (const line of lines) {
    const counterpartyKey = extractCounterpartyKey(line.description);
    const key = buildGroupKey(counterpartyKey, line.direction, line.type);
    const bucket = buckets.get(key) ?? [];
    bucket.push(line);
    buckets.set(key, bucket);
  }

  const groups: BankStatementLineGroup[] = [];
  for (const [groupKey, groupLines] of buckets) {
    const amounts = groupLines.map((l) => l.amount);
    const dates = groupLines.map((l) => l.date).sort();
    const months = new Set(groupLines.map((l) => l.date.slice(0, 7)));
    const daysOfMonth = [...new Set(groupLines.map((l) => Number(l.date.slice(8, 10))))].sort((a, b) => a - b);
    const total = Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100;

    groups.push({
      groupKey,
      counterpartyKey: extractCounterpartyKey(groupLines[0].description),
      direction: groupLines[0].direction,
      type: groupLines[0].type,
      lines: groupLines,
      count: groupLines.length,
      totalAmount: total,
      averageAmount: Math.round((total / groupLines.length) * 100) / 100,
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      periodFrom: dates[0],
      periodTo: dates[dates.length - 1],
      distinctMonths: months.size,
      daysOfMonth,
    });
  }

  return groups.sort((a, b) => b.count - a.count || b.totalAmount - a.totalAmount);
}
