import { addDaysIso } from "@/lib/utils/timezone";

/**
 * Filtro de período da "Gestão do Dia" — só controla a listagem de Entradas (revisão histórica);
 * os contadores/faturamento/ticket médio/tempo médio do topo da tela são sempre de hoje (ver
 * `home.ts`). Deliberadamente separado de `PeriodKey` (`lib/utils/timezone.ts`, usado por
 * Financeiro/Painel Gerencial/Zézinho) para não alterar um tipo compartilhado por módulos fora do
 * escopo desta missão.
 */
export type DayPeriodKey = "hoje" | "ontem" | "7d" | "30d" | "todos";

export const DAY_PERIOD_KEYS: DayPeriodKey[] = ["hoje", "ontem", "7d", "30d", "todos"];

export const DAY_PERIOD_LABELS: Record<DayPeriodKey, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  todos: "Todos",
};

export interface DayPeriodRange {
  key: DayPeriodKey;
  /** Sempre um intervalo fechado — "todos" usa uma data mínima real (bem anterior ao início de operação), nunca `null`, para manter o repositório com uma única forma de consulta. */
  from: string;
  to: string;
  label: string;
}

const EPOCH_FLOOR = "2000-01-01";

/** Resolve um período nomeado em limites `from`/`to` (YYYY-MM-DD), sempre a partir do "hoje" real em America/Sao_Paulo. */
export function resolveDayPeriod(key: DayPeriodKey, todayIso: string): DayPeriodRange {
  switch (key) {
    case "hoje":
      return { key, from: todayIso, to: todayIso, label: DAY_PERIOD_LABELS.hoje };
    case "ontem": {
      const yesterday = addDaysIso(todayIso, -1);
      return { key, from: yesterday, to: yesterday, label: DAY_PERIOD_LABELS.ontem };
    }
    case "7d":
      return { key, from: addDaysIso(todayIso, -6), to: todayIso, label: DAY_PERIOD_LABELS["7d"] };
    case "30d":
      return { key, from: addDaysIso(todayIso, -29), to: todayIso, label: DAY_PERIOD_LABELS["30d"] };
    case "todos":
      return { key, from: EPOCH_FLOOR, to: todayIso, label: DAY_PERIOD_LABELS.todos };
  }
}

/** Lê `period` de um query param de forma segura, sempre com fallback honesto para "hoje". */
export function parseDayPeriodParam(value: string | undefined): DayPeriodKey {
  return DAY_PERIOD_KEYS.includes(value as DayPeriodKey) ? (value as DayPeriodKey) : "hoje";
}
