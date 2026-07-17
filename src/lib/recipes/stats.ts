import type { CalibrationSample } from "@/lib/recipes/types";

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface RecipeStats {
  median: number | null;
  min: number | null;
  max: number | null;
  validSampleCount: number;
}

/** Amostras excluídas (status "excluida") nunca entram no cálculo — mas continuam no histórico. */
export function computeMedian(sortedValues: number[]): number {
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return round3((sortedValues[mid - 1] + sortedValues[mid]) / 2);
  }
  return sortedValues[mid];
}

/**
 * Estatísticas de uma receita a partir das amostras válidas do `concentrateConsumed` (nunca do
 * volume bruto preparado) — mediana como consumo esperado, nunca uma média global entre
 * veículos/serviços diferentes.
 */
export function computeRecipeStats(samples: CalibrationSample[]): RecipeStats {
  const valid = samples.filter((s) => s.status === "valida");
  if (valid.length === 0) {
    return { median: null, min: null, max: null, validSampleCount: 0 };
  }

  const values = valid.map((s) => s.concentrateConsumed).sort((a, b) => a - b);

  return {
    median: computeMedian(values),
    min: values[0],
    max: values[values.length - 1],
    validSampleCount: valid.length,
  };
}
