import { MONTH_NAMES_PT, PERIOD_LABELS, resolvePeriod, saoPauloDateISO, type PeriodKey, type PeriodRange } from "@/lib/utils/timezone";
import { formatDateBR } from "@/lib/utils/format";

/**
 * Missão Financeiro 5C — nenhuma fonte financeira (histórica ou operacional) existe antes desta
 * data em todo o sistema (ver auditoria da Missão 5A). Aplicado só aqui, nunca dentro do
 * utilitário genérico `resolvePeriod` (que outras páginas usam com `referenceDate` histórico
 * arbitrário, onde esse piso não faria sentido).
 */
export const MIN_OPERATIONAL_DATE = "2026-01-01";

/**
 * Subconjunto curado de `PeriodKey`, exatamente os presets pedidos pela Missão Financeiro 5C para
 * o filtro global da Central Financeira — nunca os 11 presets genéricos inteiros (últimos 7
 * dias/semana/90 dias não fazem parte do pedido desta missão, evita popular o seletor com opções
 * não pedidas).
 */
export const FINANCE_PERIOD_KEYS: PeriodKey[] = ["today", "yesterday", "month", "previous_month", "specific_month", "specific_year", "custom"];

export const FINANCE_PERIOD_LABELS: Record<string, string> = FINANCE_PERIOD_KEYS.reduce(
  (acc, key) => ({ ...acc, [key]: PERIOD_LABELS[key] }),
  {} as Record<string, string>,
);

export interface FinancePeriodParams {
  periodo?: string;
  inicio?: string;
  fim?: string;
  mes?: string;
  ano?: string;
}

/** `from` nunca antes do piso operacional; se isso empurrar `from` para depois de `to`, colapsa em um único dia no piso — nunca inverte o intervalo. */
function clampToOperationalMinimum(range: PeriodRange): PeriodRange {
  if (range.from >= MIN_OPERATIONAL_DATE) return range;
  const from = MIN_OPERATIONAL_DATE;
  const to = range.to < from ? from : range.to;
  return { ...range, from, to };
}

/**
 * Resolve o período global da Central Financeira a partir dos query params da URL
 * (`?periodo=...&inicio=...&fim=...&mes=...&ano=...`) — nomes próprios (não `period`/`from`/`to`
 * genéricos) para nunca colidir com os params já usados por Fluxo de Caixa/DRE/Despesas quando o
 * shell repassa o período resolvido para cada aba. Nunca inventa dado: `custom`/`specific_month`/
 * `specific_year` sem entrada válida caem no fallback padrão de `resolvePeriod` ("hoje").
 */
export function resolveFinancePeriod(params: FinancePeriodParams): PeriodRange {
  const key = FINANCE_PERIOD_KEYS.includes(params.periodo as PeriodKey) ? (params.periodo as PeriodKey) : "month";

  let raw: PeriodRange;
  if (key === "custom") {
    raw = resolvePeriod("custom", { from: params.inicio ?? "", to: params.fim ?? "" });
  } else if (key === "specific_month" || key === "specific_year") {
    const month = params.mes ? Number(params.mes) : undefined;
    const year = params.ano ? Number(params.ano) : undefined;
    raw = resolvePeriod(key, undefined, new Date(), { month, year });
  } else {
    raw = resolvePeriod(key);
  }

  return clampToOperationalMinimum(raw);
}

/** Serializa um período resolvido de volta em query params (`?periodo=...`) — usado para montar os links do seletor e para repassar o período ao trocar de aba. */
export function financePeriodToSearchParams(range: PeriodRange, extra: Record<string, string> = {}): URLSearchParams {
  const search = new URLSearchParams(extra);
  search.set("periodo", range.key);
  if (range.key === "custom") {
    search.set("inicio", range.from);
    search.set("fim", range.to);
  }
  if (range.key === "specific_month") {
    search.set("mes", range.from.slice(5, 7));
    search.set("ano", range.from.slice(0, 4));
  }
  if (range.key === "specific_year") {
    search.set("ano", range.from.slice(0, 4));
  }
  return search;
}

function lastDayOfCalendarMonth(monthIso: string): string {
  const [year, month] = monthIso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * Missão Financeiro 5C, item 6 — identificação visual do período: "Abril de 2026" quando o
 * intervalo é exatamente um mês calendário completo (ou o mês corrente até hoje), senão a data
 * inicial/final por extenso. Não decide a fonte/metodologia do cálculo (isso é só
 * `fetchFinancialPeriodOverview`) — é puramente rótulo de exibição.
 */
export function periodDisplayLabel(range: PeriodRange): string {
  const today = saoPauloDateISO();
  const competenceMonth = range.from.slice(0, 7);
  const isFirstOfMonth = range.from === `${competenceMonth}-01`;
  const isFullMonth = isFirstOfMonth && (range.to === lastDayOfCalendarMonth(competenceMonth) || (competenceMonth === today.slice(0, 7) && range.to === today));

  if (isFullMonth) {
    const monthIndex = Number(competenceMonth.slice(5, 7)) - 1;
    return `${MONTH_NAMES_PT[monthIndex]} de ${competenceMonth.slice(0, 4)}`;
  }
  if (range.from === range.to) return formatDateBR(range.from);
  return `${formatDateBR(range.from)} — ${formatDateBR(range.to)}`;
}
