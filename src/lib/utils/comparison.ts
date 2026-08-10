import type { PeriodComparison } from "@/lib/utils/timezone";
import type { Trend } from "@/types/common";

/**
 * Missão 29 — converte uma `PeriodComparison` (lib/utils/timezone.ts) no formato que `StatCard`
 * já sabe exibir (seta + percentual). `invertGoodDirection` inverte as cores (ex.: despesas: uma
 * queda é "boa", mas continua sendo mostrada com a seta para baixo — só a leitura muda, nunca a
 * seta) — deixado de fora aqui de propósito: cor é decisão do componente, não do dado.
 */
export function comparisonToTrend(comparison: PeriodComparison, label = "vs período anterior"): Trend {
  if (comparison.percent === null) {
    return { direction: comparison.delta === 0 ? "flat" : comparison.delta > 0 ? "up" : "down", value: 0, label: "sem base no período anterior" };
  }
  const direction = comparison.percent > 0.05 ? "up" : comparison.percent < -0.05 ? "down" : "flat";
  return { direction, value: Math.round(Math.abs(comparison.percent) * 10) / 10, label };
}
