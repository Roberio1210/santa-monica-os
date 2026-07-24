import type { Learning, LearningStatus } from "@/lib/zezinho/directors/organizationalMemory/types";
import type { DirectorReport } from "@/lib/zezinho/directors/types";
import type { ConfidenceLevel } from "@/lib/zezinho/reasoning/types";

/**
 * Memória Organizacional (Sprint 5.0, Z3B, decisão do usuário) — o pipeline Evento → Observação →
 * Aprendizado → Conhecimento. "Evento" é a `Hypothesis` que cada Diretor já calcula todo dia
 * (nunca um cálculo novo); a partir daqui, tudo é comparação determinística de recorrência real,
 * nunca uma promoção automática sem evidência (mesmo princípio simétrico se aplica a não-demover:
 * uma vez confirmado, só evidência contrária muda o status, nunca a passagem do tempo).
 */

/** Sem confirmação em 14 dias, uma observação é esquecida — nunca acumula lixo histórico. */
export const OBSERVATION_EXPIRY_DAYS = 14;

export const MIN_CONFIRMATIONS_FOR_APRENDIZADO = 3;
export const MIN_DAYS_SPAN_FOR_APRENDIZADO = 3;
export const MIN_CONFIRMATIONS_FOR_CONHECIMENTO = 7;
export const MIN_DAYS_SPAN_FOR_CONHECIMENTO = 14;

export interface LearningCandidate {
  description: string;
  evidenceFactKeys: string[];
  confidenceLevel: ConfidenceLevel;
  limitations: string[];
}

/**
 * Chave normalizada e determinística — nunca uma correspondência "fuzzy"/semântica. Duas
 * descrições só são consideradas "a mesma observação recorrente" quando o texto normalizado é
 * idêntico; qualquer variação de redação vira uma observação nova, honesto sobre a limitação
 * (mais estrito do que perder uma recorrência real por engano).
 */
export function deriveSignalKey(description: string): string {
  return description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** As hipóteses do dia já carregam evidência e confiança — candidatos ao pipeline de aprendizado, nunca um cálculo novo. */
export function candidateSignalsFromReport(report: DirectorReport): LearningCandidate[] {
  return report.hypotheses.map((h) => ({ description: h.description, evidenceFactKeys: h.evidenceFactKeys, confidenceLevel: h.confidenceLevel, limitations: h.limitations }));
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Promoção nunca automática sem evidência de recorrência real — exige confirmações suficientes E
 * um período real (não 3 confirmações no mesmo dia). Nunca demove por thresholds — demoção exige
 * evidência contrária real, fora do escopo desta função pura (fica a cargo de quem gerencia
 * `status: "descartado"` explicitamente).
 */
export function nextStatus(current: LearningStatus, confirmationCount: number, firstObservedAt: string, lastConfirmedAt: string): LearningStatus {
  if (current === "descartado" || current === "conhecimento") return current;
  const daysSpan = daysBetween(firstObservedAt, lastConfirmedAt);
  if (current === "aprendizado") {
    if (confirmationCount >= MIN_CONFIRMATIONS_FOR_CONHECIMENTO && daysSpan >= MIN_DAYS_SPAN_FOR_CONHECIMENTO) return "conhecimento";
    return current;
  }
  if (confirmationCount >= MIN_CONFIRMATIONS_FOR_APRENDIZADO && daysSpan >= MIN_DAYS_SPAN_FOR_APRENDIZADO) return "aprendizado";
  return current;
}

export function expiryDateFrom(observedAtIso: string): string {
  const date = new Date(observedAtIso);
  date.setUTCDate(date.getUTCDate() + OBSERVATION_EXPIRY_DAYS);
  return date.toISOString();
}

export function isExpired(learning: Learning, nowIso: string): boolean {
  return learning.status === "observacao" && learning.expiresAt !== null && learning.expiresAt < nowIso;
}

/** "O que aprendemos recentemente?" — nunca inclui `"observacao"` (ainda não confirmada) nem `"descartado"` (invalidado). */
export function recentLearnings(learnings: Learning[], sinceDateIso: string): Learning[] {
  return learnings.filter((l) => l.status !== "observacao" && l.status !== "descartado" && l.lastConfirmedAt >= sinceDateIso);
}
