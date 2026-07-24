import type { DirectorDailySnapshot } from "@/lib/zezinho/directors/organizationalMemory/types";
import type { DirectorReport } from "@/lib/zezinho/directors/types";
import type { Fact, FactDirection } from "@/lib/zezinho/reasoning/types";

/**
 * Memória Operacional (Sprint 5.0, Z3B) — leitura diária por Diretor, a base para notas como "já
 * é o 3º dia de queda no ticket médio". Nenhum cálculo novo: só escolhe qual sinal do dia é o mais
 * relevante para acompanhar (risco > oportunidade > hipótese principal > fato isolado com
 * tendência) e compara com dias anteriores — nunca inventa um número, nunca aponta tendência sem
 * amostra suficiente.
 */

export interface SnapshotCandidate {
  summary: string;
  metricKey: string | null;
  direction: FactDirection;
  evidenceFactKeys: string[];
}

/**
 * `null` quando o Diretor não teve nenhum sinal digno de acompanhar no dia (ex.: RH sem fonte
 * real) — nunca grava uma leitura vazia só para preencher a tabela.
 */
export function summarizeDirectorForSnapshot(report: DirectorReport): SnapshotCandidate | null {
  const factByKey = new Map<string, Fact>(report.facts.map((f) => [f.key, f]));

  const claim = report.risks[0] ?? report.opportunities[0] ?? (report.hypotheses[0] ? { statement: report.hypotheses[0].description, evidenceFactKeys: report.hypotheses[0].evidenceFactKeys } : null);
  if (claim) {
    const fact = claim.evidenceFactKeys.map((key) => factByKey.get(key)).find((f): f is Fact => f !== undefined) ?? null;
    return { summary: claim.statement, metricKey: fact?.key ?? null, direction: fact?.direction ?? "indisponivel", evidenceFactKeys: claim.evidenceFactKeys };
  }

  const dominantFact = report.facts.find((f) => f.direction === "aumento" || f.direction === "queda");
  if (dominantFact) return { summary: dominantFact.statement, metricKey: dominantFact.key, direction: dominantFact.direction, evidenceFactKeys: [dominantFact.key] };

  return null;
}

/** Abaixo disso, não há "tendência" para apontar — mesma disciplina de `historical-pattern.ts` desde a Sprint 4.0/Z2. */
const MIN_CONSECUTIVE_DAYS_FOR_NOTE = 2;

/**
 * `history` deve vir ordenado por data crescente e já incluir a leitura de hoje como último item.
 * Conta quantos dias consecutivos (a partir de hoje, andando para trás) repetem a mesma métrica +
 * direção — só then vira uma nota; caso contrário, `null`, honestamente.
 */
export function computeMemoryNote(history: DirectorDailySnapshot[]): string | null {
  if (history.length === 0) return null;
  const today = history[history.length - 1];
  if (today.direction !== "aumento" && today.direction !== "queda") return null;
  if (!today.metricKey) return null;

  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const day = history[i];
    if (day.metricKey === today.metricKey && day.direction === today.direction) streak++;
    else break;
  }

  if (streak < MIN_CONSECUTIVE_DAYS_FOR_NOTE) return null;

  return `Já é o ${streak}º dia consecutivo de ${today.direction} em "${today.metricKey}".`;
}
