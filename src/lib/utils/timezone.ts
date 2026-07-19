export const SAO_PAULO_TZ = "America/Sao_Paulo";

/**
 * Data do calendário (YYYY-MM-DD) em America/Sao_Paulo, calculada no momento da chamada.
 * Nunca usar `new Date().toISOString().slice(0, 10)` para "hoje" operacional: em UTC, "hoje"
 * já virou o dia seguinte a partir das 21h em horário de Brasília (UTC-3), fazendo o dashboard
 * e as consultas ao JumpPark perderem as últimas horas do dia real.
 */
export function saoPauloDateISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SAO_PAULO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Horário HH:mm em America/Sao_Paulo. */
export function saoPauloTimeHM(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

/**
 * Soma/subtrai dias a uma data ISO (YYYY-MM-DD) tratada como calendário puro — usa meio-dia UTC
 * como âncora só para evitar problemas de borda de DST/fuso na aritmética, sem reintroduzir
 * dependência do fuso local da máquina.
 */
export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dia da semana (0=domingo..6=sábado) de uma data ISO, como calendário puro. */
function weekdayOf(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

/** Primeiro dia (segunda-feira) da semana ISO que contém `dateIso`. */
function startOfWeekIso(dateIso: string): string {
  const day = weekdayOf(dateIso);
  const offsetFromMonday = (day + 6) % 7;
  return addDaysIso(dateIso, -offsetFromMonday);
}

function startOfMonthIso(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

function endOfMonthIso(dateIso: string): string {
  const [year, month] = dateIso.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, 10);
}

function startOfPreviousMonthIso(dateIso: string): string {
  const [year, month] = dateIso.slice(0, 7).split("-").map(Number);
  const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
  return prevMonthDate.toISOString().slice(0, 10);
}

export type PeriodKey = "today" | "yesterday" | "last7days" | "week" | "month" | "previous_month" | "custom";

export const PERIOD_KEYS: PeriodKey[] = ["today", "yesterday", "last7days", "week", "month", "previous_month", "custom"];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last7days: "Últimos 7 dias",
  week: "Semana atual",
  month: "Mês atual",
  previous_month: "Mês anterior",
  custom: "Personalizado",
};

export interface PeriodRange {
  key: PeriodKey;
  from: string;
  to: string;
  label: string;
}

/**
 * Resolve um período nomeado em limites `from`/`to` (YYYY-MM-DD), sempre a partir do "hoje" real
 * em America/Sao_Paulo. `custom` exige `from`/`to` explícitos — nunca inventa um intervalo.
 */
export function resolvePeriod(key: PeriodKey, custom?: { from: string; to: string }, referenceDate: Date = new Date()): PeriodRange {
  const today = saoPauloDateISO(referenceDate);

  switch (key) {
    case "today":
      return { key, from: today, to: today, label: PERIOD_LABELS.today };
    case "yesterday": {
      const yesterday = addDaysIso(today, -1);
      return { key, from: yesterday, to: yesterday, label: PERIOD_LABELS.yesterday };
    }
    case "last7days":
      return { key, from: addDaysIso(today, -6), to: today, label: PERIOD_LABELS.last7days };
    case "week":
      return { key, from: startOfWeekIso(today), to: today, label: PERIOD_LABELS.week };
    case "month":
      return { key, from: startOfMonthIso(today), to: today, label: PERIOD_LABELS.month };
    case "previous_month": {
      const from = startOfPreviousMonthIso(today);
      return { key, from, to: endOfMonthIso(from), label: PERIOD_LABELS.previous_month };
    }
    case "custom": {
      if (!custom || !isValidIsoDate(custom.from) || !isValidIsoDate(custom.to)) {
        return { key: "today", from: today, to: today, label: PERIOD_LABELS.today };
      }
      const [from, to] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
      return { key, from, to, label: PERIOD_LABELS.custom };
    }
  }
}

export function isValidIsoDate(value: string | undefined | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Lê `period`/`from`/`to` de query params de forma segura, sempre com fallback honesto para "today". */
export function parsePeriodParams(params: { period?: string; from?: string; to?: string }): PeriodRange {
  const key = PERIOD_KEYS.includes(params.period as PeriodKey) ? (params.period as PeriodKey) : "today";
  if (key === "custom") {
    return resolvePeriod("custom", { from: params.from ?? "", to: params.to ?? "" });
  }
  return resolvePeriod(key);
}
