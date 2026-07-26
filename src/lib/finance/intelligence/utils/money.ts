/**
 * Aritmética monetária cents-safe (Sprint 8) — mesmo padrão já usado em `reconciliationSummary.ts`
 * e `financialSchedule.ts` (mirrorado, nunca importado — módulos independentes por camada).
 * Nunca soma `number` decimal diretamente: sempre converte para centavos (inteiro), soma, e só
 * converte de volta a decimal no resultado final.
 */

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function centsToAmount(cents: number): number {
  return cents / 100;
}

export function sumCents(amounts: number[]): number {
  return amounts.reduce((sum, a) => sum + toCents(a), 0);
}

export function sumAmounts(amounts: number[]): number {
  return centsToAmount(sumCents(amounts));
}

/** 0-100, arredondado a 2 casas. `0` quando `total` é 0 — nunca `NaN`/`Infinity` propagado para uma métrica. */
export function percentageOf(part: number, total: number): number {
  const totalCents = toCents(total);
  if (totalCents === 0) return 0;
  return Math.round(((toCents(part) / totalCents) * 100) * 100) / 100;
}

export function average(amounts: number[]): number {
  if (amounts.length === 0) return 0;
  return centsToAmount(Math.round(sumCents(amounts) / amounts.length));
}
