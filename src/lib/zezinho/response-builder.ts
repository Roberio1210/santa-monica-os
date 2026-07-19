import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { ComparisonMetric, ComparisonReport } from "./comparison-engine";
import type { ZezinhoAnswer, ZezinhoLink } from "./types";

/**
 * Camada D do Zézinho 2.0 — transforma um `ComparisonReport` (números já calculados por
 * services reais) em uma resposta gerencial natural. Nunca calcula nada aqui: só interpreta e
 * narra o que o motor de comparação já produziu. Puro — sem I/O, totalmente testável.
 */

function formatMetricValue(m: ComparisonMetric, value: number): string {
  return m.unit === "currency" ? formatCurrency(value) : String(value);
}

/**
 * Verbo de direção — descreve sempre a direção real do número (aumento/queda), nunca invertida
 * por sentimento. Sentimento (bom/ruim) é responsabilidade só de `metricSentiment`, separada daqui
 * de propósito: misturar as duas coisas foi a causa de um bug em que uma alta de custo (ex.:
 * saídas de caixa subindo) era narrada como "caiu".
 */
function trendVerb(trend: ComparisonMetric["comparison"]["trend"]): string {
  if (trend === "aumento") return "cresceu";
  if (trend === "queda") return "caiu";
  if (trend === "estavel") return "permaneceu estável";
  return "sem base de comparação";
}

/** Custos (ex.: saídas de caixa) invertem o sentido: aumento é ruim, queda é bom. */
const COST_METRICS = new Set(["cashSaidas"]);

type Sentiment = "positivo" | "negativo" | "neutro";

function metricSentiment(m: ComparisonMetric): Sentiment {
  if (m.comparison.trend === "estavel" || m.comparison.trend === "indisponivel") return "neutro";
  const isCost = COST_METRICS.has(m.key);
  if (isCost) return m.comparison.trend === "aumento" ? "negativo" : "positivo";
  return m.comparison.trend === "aumento" ? "positivo" : "negativo";
}

/**
 * Narra um metric no formato "Label verbo (+X%), de <valor anterior> para <valor atual>" — a
 * ordem é sempre período anterior -> período atual (bug fix: antes estava invertida, "de atual
 * para anterior"). Quando o período anterior é zero, nunca calcula percentual infinito: usa
 * "passou de" e avisa que não há base percentual comparável.
 */
export function metricSentence(m: ComparisonMetric): string {
  const previous = m.b ?? 0;
  const current = m.a;

  if (m.comparison.trend === "aumento" && m.comparison.previous === 0 && m.comparison.deltaPercent === null) {
    return `${m.label} passou de ${formatMetricValue(m, previous)} para ${formatMetricValue(m, current)} (sem base percentual comparável, o período anterior estava zerado)`;
  }

  const verb = trendVerb(m.comparison.trend);
  const pct = m.comparison.deltaPercent !== null ? ` (${m.comparison.deltaPercent > 0 ? "+" : ""}${m.comparison.deltaPercent}%)` : "";
  return `${m.label} ${verb}${pct}, de ${formatMetricValue(m, previous)} para ${formatMetricValue(m, current)}`;
}

function periodLabel(from: string, to: string, label: string): string {
  return from === to ? `${label} (${formatDateBR(from)})` : `${label} (${formatDateBR(from)} a ${formatDateBR(to)})`;
}

function basePathForFilter(filterKind: ComparisonReport["filterKind"]): string {
  if (filterKind === "lavacao") return "/lavacao";
  if (filterKind === "estacionamento") return "/estacionamento";
  return "/movimentacoes";
}

function buildLinks(report: ComparisonReport): ZezinhoLink[] {
  const base = basePathForFilter(report.filterKind);
  const links: ZezinhoLink[] = [
    { label: `Ver movimentações de ${report.periodA.label}`, href: `${base}?period=custom&from=${report.periodA.from}&to=${report.periodA.to}` },
  ];
  if (report.periodB) {
    links.push({ label: `Ver movimentações de ${report.periodB.label}`, href: `${base}?period=custom&from=${report.periodB.from}&to=${report.periodB.to}` });
  }
  links.push({ label: "Ver Fluxo de Caixa", href: "/financeiro/fluxo-de-caixa" });
  links.push({ label: "Ver DRE Gerencial", href: `/financeiro/dre?from=${report.periodA.from}&to=${report.periodA.to}` });
  return links;
}

function buildSources(report: ComparisonReport): string[] {
  const sources: string[] = [`JumpPark — ordens de ${formatDateBR(report.periodA.from)} a ${formatDateBR(report.periodA.to)}`];
  if (report.periodB) sources.push(`JumpPark — ordens de ${formatDateBR(report.periodB.from)} a ${formatDateBR(report.periodB.to)}`);
  sources.push("Neon — fluxo de caixa (entradas e saídas reais)");
  sources.push("Neon — DRE gerencial (resultado operacional, regime de competência)");
  for (const err of report.errors) sources.push(`⚠ ${err}`);
  return sources;
}

function recommendationLine(report: ComparisonReport): string {
  if (!report.periodB) return "Se quiser, posso comparar este período com o mesmo intervalo do mês anterior para ver a tendência.";
  const revenue = report.metrics.find((m) => m.key === "revenue");
  if (!revenue || revenue.comparison.trend === "indisponivel") return "Ainda não tenho uma base de comparação segura para recomendar uma ação específica.";
  if (revenue.comparison.trend === "queda") return "Vale entender o que mudou no fluxo de clientes ou na oferta de serviços neste período — posso detalhar por serviço ou por dia se quiser.";
  if (revenue.comparison.trend === "aumento") return "O resultado está positivo — vale reforçar o que funcionou bem (serviço, horário ou forma de captação) nos próximos períodos.";
  return "O resultado ficou estável neste comparativo, sem sinal de alerta.";
}

function managerialReading(report: ComparisonReport): string | null {
  if (!report.periodB) return null;
  const revenue = report.metrics.find((m) => m.key === "revenue");
  const wash = report.metrics.find((m) => m.key === "washRevenue");
  const parking = report.metrics.find((m) => m.key === "parkingRevenue");
  const ticket = report.metrics.find((m) => m.key === "avgTicket");
  if (!revenue || revenue.comparison.trend === "indisponivel") return null;

  const parts: string[] = [];
  if (wash && parking && wash.comparison.deltaPercent !== null && parking.comparison.deltaPercent !== null) {
    const driver = Math.abs(wash.comparison.deltaPercent) >= Math.abs(parking.comparison.deltaPercent) ? "a lavação" : "o estacionamento";
    parts.push(`A variação foi puxada principalmente por ${driver}.`);
  }
  if (ticket && ticket.comparison.trend !== "indisponivel" && ticket.comparison.trend !== revenue.comparison.trend) {
    parts.push(`Vale notar que o ticket médio ${ticket.comparison.trend === "aumento" ? "subiu" : ticket.comparison.trend === "queda" ? "caiu" : "ficou estável"} enquanto o faturamento seguiu direção ${revenue.comparison.trend === "aumento" ? "de alta" : "de queda"}, o que sugere ${ticket.comparison.trend === "queda" ? "mais volume com serviços de ticket mais baixo" : "menos volume compensado por serviços de ticket mais alto"}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/** Constrói a narrativa completa de uma comparação de períodos (seção 7 da sprint). */
export function buildComparisonNarrative(report: ComparisonReport, opts: { greeting?: string | null; dayMatchedNote?: string | null } = {}): ZezinhoAnswer {
  if (!report.jumpparkConfigured) {
    const prefix = opts.greeting ? `${opts.greeting}! ` : "";
    return { text: `${prefix}Não consigo analisar a operação porque o JumpPark não está configurado neste ambiente.`, links: [], sources: report.errors };
  }

  const revenue = report.metrics.find((m) => m.key === "revenue");
  const orders = report.metrics.find((m) => m.key === "orders");
  const vehicles = report.metrics.find((m) => m.key === "vehicles");
  const ticket = report.metrics.find((m) => m.key === "avgTicket");
  const hasComparison = !!report.periodB;

  const lines: string[] = [];
  if (opts.greeting) lines.push(`${opts.greeting}!`);

  // 2) Conclusão principal
  if (hasComparison && revenue) {
    const verb = trendVerb(revenue.comparison.trend);
    const pct = revenue.comparison.deltaPercent !== null ? ` (${revenue.comparison.deltaPercent > 0 ? "+" : ""}${revenue.comparison.deltaPercent}%)` : "";
    lines.push(
      `Comparando ${periodLabel(report.periodA.from, report.periodA.to, report.periodA.label)} com ${periodLabel(report.periodB!.from, report.periodB!.to, report.periodB!.label)}, o faturamento operacional ${verb}${pct}.`,
    );
  } else if (revenue) {
    lines.push(`No período de ${formatDateBR(report.periodA.from)} a ${formatDateBR(report.periodA.to)}, o faturamento operacional foi ${formatCurrency(revenue.a)}.`);
  }

  if (opts.dayMatchedNote) lines.push(opts.dayMatchedNote);

  // 3) Principais números
  const numberParts: string[] = [];
  if (orders) numberParts.push(`${orders.a} ordem(ns) finalizada(s)${hasComparison ? ` (${orders.b} no período anterior)` : ""}`);
  if (vehicles) numberParts.push(`${vehicles.a} veículo(s) atendido(s)${hasComparison ? ` (${vehicles.b} antes)` : ""}`);
  if (ticket) numberParts.push(`ticket médio de ${formatCurrency(ticket.a)}${hasComparison && ticket.b !== null ? ` (${formatCurrency(ticket.b)} antes)` : ""}`);
  if (numberParts.length > 0) lines.push(`Números principais: ${numberParts.join("; ")}.`);

  if (hasComparison) {
    const comparable = report.metrics.filter((m) => m.comparison.trend !== "indisponivel" && m.comparison.trend !== "estavel");
    const improved = comparable.filter((m) => metricSentiment(m) === "positivo").sort((a, b) => Math.abs(b.comparison.deltaPercent ?? 0) - Math.abs(a.comparison.deltaPercent ?? 0));
    const worsened = comparable.filter((m) => metricSentiment(m) === "negativo").sort((a, b) => Math.abs(b.comparison.deltaPercent ?? 0) - Math.abs(a.comparison.deltaPercent ?? 0));

    if (improved.length > 0) lines.push(`O que melhorou: ${improved.slice(0, 3).map(metricSentence).join("; ")}.`);
    if (worsened.length > 0) lines.push(`O que merece atenção: ${worsened.slice(0, 3).map(metricSentence).join("; ")}.`);

    const reading = managerialReading(report);
    if (reading) lines.push(reading);
  }

  lines.push(recommendationLine(report));

  return { text: lines.join(" "), links: buildLinks(report), sources: buildSources(report) };
}

function pctText(m: ComparisonMetric): string {
  return m.comparison.deltaPercent !== null ? `${m.comparison.deltaPercent > 0 ? "+" : ""}${m.comparison.deltaPercent}%` : "sem base comparável";
}

/**
 * Recomendações de ação, sempre fundamentadas em métricas já calculadas pelo motor de
 * comparação — nunca sugere algo sem um número real por trás. No máximo 3, ordenadas por
 * relevância (peso), para manter o foco em prioridades práticas (bug 1/3 da sprint).
 */
function buildRecommendations(report: ComparisonReport): string[] {
  if (!report.periodB) return [];
  const find = (key: string) => report.metrics.find((m) => m.key === key);
  const revenue = find("revenue");
  const ticket = find("avgTicket");
  const washCount = find("washCount");
  const washRevenue = find("washRevenue");
  const parkingRevenue = find("parkingRevenue");
  const cashResultado = find("cashResultado");
  const vehicles = find("vehicles");

  const recs: { text: string; weight: number }[] = [];

  if (ticket && ticket.comparison.trend === "queda" && ticket.b !== null) {
    recs.push({
      weight: 4,
      text: `Recuperar o ticket médio, que caiu de ${formatCurrency(ticket.b)} para ${formatCurrency(ticket.a)} (${pctText(ticket)}) — reforçar a oferta de adicionais (higienização, revitalização de faróis, vitrificação) no atendimento ajuda a elevar o valor por veículo.`,
    });
  }

  const { Bronze, Silver, Gold } = report.packageCountsA;
  const upgraded = Silver + Gold;
  if (Bronze > 0 && Bronze >= upgraded) {
    recs.push({
      weight: 3,
      text: `Trabalhar a conversão de Bronze para Silver/Gold: ${Bronze} carro(s) ficaram no Bronze contra ${upgraded} em Silver/Gold neste período — oferecer o upgrade no momento da entrada tende a elevar o ticket médio.`,
    });
  }

  if (cashResultado && revenue && cashResultado.comparison.trend === "queda" && revenue.comparison.trend !== "queda") {
    recs.push({
      weight: 3,
      text: `Melhorar o registro das entradas de caixa: o faturamento operacional não caiu, mas o resultado de caixa sim (de ${formatCurrency(cashResultado.b ?? 0)} para ${formatCurrency(cashResultado.a)}) — vale conferir se todas as entradas do período já foram lançadas.`,
    });
  }

  if (washCount && washCount.comparison.trend === "aumento" && washCount.b !== null) {
    recs.push({
      weight: 2,
      text: `Aproveitar o aumento no volume de lavações (de ${washCount.b} para ${washCount.a}, ${pctText(washCount)}) para converter clientes novos em recorrentes — vale um contato de retorno pós-serviço.`,
    });
  }

  if (parkingRevenue && washRevenue && parkingRevenue.comparison.trend === "aumento" && washRevenue.comparison.trend !== "aumento") {
    recs.push({
      weight: 2,
      text: `O estacionamento cresceu mais que a lavação neste período (${pctText(parkingRevenue)} vs. ${pctText(washRevenue)}) — vale oferecer lavação para quem já está estacionando.`,
    });
  }

  if (report.peakHourA && vehicles && vehicles.a > 0) {
    const share = report.peakHourA.count / vehicles.a;
    if (share >= 0.3) {
      recs.push({
        weight: 1,
        text: `Distribuir melhor o movimento: ${report.peakHourA.count} de ${vehicles.a} veículo(s) se concentraram no horário de ${report.peakHourA.hour} — oferecer condições especiais em horários de menor movimento ajuda a equilibrar a operação.`,
      });
    }
  }

  return recs
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((r) => r.text);
}

/**
 * Narrativa de recomendação (intenção `recommend_actions`) — bug fix: antes, uma pergunta como
 * "o que devemos fazer?" repetia a comparação de períodos inteira. Agora usa os mesmos dados já
 * calculados (contexto herdado), mas responde só com prioridades práticas, sem repetir a
 * comparação completa. Fala como gerente: direto, prático, nunca finge ter IA generativa quando
 * o modo ativo é o analítico local — as recomendações vêm de templates sobre métricas reais.
 */
export function buildRecommendationNarrative(report: ComparisonReport, opts: { greeting?: string | null } = {}): ZezinhoAnswer {
  const prefix = opts.greeting ? `${opts.greeting}! ` : "";

  if (!report.jumpparkConfigured) {
    return { text: `${prefix}Não consigo montar uma recomendação porque o JumpPark não está configurado neste ambiente.`, links: [], sources: report.errors };
  }
  if (!report.periodB) {
    return { text: `${prefix}Ainda não tenho uma comparação de períodos para basear uma recomendação.`, links: buildLinks(report), sources: buildSources(report) };
  }

  const periodText = `${periodLabel(report.periodA.from, report.periodA.to, report.periodA.label)} em relação a ${periodLabel(report.periodB.from, report.periodB.to, report.periodB.label)}`;
  const recommendations = buildRecommendations(report);

  if (recommendations.length === 0) {
    return {
      text: `${prefix}Comparando ${periodText}, não encontrei um ponto de atenção claro nos dados disponíveis para recomendar uma ação específica agora — os números seguem estáveis ou dentro do esperado.`,
      links: buildLinks(report),
      sources: buildSources(report),
    };
  }

  const lines: string[] = [`${prefix}Com base na comparação de ${periodText}, para o próximo período eu priorizaria:`];
  recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));

  const revenue = report.metrics.find((m) => m.key === "revenue");
  if (revenue && revenue.comparison.trend !== "indisponivel") {
    lines.push(
      revenue.comparison.trend === "queda"
        ? "O objetivo principal seria reverter a queda de faturamento sem perder o padrão de atendimento."
        : "O objetivo principal seria manter o volume atual, mas elevar o valor médio por atendimento.",
    );
  }

  return { text: lines.join("\n"), links: buildLinks(report), sources: buildSources(report) };
}
