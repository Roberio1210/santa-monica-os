import type { OperationalOrder } from "@/lib/integrations/jumppark/operations-summary";

/**
 * Padrão histórico (Sprint 4.0, Z2) — agregação pura sobre ordens já buscadas, nunca faz I/O.
 * Compara dias e horários EQUIVALENTES: mesmo dia da semana, e (quando um horário de corte é
 * informado) só a fração do dia até aquele horário — nunca um dia inteiro histórico contra um
 * dia em andamento, que distorceria qualquer comparação. Sempre carrega o tamanho da amostra e
 * nunca afirma tendência forte quando ela é pequena.
 */

export type SampleQuality = "insuficiente" | "razoavel" | "boa";

const MIN_WEEKS_FOR_RAZOAVEL = 4;
const MIN_WEEKS_FOR_BOA = 8;

export interface HistoricalServiceCount {
  description: string;
  averageCount: number;
}

export interface HistoricalPatternResult {
  weekdayIndex: number;
  sampleWeeks: number;
  sampleQuality: SampleQuality;
  /** `null` quando não havia nenhuma ocorrência do mesmo dia da semana na janela buscada. */
  typicalVehicles: number | null;
  typicalRevenue: number | null;
  typicalTicket: number | null;
  typicalWashCount: number | null;
  typicalParkingCount: number | null;
  /** Proporção de ordens com mais de um serviço (proxy de adicionais vendidos), 0 a 1. */
  typicalAddOnRate: number | null;
  topServices: HistoricalServiceCount[];
  /** Se um horário de corte foi aplicado, para deixar explícito que a comparação é "até este horário", não o dia inteiro. */
  cutoffTimeHM: string | null;
  limitations: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sampleQualityFor(sampleWeeks: number): SampleQuality {
  if (sampleWeeks >= MIN_WEEKS_FOR_BOA) return "boa";
  if (sampleWeeks >= MIN_WEEKS_FOR_RAZOAVEL) return "razoavel";
  return "insuficiente";
}

/**
 * `orders` deve já vir de uma janela ampla (ex.: últimas 8-12 semanas) buscada UMA vez pelo
 * chamador — esta função nunca dispara nova busca, só filtra e agrega em memória.
 * `cutoffTimeHM` (opcional) restringe a comparação a "até este horário" em cada dia histórico —
 * essencial para não comparar um dia em andamento com dias históricos inteiros.
 */
export function computeHistoricalPattern(orders: OperationalOrder[], params: { weekdayIndex: number; referenceDateIso: string; cutoffTimeHM?: string | null }): HistoricalPatternResult {
  const { weekdayIndex, referenceDateIso, cutoffTimeHM = null } = params;

  const sameWeekday = orders.filter((o) => {
    if (!o.date) return false;
    const [y, m, d] = o.date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === weekdayIndex && o.date !== referenceDateIso;
  });

  const scoped = cutoffTimeHM ? sameWeekday.filter((o) => (o.exitTime ?? "99:99") <= cutoffTimeHM) : sameWeekday;

  const sampleDates = new Set(scoped.map((o) => o.date));
  const sampleWeeks = sampleDates.size;
  const sampleQuality = sampleQualityFor(sampleWeeks);

  const limitations: string[] = [];
  if (sampleWeeks === 0) limitations.push("Nenhuma ocorrência do mesmo dia da semana encontrada na janela histórica buscada.");
  else if (sampleQuality === "insuficiente") limitations.push(`Amostra pequena: só ${sampleWeeks} ${sampleWeeks === 1 ? "ocorrência" : "ocorrências"} deste dia da semana disponível — qualquer tendência aqui é indicativa, não conclusiva.`);
  if (cutoffTimeHM) limitations.push(`Comparação restrita a "até ${cutoffTimeHM}" em cada dia histórico, para não comparar com dias inteiros.`);

  if (sampleWeeks === 0) {
    return {
      weekdayIndex,
      sampleWeeks: 0,
      sampleQuality: "insuficiente",
      typicalVehicles: null,
      typicalRevenue: null,
      typicalTicket: null,
      typicalWashCount: null,
      typicalParkingCount: null,
      typicalAddOnRate: null,
      topServices: [],
      cutoffTimeHM,
      limitations,
    };
  }

  const totalVehicles = new Set(scoped.map((o) => o.plateMasked)).size;
  const totalRevenue = scoped.reduce((sum, o) => sum + o.totalAmount, 0);
  const washOrders = scoped.filter((o) => o.kind === "lavacao");
  const parkingOrders = scoped.filter((o) => o.kind === "estacionamento");
  const multiServiceOrders = scoped.filter((o) => o.services.length > 1);

  const serviceCounts = new Map<string, number>();
  for (const o of scoped) for (const s of o.services) serviceCounts.set(s.description, (serviceCounts.get(s.description) ?? 0) + 1);
  const topServices: HistoricalServiceCount[] = Array.from(serviceCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([description, count]) => ({ description, averageCount: round2(count / sampleWeeks) }));

  return {
    weekdayIndex,
    sampleWeeks,
    sampleQuality,
    typicalVehicles: round2(totalVehicles / sampleWeeks),
    typicalRevenue: round2(totalRevenue / sampleWeeks),
    typicalTicket: scoped.length > 0 ? round2(totalRevenue / scoped.length) : null,
    typicalWashCount: round2(washOrders.length / sampleWeeks),
    typicalParkingCount: round2(parkingOrders.length / sampleWeeks),
    typicalAddOnRate: scoped.length > 0 ? round2(multiServiceOrders.length / scoped.length) : null,
    topServices,
    cutoffTimeHM,
    limitations,
  };
}
