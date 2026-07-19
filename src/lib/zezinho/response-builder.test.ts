import { describe, expect, it } from "vitest";
import { buildComparisonNarrative, buildRecommendationNarrative, metricSentence } from "@/lib/zezinho/response-builder";
import type { ComparisonMetric, ComparisonReport } from "@/lib/zezinho/comparison-engine";
import { comparePeriods } from "@/lib/integrations/jumppark/operations-summary";
import { formatCurrency } from "@/lib/utils/format";

function metric(key: string, label: string, unit: "currency" | "count", a: number, b: number | null): ComparisonMetric {
  return { key, label, unit, a, b, comparison: comparePeriods(a, b), source: "JumpPark" };
}

function baseReport(overrides: Partial<ComparisonReport> = {}): ComparisonReport {
  return {
    periodA: { key: "custom", from: "2026-07-01", to: "2026-07-19", label: "julho" },
    periodB: { key: "custom", from: "2026-06-01", to: "2026-06-19", label: "junho" },
    filterKind: null,
    jumpparkConfigured: true,
    metrics: [
      metric("revenue", "Faturamento operacional", "currency", 12000, 10000),
      metric("orders", "Ordens finalizadas", "count", 120, 100),
      metric("vehicles", "Veículos atendidos", "count", 110, 95),
      metric("avgTicket", "Ticket médio", "currency", 100, 100),
      metric("washRevenue", "Faturamento de lavação", "currency", 9000, 7000),
      metric("parkingRevenue", "Faturamento de estacionamento", "currency", 3000, 3000),
      metric("cashSaidas", "Saídas de caixa", "currency", 4000, 3000),
    ],
    packageCountsA: { Bronze: 20, Silver: 30, Gold: 10 },
    packageCountsB: { Bronze: 25, Silver: 20, Gold: 8 },
    topServicesA: [],
    topServicesB: [],
    peakHourA: { hour: "10h", count: 12 },
    peakHourB: { hour: "11h", count: 10 },
    errors: [],
    ...overrides,
  };
}

describe("buildComparisonNarrative", () => {
  it("descreve aumento de faturamento com números reais, nunca inventados", () => {
    const answer = buildComparisonNarrative(baseReport(), { greeting: "Bom dia, Robério" });
    expect(answer.text).toContain("Bom dia, Robério!");
    expect(answer.text).toContain("cresceu");
    expect(answer.text).toContain("20%"); // (12000-10000)/10000 = 20%
    expect(answer.text).toContain("R$");
  });

  it("inclui 'o que melhorou' e 'o que merece atenção' separadamente", () => {
    const answer = buildComparisonNarrative(baseReport());
    expect(answer.text).toMatch(/O que melhorou:/);
    expect(answer.text).toMatch(/O que merece atenção:/);
    // cashSaidas subiu (aumento) -> é um custo, então deve aparecer como "merece atenção", não "melhorou".
    const attentionIndex = answer.text.indexOf("O que merece atenção:");
    const attentionSection = answer.text.slice(attentionIndex);
    expect(attentionSection).toContain("Saídas de caixa");
  });

  it("nunca inventa percentual quando não há período anterior", () => {
    const report = baseReport({
      periodB: null,
      metrics: [metric("revenue", "Faturamento operacional", "currency", 5000, null)],
    });
    const answer = buildComparisonNarrative(report);
    expect(answer.text).not.toContain("%");
    expect(answer.text).toContain(formatCurrency(5000));
  });

  it("honesto quando JumpPark não está configurado — nunca inventa números", () => {
    const report = baseReport({ jumpparkConfigured: false, metrics: [], errors: ["JumpPark não configurado neste ambiente."] });
    const answer = buildComparisonNarrative(report, { greeting: "Bom dia" });
    expect(answer.text).toContain("não está configurado");
    expect(answer.links).toEqual([]);
  });

  it("inclui a nota de correspondência de dias quando fornecida", () => {
    const answer = buildComparisonNarrative(baseReport(), { dayMatchedNote: "Comparei 01/07 a 19/07 com 01/06 a 19/06." });
    expect(answer.text).toContain("Comparei 01/07 a 19/07 com 01/06 a 19/06.");
  });

  it("gera links para os dois períodos e para Fluxo de Caixa/DRE", () => {
    const answer = buildComparisonNarrative(baseReport());
    const labels = answer.links.map((l) => l.label);
    expect(labels).toContain("Ver movimentações de julho");
    expect(labels).toContain("Ver movimentações de junho");
    expect(labels.some((l) => l.includes("Fluxo de Caixa"))).toBe(true);
    expect(labels.some((l) => l.includes("DRE"))).toBe(true);
  });

  it("usa a base /lavacao quando o filtro é lavação", () => {
    const answer = buildComparisonNarrative(baseReport({ filterKind: "lavacao" }));
    expect(answer.links[0].href).toContain("/lavacao?period=custom");
  });

  it("registra as fontes usadas para a seção 'Dados utilizados'", () => {
    const answer = buildComparisonNarrative(baseReport());
    expect(answer.sources).toBeDefined();
    expect(answer.sources!.some((s) => s.includes("JumpPark"))).toBe(true);
    expect(answer.sources!.some((s) => s.toLowerCase().includes("fluxo de caixa"))).toBe(true);
  });

  it("propaga erros de fontes parciais na seção de fontes, sem derrubar a resposta", () => {
    const report = baseReport({ errors: ["Não foi possível consultar o resultado gerencial (DRE) do período anterior."] });
    const answer = buildComparisonNarrative(report);
    expect(answer.text.length).toBeGreaterThan(0);
    expect(answer.sources!.some((s) => s.includes("⚠"))).toBe(true);
  });
});

describe("metricSentence — direção previousValue -> currentValue (bug fix)", () => {
  it("'cresceu ... de previousValue para currentValue' quando o valor subiu", () => {
    const m = metric("washCount", "Lavações", "count", 41, 22); // a=41 (atual), b=22 (anterior)
    const sentence = metricSentence(m);
    expect(sentence).toContain("cresceu");
    expect(sentence).toContain("de 22 para 41");
    expect(sentence).not.toContain("de 41 para 22");
  });

  it("'caiu ... de previousValue para currentValue' quando o valor desceu", () => {
    const m = metric("cashEntradas", "Entradas de caixa", "currency", 0, 901); // a=0 (atual), b=901 (anterior)
    const sentence = metricSentence(m);
    expect(sentence).toContain("caiu");
    expect(sentence).toContain(`de ${formatCurrency(901)} para ${formatCurrency(0)}`);
  });

  it("não gera percentual infinito quando o período anterior é zero — usa 'passou de'", () => {
    const m = metric("revenue", "Faturamento", "currency", 500, 0); // a=500 (atual), b=0 (anterior)
    const sentence = metricSentence(m);
    expect(sentence).not.toMatch(/infinity/i);
    expect(sentence).not.toContain("%");
    expect(sentence).toContain("passou de");
    expect(sentence).toContain(`de ${formatCurrency(0)} para ${formatCurrency(500)}`);
    expect(sentence.toLowerCase()).toContain("sem base percentual");
  });

  it("indica estabilidade quando o valor não mudou", () => {
    const m = metric("orders", "Ordens", "count", 30, 30);
    expect(metricSentence(m)).toContain("permaneceu estável");
  });
});

describe("buildRecommendationNarrative — bug fix: recomendação conversacional, não repete a comparação", () => {
  it("gera recomendações fundamentadas nos dados (ticket médio em queda) sem repetir a narrativa de comparação", () => {
    const report = baseReport({
      metrics: [
        metric("revenue", "Faturamento operacional", "currency", 12000, 10000),
        metric("avgTicket", "Ticket médio", "currency", 90, 110),
        metric("washCount", "Lavações", "count", 130, 100),
      ],
      packageCountsA: { Bronze: 40, Silver: 10, Gold: 5 },
    });
    const answer = buildRecommendationNarrative(report, { greeting: "Bom dia, Robério" });
    expect(answer.text).toContain("Bom dia, Robério!");
    expect(answer.text).toMatch(/priorizaria/i);
    expect(answer.text).toContain(formatCurrency(90));
    expect(answer.text).toContain(formatCurrency(110));
    // Não repete o formato da narrativa de comparação completa (seção "Números principais").
    expect(answer.text).not.toContain("Números principais:");
  });

  it("prioriza no máximo 3 recomendações", () => {
    const report = baseReport({
      metrics: [
        metric("revenue", "Faturamento operacional", "currency", 12000, 10000),
        metric("avgTicket", "Ticket médio", "currency", 90, 110),
        metric("washCount", "Lavações", "count", 130, 100),
        metric("parkingRevenue", "Faturamento de estacionamento", "currency", 4000, 2000),
        metric("washRevenue", "Faturamento de lavação", "currency", 8000, 7800),
        metric("cashResultado", "Resultado de caixa", "currency", 1000, 3000),
      ],
      packageCountsA: { Bronze: 40, Silver: 10, Gold: 5 },
      peakHourA: { hour: "10h", count: 40 },
    });
    const answer = buildRecommendationNarrative(report);
    const numbered = answer.text.match(/^\d+\./gm) ?? [];
    expect(numbered.length).toBeLessThanOrEqual(3);
  });

  it("honesto quando não há comparação anterior — nunca inventa recomendação", () => {
    const report = baseReport({ periodB: null, metrics: [metric("revenue", "Faturamento", "currency", 5000, null)] });
    const answer = buildRecommendationNarrative(report);
    expect(answer.text).toMatch(/não tenho uma comparação/i);
  });

  it("honesto quando o JumpPark não está configurado", () => {
    const report = baseReport({ jumpparkConfigured: false, metrics: [], errors: ["JumpPark não configurado neste ambiente."] });
    const answer = buildRecommendationNarrative(report, { greeting: "Bom dia" });
    expect(answer.text).toContain("não está configurado");
  });
});
