import { addDaysIso, isValidIsoDate, resolvePeriod, saoPauloDateISO, type PeriodRange } from "@/lib/utils/timezone";

/**
 * Interpretador de datas em linguagem natural (português, America/Sao_Paulo) — Camada A do
 * Zézinho 2.0. Puro: nunca faz I/O, sempre recebe a data de referência explicitamente para ser
 * testável. Quando não reconhece nada com segurança, retorna `null` — nunca inventa um período.
 */

const MONTH_NAMES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

/** Minúsculas, sem acento — usado por todo o parser e reaproveitado pelo roteador de intenções. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Constrói o intervalo de um mês, opcionalmente limitado ao dia `throughDay`. */
function monthRange(year: number, month: number, throughDay?: number, label?: string): PeriodRange {
  const from = `${year}-${pad2(month)}-01`;
  const lastDay = daysInMonth(year, month);
  const to = `${year}-${pad2(month)}-${pad2(throughDay ? Math.min(throughDay, lastDay) : lastDay)}`;
  return { key: "custom", from, to, label: label ?? `${pad2(month)}/${year}` };
}

/** Resolve o nome de um mês para {year, month}, inferindo o ano a partir da data de referência. */
function resolveMonthName(monthName: string, referenceDate: Date): { year: number; month: number } | null {
  const key = normalize(monthName).replace(/[^a-z]/g, "");
  const month = MONTH_NAMES[key];
  if (!month) return null;

  const todayIso = saoPauloDateISO(referenceDate);
  const [refYear, refMonth] = todayIso.split("-").map(Number);
  // Se o mês citado for "futuro" dentro do ano atual, provavelmente o usuário se refere ao ano anterior.
  const year = month > refMonth ? refYear - 1 : refYear;
  return { year, month };
}

export interface DayMonthMatch {
  day: number;
  monthName: string;
  year: number;
  month: number;
}

/** Extrai todas as ocorrências de "N dias do mês de MÊS" (tolerante a "este/estes/esse/esses"). */
function extractDayMonthMatches(text: string, referenceDate: Date): DayMonthMatch[] {
  const normalized = normalize(text);
  const pattern = /(\d{1,2})\s*dias?\s*(?:do|de)?\s*mes\s*d[eo]\s*([a-z]+)/gu;
  const matches: DayMonthMatch[] = [];
  for (const m of normalized.matchAll(pattern)) {
    const day = Number(m[1]);
    const monthName = m[2];
    const resolved = resolveMonthName(monthName, referenceDate);
    if (!resolved || day < 1 || day > 31) continue;
    matches.push({ day, monthName, year: resolved.year, month: resolved.month });
  }
  return matches;
}

const MONTH_NAME_PATTERN = new RegExp(`\\b(${Object.keys(MONTH_NAMES).join("|")})\\b`, "gu");

/**
 * Extrai todas as ocorrências de nomes de mês isolados (sem "dias do mês de"), na ordem em que
 * aparecem no texto — nunca na ordem do dicionário, para não inverter "julho com junho".
 */
function extractStandaloneMonths(text: string, referenceDate: Date): { monthName: string; year: number; month: number }[] {
  const normalized = normalize(text);
  const results: { monthName: string; year: number; month: number }[] = [];
  for (const m of normalized.matchAll(MONTH_NAME_PATTERN)) {
    const resolved = resolveMonthName(m[1], referenceDate);
    if (resolved) results.push({ monthName: m[1], ...resolved });
  }
  return results;
}

const COMPARISON_TRIGGERS = [
  "compare",
  "comparando",
  "comparar",
  "em relacao",
  "em relação",
  "versus",
  " vs ",
  "vs.",
  "comparado a",
  "comparado com",
  "melhor ou pior",
  "estamos melhor",
  "estamos pior",
  "contra",
  "avalia",
  "performance",
  "o que acha",
  "o que voce acha",
];

export function hasComparisonIntent(text: string): boolean {
  const normalized = normalize(text);
  return COMPARISON_TRIGGERS.some((t) => normalized.includes(normalize(t)));
}

export interface ParsedComparison {
  periodA: PeriodRange;
  periodB: PeriodRange;
  dayMatched: boolean;
  note: string | null;
}

function formatBR(dateIso: string): string {
  const [, m, d] = dateIso.split("-");
  return `${d}/${m}`;
}

/**
 * Interpreta uma comparação de dois períodos a partir de texto livre. Tenta, em ordem:
 * 1. "N dias do mês de X em relação a N dias do mês de Y" (caso explícito da sprint);
 * 2. "hoje" + "ontem" juntos;
 * 3. dois nomes de mês citados (com correção de dias quando o mês atual está incompleto);
 * 4. "este mês" / "mês atual" vs "mês passado" (ou apenas gatilho de comparação sem outro período
 *    explícito, como "estamos melhor que no mês passado?" ou "compare este mês");
 * 5. "semana" vs "semana passada";
 * 6. "últimos 7/30 dias" vs os N dias imediatamente anteriores.
 * Retorna `null` quando não há segurança suficiente para montar os dois períodos.
 */
export function parseComparisonExpression(text: string, referenceDate: Date = new Date()): ParsedComparison | null {
  const normalized = normalize(text);
  const today = saoPauloDateISO(referenceDate);

  // 1) "N dias do mês de X em relação a N dias do mês de Y"
  const dayMonthMatches = extractDayMonthMatches(text, referenceDate);
  if (dayMonthMatches.length >= 2) {
    const [a, b] = dayMonthMatches;
    const periodA = monthRange(a.year, a.month, a.day);
    const periodB = monthRange(b.year, b.month, b.day);
    return {
      periodA,
      periodB,
      dayMatched: true,
      note: `Comparei ${formatBR(periodA.from)} a ${formatBR(periodA.to)} com ${formatBR(periodB.from)} a ${formatBR(periodB.to)} para manter o mesmo número de dias em ambos os períodos.`,
    };
  }

  // 1b) "estes/esses/primeiros N dias" sem mês explícito -> mês atual, mesmo N dias no mês anterior.
  // (Ex.: "Como você avalia estes primeiros 19 dias?")
  if (dayMonthMatches.length === 0) {
    const bareDaysMatch = normalized.match(/(?:estes?|esses?|primeiros?)\s*(\d{1,2})\s*dias?\b/);
    if (bareDaysMatch) {
      const n = Number(bareDaysMatch[1]);
      const year = Number(today.slice(0, 4));
      const month = Number(today.slice(5, 7));
      if (n > 0 && n <= 31) {
        const periodA = monthRange(year, month, n, "período atual");
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const periodB = monthRange(prevYear, prevMonth, n, "mesmo período do mês anterior");
        return {
          periodA,
          periodB,
          dayMatched: true,
          note: `Comparei ${formatBR(periodA.from)} a ${formatBR(periodA.to)} com ${formatBR(periodB.from)} a ${formatBR(periodB.to)} (mesmo número de dias).`,
        };
      }
    }
  }

  // 2) "hoje" x "ontem"
  if (normalized.includes("hoje") && normalized.includes("ontem") && hasComparisonIntent(normalized + " comparado")) {
    return { periodA: resolvePeriod("today", undefined, referenceDate), periodB: resolvePeriod("yesterday", undefined, referenceDate), dayMatched: false, note: null };
  }

  // 3) dois nomes de mês
  const months = extractStandaloneMonths(text, referenceDate);
  if (months.length >= 2) {
    const [a, b] = months;
    const isCurrentMonthA = a.year === Number(today.slice(0, 4)) && a.month === Number(today.slice(5, 7));
    const throughDayA = isCurrentMonthA ? Number(today.slice(8, 10)) : undefined;
    const periodA = monthRange(a.year, a.month, throughDayA);
    const periodB = monthRange(b.year, b.month, throughDayA);
    const dayMatched = !!throughDayA;
    return {
      periodA,
      periodB,
      dayMatched,
      note: dayMatched ? `Comparei ${formatBR(periodA.from)} a ${formatBR(periodA.to)} com ${formatBR(periodB.from)} a ${formatBR(periodB.to)} para evitar distorção, já que o mês atual ainda não terminou.` : null,
    };
  }

  // 4) "últimos N dias" vs os N dias anteriores — checar antes do fallback genérico de mês.
  const lastNDaysMatch = normalized.match(/ultimos?\s*(\d{1,3})\s*dias/);
  if (lastNDaysMatch) {
    const n = Number(lastNDaysMatch[1]);
    if (n > 0 && n <= 366) {
      const periodA: PeriodRange = { key: "custom", from: addDaysIso(today, -(n - 1)), to: today, label: `últimos ${n} dias` };
      const periodB: PeriodRange = { key: "custom", from: addDaysIso(today, -(2 * n - 1)), to: addDaysIso(today, -n), label: `${n} dias anteriores` };
      return { periodA, periodB, dayMatched: true, note: null };
    }
  }

  // 5) semana vs semana passada
  if (normalized.includes("semana")) {
    const week = resolvePeriod("week", undefined, referenceDate);
    const periodB: PeriodRange = { key: "custom", from: addDaysIso(week.from, -7), to: addDaysIso(week.to, -7), label: "semana passada" };
    return { periodA: week, periodB, dayMatched: true, note: null };
  }

  const mentionsMonthAtual = normalized.includes("este mes") || normalized.includes("mes atual") || normalized.includes("esse mes");
  const mentionsMonthPassado = normalized.includes("mes passado") || normalized.includes("mes anterior");

  // 6) "este mês" vs "mês passado" — ou apenas gatilho de comparação genérico (default seguro)
  if ((mentionsMonthAtual || hasComparisonIntent(normalized)) && (mentionsMonthPassado || !months.length)) {
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const day = Number(today.slice(8, 10));
    const periodA = monthRange(year, month, day, "mês atual");
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const periodB = monthRange(prevYear, prevMonth, day, "mês anterior");
    return {
      periodA,
      periodB,
      dayMatched: true,
      note: `Comparei ${formatBR(periodA.from)} a ${formatBR(periodA.to)} com ${formatBR(periodB.from)} a ${formatBR(periodB.to)} (mesmo número de dias) porque o mês atual ainda não terminou.`,
    };
  }

  return null;
}

/**
 * Interpreta um único período (sem comparação) a partir de texto livre — usado quando a
 * pergunta pede um recorte específico sem comparar com outro período.
 */
export function parseSinglePeriodExpression(text: string, referenceDate: Date = new Date()): PeriodRange | null {
  const normalized = normalize(text);

  const dayMonthMatches = extractDayMonthMatches(text, referenceDate);
  if (dayMonthMatches.length === 1) {
    const [a] = dayMonthMatches;
    return monthRange(a.year, a.month, a.day);
  }

  const months = extractStandaloneMonths(text, referenceDate);
  if (months.length === 1) {
    const [a] = months;
    const today = saoPauloDateISO(referenceDate);
    const isCurrentMonth = a.year === Number(today.slice(0, 4)) && a.month === Number(today.slice(5, 7));
    return monthRange(a.year, a.month, isCurrentMonth ? Number(today.slice(8, 10)) : undefined);
  }

  const bareDaysMatch = normalized.match(/(?:estes?|esses?|primeiros?)\s*(\d{1,2})\s*dias?\b/);
  if (bareDaysMatch) {
    const n = Number(bareDaysMatch[1]);
    if (n > 0 && n <= 31) {
      const today = saoPauloDateISO(referenceDate);
      return monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)), n, "período atual");
    }
  }

  if (normalized.includes("hoje")) return resolvePeriod("today", undefined, referenceDate);
  if (normalized.includes("ontem")) return resolvePeriod("yesterday", undefined, referenceDate);
  if (normalized.includes("semana passada") || normalized.includes("semana anterior")) {
    const week = resolvePeriod("week", undefined, referenceDate);
    return { key: "custom", from: addDaysIso(week.from, -7), to: addDaysIso(week.to, -7), label: "semana passada" };
  }
  if (normalized.includes("esta semana") || normalized.includes("semana atual")) return resolvePeriod("week", undefined, referenceDate);
  if (normalized.includes("mes passado") || normalized.includes("mes anterior")) return resolvePeriod("previous_month", undefined, referenceDate);
  if (normalized.includes("este mes") || normalized.includes("mes atual")) return resolvePeriod("month", undefined, referenceDate);
  if (normalized.match(/ultimos?\s*30\s*dias/)) {
    const today = saoPauloDateISO(referenceDate);
    return { key: "custom", from: addDaysIso(today, -29), to: today, label: "últimos 30 dias" };
  }
  if (normalized.match(/ultimos?\s*7\s*dias/)) return resolvePeriod("last7days", undefined, referenceDate);

  return null;
}

export interface ExplicitDateRange {
  from: string;
  to: string;
}

/** Aceita YYYY-MM-DD explícitos no texto (ex.: colado de outro sistema) — nunca inventa se ambíguo. */
export function extractExplicitIsoRange(text: string): ExplicitDateRange | null {
  const matches = text.match(/\d{4}-\d{2}-\d{2}/g);
  if (!matches || matches.length < 2) return null;
  const [from, to] = matches[0] <= matches[1] ? [matches[0], matches[1]] : [matches[1], matches[0]];
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) return null;
  return { from, to };
}
