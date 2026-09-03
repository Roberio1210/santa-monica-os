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

function startOfYearIso(dateIso: string): string {
  return `${dateIso.slice(0, 4)}-01-01`;
}

/**
 * Missão 29 (sistema gerencial completo, 08/08/2026) — período nomeado adicionado ao seletor
 * global. Mantido em ordem cronológica decrescente de granularidade para a UI (`PeriodSelector`).
 *
 * Missão Financeiro 5C — `specific_month`/`specific_year` adicionados para a Central Financeira
 * (mês/ano ARBITRÁRIO, não só "este mês"/"ano corrente") — gap identificado na Missão 5A. Nenhuma
 * chave existente foi alterada; só duas novas.
 */
export type PeriodKey =
  | "today"
  | "yesterday"
  | "last7days"
  | "week"
  | "previous_week"
  | "month"
  | "previous_month"
  | "last30days"
  | "last90days"
  | "year"
  | "specific_month"
  | "specific_year"
  | "custom";

export const PERIOD_KEYS: PeriodKey[] = [
  "today",
  "yesterday",
  "last7days",
  "week",
  "previous_week",
  "month",
  "previous_month",
  "last30days",
  "last90days",
  "year",
  "specific_month",
  "specific_year",
  "custom",
];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last7days: "Últimos 7 dias",
  week: "Esta semana",
  previous_week: "Semana passada",
  month: "Este mês",
  previous_month: "Mês passado",
  last30days: "Últimos 30 dias",
  last90days: "Últimos 90 dias",
  year: "Ano",
  specific_month: "Mês específico",
  specific_year: "Ano específico",
  custom: "Personalizado",
};

export const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export interface PeriodRange {
  key: PeriodKey;
  from: string;
  to: string;
  label: string;
}

/**
 * Resolve um período nomeado em limites `from`/`to` (YYYY-MM-DD), sempre a partir do "hoje" real
 * em America/Sao_Paulo. `custom` exige `from`/`to` explícitos — nunca inventa um intervalo. Uso
 * genérico (não é exclusivo do Financeiro) — nunca aplica nenhum piso de data aqui; um chamador
 * histórico com `referenceDate` no passado precisa continuar funcionando exatamente como sempre
 * funcionou (ex.: `previous_month` a partir de janeiro/2026 devolve dezembro/2025, de propósito).
 *
 * Missão Financeiro 5C — `specific` (`month`/`year`) alimenta `specific_month`/`specific_year`:
 * mês/ano ARBITRÁRIO (não só o corrente), nunca além de hoje (nunca pede dado do futuro). O piso
 * operacional de 01/01/2026 (`MIN_OPERATIONAL_DATE`, `src/lib/finance/financePeriod.ts`) é
 * responsabilidade só da Central Financeira, aplicado por cima do resultado desta função — nunca
 * aqui, para não mudar o comportamento de todo chamador existente deste utilitário genérico.
 */
export function resolvePeriod(
  key: PeriodKey,
  custom?: { from: string; to: string },
  referenceDate: Date = new Date(),
  specific?: { month?: number; year?: number },
): PeriodRange {
  const today = saoPauloDateISO(referenceDate);
  const currentYear = Number(today.slice(0, 4));

  const raw = ((): PeriodRange => {
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
      case "previous_week": {
        const thisWeekStart = startOfWeekIso(today);
        const previousWeekEnd = addDaysIso(thisWeekStart, -1);
        const previousWeekStart = addDaysIso(previousWeekEnd, -6);
        return { key, from: previousWeekStart, to: previousWeekEnd, label: PERIOD_LABELS.previous_week };
      }
      case "month":
        return { key, from: startOfMonthIso(today), to: today, label: PERIOD_LABELS.month };
      case "previous_month": {
        const from = startOfPreviousMonthIso(today);
        return { key, from, to: endOfMonthIso(from), label: PERIOD_LABELS.previous_month };
      }
      case "last30days":
        return { key, from: addDaysIso(today, -29), to: today, label: PERIOD_LABELS.last30days };
      case "last90days":
        return { key, from: addDaysIso(today, -89), to: today, label: PERIOD_LABELS.last90days };
      case "year":
        return { key, from: startOfYearIso(today), to: today, label: PERIOD_LABELS.year };
      case "specific_month": {
        const year = specific?.year && specific.year > 0 ? specific.year : currentYear;
        const month = specific?.month && specific.month >= 1 && specific.month <= 12 ? specific.month : Number(today.slice(5, 7));
        const from = `${year}-${String(month).padStart(2, "0")}-01`;
        const naturalEnd = endOfMonthIso(from);
        const to = naturalEnd > today ? today : naturalEnd; // nunca pede dado do futuro, mesmo dentro do mês corrente
        return { key, from, to: to < from ? from : to, label: `${MONTH_NAMES_PT[month - 1]}/${year}` };
      }
      case "specific_year": {
        const year = specific?.year && specific.year > 0 ? specific.year : currentYear;
        const to = year === currentYear ? today : `${year}-12-31`;
        return { key, from: `${year}-01-01`, to, label: String(year) };
      }
      case "custom": {
        if (!custom || !isValidIsoDate(custom.from) || !isValidIsoDate(custom.to)) {
          return { key: "today", from: today, to: today, label: PERIOD_LABELS.today };
        }
        const [from, to] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
        return { key, from, to, label: PERIOD_LABELS.custom };
      }
    }
  })();

  return raw;
}

export function isValidIsoDate(value: string | undefined | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Missão 29 — período imediatamente anterior, com a MESMA duração em dias do período informado
 * (ex.: "últimos 30 dias" → os 30 dias anteriores a esses; período personalizado de 5 dias → os 5
 * dias anteriores). Base de toda comparação "vs período anterior" pedida na missão — já existia
 * uma cópia privada equivalente em `painel-gerencial/service.ts`; centralizada aqui para reuso em
 * qualquer módulo (Despesas, Compras, Clientes, Veículos, Serviços, Estoque).
 */
export function previousPeriodOf(period: { from: string; to: string }): { from: string; to: string } {
  const lengthDays = Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000) + 1;
  const previousTo = addDaysIso(period.from, -1);
  const previousFrom = addDaysIso(previousTo, -(lengthDays - 1));
  return { from: previousFrom, to: previousTo };
}

export interface PeriodComparison {
  current: number;
  previous: number;
  /** current - previous. Positivo = cresceu. */
  delta: number;
  /** (delta / previous) * 100. Null quando previous = 0 (percentual não é definido — nunca exibir "∞" ou "0%" nesse caso). */
  percent: number | null;
}

/** Compara um valor do período atual com o mesmo indicador no período anterior — nunca inventa percentual quando a base é zero. */
export function comparePeriodValues(current: number, previous: number): PeriodComparison {
  const delta = current - previous;
  const percent = previous !== 0 ? (delta / previous) * 100 : null;
  return { current, previous, delta, percent };
}

/** Lê `period`/`from`/`to` de query params de forma segura, sempre com fallback honesto para "today". */
export function parsePeriodParams(params: { period?: string; from?: string; to?: string; month?: string; year?: string }): PeriodRange {
  const key = PERIOD_KEYS.includes(params.period as PeriodKey) ? (params.period as PeriodKey) : "today";
  if (key === "custom") {
    return resolvePeriod("custom", { from: params.from ?? "", to: params.to ?? "" });
  }
  if (key === "specific_month" || key === "specific_year") {
    const month = params.month ? Number(params.month) : undefined;
    const year = params.year ? Number(params.year) : undefined;
    return resolvePeriod(key, undefined, new Date(), { month, year });
  }
  return resolvePeriod(key);
}
