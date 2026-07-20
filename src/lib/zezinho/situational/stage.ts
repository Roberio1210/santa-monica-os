import { saoPauloDateISO, saoPauloTimeHM } from "@/lib/utils/timezone";
import { hoursForWeekday, type ServiceArea } from "@/lib/zezinho/situational/hours";
import type { AreaStatus, OperationalStage, SampleConfidence, SituationalContext } from "@/lib/zezinho/situational/types";

/**
 * Estágio operacional (Etapa 0 — ver docs/zezinho-4.0-architecture.md, seção 3). Pura, sem I/O:
 * dado um instante, devolve o estágio de cada área (lavação e estacionamento têm expedientes
 * diferentes — ver `hours.ts`) e o quão confiável seria qualquer conclusão baseada nos dados de
 * hoje até agora.
 */

const ABERTURA_WINDOW_MINUTES = 60;
const FECHAMENTO_WINDOW_MINUTES = 60;

const WEEKDAY_LABELS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Dia da semana (0=domingo) a partir da data ISO em São Paulo — nunca `Date.getDay()` direto, que usaria o fuso do processo/servidor, não o do negócio. */
function weekdayFromIso(dateIso: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function computeAreaStatus(area: ServiceArea, weekdayIndex: number, nowMinutes: number): AreaStatus {
  const hours = hoursForWeekday(area, weekdayIndex);

  if (!hours) {
    return { area, isOpen: false, stage: "fechado", minutesSinceOpen: null, minutesUntilClose: null, sampleConfidence: "indisponivel" };
  }

  const openMinutes = toMinutes(hours.open);
  const closeMinutes = toMinutes(hours.close);

  if (nowMinutes < openMinutes) {
    return { area, isOpen: false, stage: "pre_abertura", minutesSinceOpen: null, minutesUntilClose: null, sampleConfidence: "indisponivel" };
  }
  if (nowMinutes >= closeMinutes) {
    return { area, isOpen: false, stage: "fechado", minutesSinceOpen: closeMinutes - openMinutes, minutesUntilClose: null, sampleConfidence: "completa" };
  }

  const minutesSinceOpen = nowMinutes - openMinutes;
  const minutesUntilClose = closeMinutes - nowMinutes;

  let stage: OperationalStage;
  let sampleConfidence: SampleConfidence;
  if (minutesSinceOpen < ABERTURA_WINDOW_MINUTES) {
    stage = "abertura";
    sampleConfidence = "insuficiente";
  } else if (minutesUntilClose <= FECHAMENTO_WINDOW_MINUTES) {
    stage = "fechamento";
    sampleConfidence = "parcial";
  } else {
    stage = "meio_expediente";
    sampleConfidence = "parcial";
  }

  return { area, isOpen: true, stage, minutesSinceOpen, minutesUntilClose, sampleConfidence };
}

export function computeSituationalContext(now: Date = new Date()): SituationalContext {
  const nowIso = saoPauloDateISO(now);
  const timeHM = saoPauloTimeHM(now);
  const weekdayIndex = weekdayFromIso(nowIso);
  const nowMinutes = toMinutes(timeHM);

  return {
    nowIso,
    timeHM,
    weekdayIndex,
    weekdayLabel: WEEKDAY_LABELS[weekdayIndex],
    areas: {
      lavacao: computeAreaStatus("lavacao", weekdayIndex, nowMinutes),
      estacionamento: computeAreaStatus("estacionamento", weekdayIndex, nowMinutes),
    },
  };
}
