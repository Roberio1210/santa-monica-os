import type { ServiceArea } from "@/lib/zezinho/situational/hours";

/**
 * Contexto Situacional (Etapa 0 — ver docs/zezinho-4.0-architecture.md, seção 3). Computado
 * sempre, antes do planner, sem I/O — é a moldura que o raciocínio (Etapa 4) consulta para
 * decidir se uma comparação de período faz sentido agora ou se a amostra do dia ainda é
 * pequena demais para qualquer conclusão.
 *
 * `stage` propositalmente NÃO inclui "pico" nesta etapa (Z1): sem dado histórico real de
 * horário de maior movimento (isso vem de `historical_pattern`, Z2), qualquer janela de "pico"
 * seria um palpite, não um fato. "Pico" é adicionado quando o Z2 tiver o histograma real.
 */
export type OperationalStage = "fechado" | "pre_abertura" | "abertura" | "meio_expediente" | "fechamento";

/** Quão segura é uma conclusão baseada nos dados de hoje até agora, por área. */
export type SampleConfidence = "indisponivel" | "insuficiente" | "parcial" | "completa";

export interface AreaStatus {
  area: ServiceArea;
  isOpen: boolean;
  stage: OperationalStage;
  minutesSinceOpen: number | null;
  minutesUntilClose: number | null;
  sampleConfidence: SampleConfidence;
}

export interface SituationalContext {
  nowIso: string;
  timeHM: string;
  weekdayIndex: number;
  weekdayLabel: string;
  areas: Record<ServiceArea, AreaStatus>;
}
