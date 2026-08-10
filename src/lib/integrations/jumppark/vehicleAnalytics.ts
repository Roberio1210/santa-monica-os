/**
 * Missão 30 (módulo gerencial de Veículos) — agregações puras (sem I/O) sobre o histórico de
 * datas de visita de um veículo. Reaproveita `serviceCategoryOf` de `customerServiceProfile.ts`
 * (mesma normalização de categoria de serviço usada em Clientes — nunca duplicada aqui).
 */

export function averageIntervalDays(datesSortedAsc: string[]): number | null {
  const distinct = Array.from(new Set(datesSortedAsc)).sort();
  if (distinct.length < 2) return null;
  let totalGap = 0;
  for (let i = 1; i < distinct.length; i++) {
    totalGap += daysBetween(distinct[i - 1], distinct[i]);
  }
  return Math.round(totalGap / (distinct.length - 1));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export type FrequencyTrendDirection = "aumentando" | "caindo" | "estavel" | "indefinido";

export interface FrequencyTrend {
  direction: FrequencyTrendDirection;
  /** Intervalo entre as duas visitas mais recentes — null quando há menos de 2 visitas. */
  recentGapDays: number | null;
  /** Média de intervalo entre as visitas anteriores a essas duas últimas — null quando não há histórico suficiente para uma base de comparação (precisa de pelo menos 3 visitas no total). */
  historicalAverageDays: number | null;
}

/**
 * Compara o intervalo mais recente com a média histórica do PRÓPRIO veículo (nunca um limiar
 * global inventado). "Aumentando" = veículo está voltando mais rápido que o de costume (gap
 * recente < 70% da média histórica); "caindo" = está demorando mais para voltar (gap recente >
 * 130% da média histórica); "estável" = dentro dessa faixa. "Indefinido" quando não há pelo menos
 * 3 visitas distintas (não dá para separar "gap recente" de "base histórica").
 */
export function computeFrequencyTrend(datesSortedAsc: string[]): FrequencyTrend {
  const distinct = Array.from(new Set(datesSortedAsc)).sort();
  if (distinct.length < 3) {
    const recentGapDays = distinct.length === 2 ? daysBetween(distinct[0], distinct[1]) : null;
    return { direction: "indefinido", recentGapDays, historicalAverageDays: null };
  }

  const recentGapDays = daysBetween(distinct[distinct.length - 2], distinct[distinct.length - 1]);
  const historicalAverageDays = averageIntervalDays(distinct.slice(0, -1));

  if (historicalAverageDays === null || historicalAverageDays === 0) {
    return { direction: "indefinido", recentGapDays, historicalAverageDays };
  }

  const ratio = recentGapDays / historicalAverageDays;
  const direction: FrequencyTrendDirection = ratio < 0.7 ? "aumentando" : ratio > 1.3 ? "caindo" : "estavel";
  return { direction, recentGapDays, historicalAverageDays };
}

/**
 * "Costumava vir e deixou de vir": veículo recorrente (`minVisits`+ visitas distintas) cujos dias
 * sem retorno já ultrapassam `multiplier`x seu próprio intervalo médio histórico — uma régua
 * pessoal do veículo, não um limiar global de "risco" inventado. Retorna `false` quando não há
 * base histórica suficiente (nunca assume inatividade sem poder comparar contra um padrão real).
 */
export function hasStoppedComing(datesSortedAsc: string[], daysSinceLastVisit: number | null, minVisits = 3, multiplier = 2): boolean {
  const distinct = Array.from(new Set(datesSortedAsc)).sort();
  if (distinct.length < minVisits || daysSinceLastVisit === null) return false;
  const avg = averageIntervalDays(distinct);
  if (avg === null || avg === 0) return false;
  return daysSinceLastVisit > avg * multiplier;
}

export interface ServiceCombination {
  categories: [string, string];
  count: number;
}

/** Pares de categorias de serviço que mais aparecem JUNTOS na mesma ordem — `categoriesByOrder` já deve vir sem duplicatas por ordem (um Set por ordem). */
export function topServiceCombinations(categoriesByOrder: string[][], limit = 5): ServiceCombination[] {
  const pairCounts = new Map<string, number>();
  for (const categories of categoriesByOrder) {
    const distinct = Array.from(new Set(categories)).sort();
    for (let i = 0; i < distinct.length; i++) {
      for (let j = i + 1; j < distinct.length; j++) {
        const key = `${distinct[i]}|||${distinct[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  return Array.from(pairCounts.entries())
    .map(([key, count]) => {
      const [a, b] = key.split("|||");
      return { categories: [a, b] as [string, string], count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
