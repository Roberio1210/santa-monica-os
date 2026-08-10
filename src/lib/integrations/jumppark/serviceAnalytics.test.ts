import { describe, expect, it } from "vitest";
import {
  aggregateServiceStats,
  buildBasicOnlyUpsellOpportunities,
  buildCrossSellOpportunities,
  classifyServiceTrend,
  detectPossibleDuplicateCategories,
  evolutionByGranularity,
  type EnrichedServiceItem,
  type ServiceOrderItemContext,
  type ServiceStats,
} from "@/lib/integrations/jumppark/serviceAnalytics";

function item(overrides: Partial<ServiceOrderItemContext> = {}): ServiceOrderItemContext {
  return { orderId: "o1", orderDate: "2026-08-01", customerId: "c1", vehicleId: "v1", category: "Lavação Gold", amount: 100, ...overrides };
}

function enrichedItem(overrides: Partial<EnrichedServiceItem> = {}): EnrichedServiceItem {
  return { ...item(), customerName: "Cliente Teste", vehicleModel: "HB20", ...overrides };
}

describe("aggregateServiceStats", () => {
  it("agrupa por categoria e soma faturamento", () => {
    const stats = aggregateServiceStats([item({ category: "A", amount: 50 }), item({ category: "A", amount: 70 }), item({ category: "B", amount: 30 })]);
    const a = stats.find((s) => s.category === "A")!;
    expect(a.quantity).toBe(2);
    expect(a.revenue).toBe(120);
    expect(a.averageTicket).toBe(60);
  });

  it("conta clientes e veículos distintos, ignorando null", () => {
    const items = [
      item({ orderId: "1", customerId: "c1", vehicleId: "v1" }),
      item({ orderId: "2", customerId: "c1", vehicleId: "v2" }),
      item({ orderId: "3", customerId: null, vehicleId: null }),
    ];
    const [stats] = aggregateServiceStats(items);
    expect(stats.distinctCustomers).toBe(1);
    expect(stats.distinctVehicles).toBe(2);
    expect(stats.distinctOrders).toBe(3);
  });

  it("first/lastSoldDate refletem o intervalo real de datas", () => {
    const items = [item({ orderDate: "2026-07-01" }), item({ orderDate: "2026-08-15" }), item({ orderDate: "2026-06-10" })];
    const [stats] = aggregateServiceStats(items);
    expect(stats.firstSoldDate).toBe("2026-06-10");
    expect(stats.lastSoldDate).toBe("2026-08-15");
  });

  it("conjunto vazio -> lista vazia, nunca lança", () => {
    expect(aggregateServiceStats([])).toEqual([]);
  });
});

describe("classifyServiceTrend", () => {
  it("nunca vendido em nenhum dos dois períodos -> sem_venda", () => {
    expect(classifyServiceTrend(0, 0).direction).toBe("sem_venda");
  });

  it("vendido agora, nada no período anterior -> novo", () => {
    expect(classifyServiceTrend(5, 0).direction).toBe("novo");
  });

  it("crescimento acima de 20% -> crescendo", () => {
    expect(classifyServiceTrend(13, 10).direction).toBe("crescendo"); // +30%
  });

  it("queda além de 20% -> caindo", () => {
    expect(classifyServiceTrend(7, 10).direction).toBe("caindo"); // -30%
  });

  it("variação dentro de ±20% -> estável", () => {
    expect(classifyServiceTrend(11, 10).direction).toBe("estavel"); // +10%
    expect(classifyServiceTrend(9, 10).direction).toBe("estavel"); // -10%
  });

  it("exatamente no limiar (20%) ainda conta como estável (só > é crescendo)", () => {
    expect(classifyServiceTrend(12, 10).direction).toBe("estavel"); // exatamente +20%
  });
});

describe("evolutionByGranularity", () => {
  it("preenche todos os buckets informados, mesmo sem venda", () => {
    const items = [item({ orderDate: "2026-08-01", amount: 100 })];
    const points = evolutionByGranularity(items, "day", ["2026-08-01", "2026-08-02", "2026-08-03"]);
    expect(points).toEqual([
      { bucket: "2026-08-01", quantity: 1, revenue: 100 },
      { bucket: "2026-08-02", quantity: 0, revenue: 0 },
      { bucket: "2026-08-03", quantity: 0, revenue: 0 },
    ]);
  });

  it("granularidade mensal agrupa pelo mês (YYYY-MM)", () => {
    const items = [item({ orderDate: "2026-08-05" }), item({ orderDate: "2026-08-20" }), item({ orderDate: "2026-07-01" })];
    const points = evolutionByGranularity(items, "month", ["2026-07", "2026-08"]);
    expect(points.find((p) => p.bucket === "2026-08")?.quantity).toBe(2);
    expect(points.find((p) => p.bucket === "2026-07")?.quantity).toBe(1);
  });

  it("granularidade semanal agrupa por semana ISO", () => {
    // 2026-08-03 é segunda-feira, 2026-08-05 é quarta — mesma semana ISO.
    const items = [item({ orderDate: "2026-08-03" }), item({ orderDate: "2026-08-05" })];
    const points = evolutionByGranularity(items, "week", ["2026-W32"]);
    expect(points[0].quantity).toBe(2);
  });
});

describe("detectPossibleDuplicateCategories", () => {
  it("variantes de 'Serviço Martelinho N' (só o dígito muda) -> similaridade máxima", () => {
    const pairs = detectPossibleDuplicateCategories(["Serviço Martelinho 5", "Serviço Martelinho 3", "Serviço Martelinho 9"]);
    expect(pairs).toHaveLength(3); // todas as combinações par-a-par
    expect(pairs[0].similarity).toBe(100);
  });

  it("caso real: 'Revitalização dos Faróis' e 'Revitalização 1 Farol' são sinalizados", () => {
    const pairs = detectPossibleDuplicateCategories(["Revitalização dos Faróis", "Revitalização 1 Farol"]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].sharedWords).toContain("revitalizacao");
  });

  it("categorias sem nenhuma palavra em comum nunca são sinalizadas", () => {
    expect(detectPossibleDuplicateCategories(["Motor", "Película Automotiva"])).toEqual([]);
  });

  it("nunca funde nada — só retorna pares para revisão, com os nomes originais preservados", () => {
    const pairs = detectPossibleDuplicateCategories(["Glaco/Cristalização", "Cristalização da Pintura"]);
    expect(pairs[0].a).toBe("Glaco/Cristalização");
    expect(pairs[0].b).toBe("Cristalização da Pintura");
  });

  it("respeita o limite de resultados", () => {
    const categories = Array.from({ length: 10 }, (_, i) => `Martelinho ${i}`);
    expect(detectPossibleDuplicateCategories(categories, 0.3, 5)).toHaveLength(5);
  });
});

describe("buildCrossSellOpportunities", () => {
  const combinations = [{ categories: ["Higienização", "Hidratação de Couro"] as [string, string], count: 10 }];

  it("cliente com 2+ ocorrências de A e nenhuma de B vira oportunidade de cross-sell", () => {
    const items = [
      enrichedItem({ orderId: "1", customerId: "c1", category: "Higienização" }),
      enrichedItem({ orderId: "2", customerId: "c1", category: "Higienização" }),
    ];
    const opps = buildCrossSellOpportunities(items, combinations);
    expect(opps).toHaveLength(1);
    expect(opps[0]).toMatchObject({ customerId: "c1", currentService: "Higienização", suggestedService: "Hidratação de Couro" });
  });

  it("cliente que já fez os dois serviços do par nunca vira oportunidade", () => {
    const items = [
      enrichedItem({ orderId: "1", customerId: "c1", category: "Higienização" }),
      enrichedItem({ orderId: "2", customerId: "c1", category: "Higienização" }),
      enrichedItem({ orderId: "3", customerId: "c1", category: "Hidratação de Couro" }),
    ];
    expect(buildCrossSellOpportunities(items, combinations)).toEqual([]);
  });

  it("cliente com só 1 ocorrência de A (abaixo do mínimo) nunca vira oportunidade", () => {
    const items = [enrichedItem({ orderId: "1", customerId: "c1", category: "Higienização" })];
    expect(buildCrossSellOpportunities(items, combinations, { minCurrentVisits: 2 })).toEqual([]);
  });

  it("direção simétrica: forte em B e nunca fez A também gera oportunidade (sugerindo A)", () => {
    const items = [
      enrichedItem({ orderId: "1", customerId: "c1", category: "Hidratação de Couro" }),
      enrichedItem({ orderId: "2", customerId: "c1", category: "Hidratação de Couro" }),
    ];
    const opps = buildCrossSellOpportunities(items, combinations);
    expect(opps[0]).toMatchObject({ currentService: "Hidratação de Couro", suggestedService: "Higienização" });
  });

  it("nunca sugere uma combinação que não veio da lista real de combinações observadas", () => {
    const items = [
      enrichedItem({ orderId: "1", customerId: "c1", category: "Motor" }),
      enrichedItem({ orderId: "2", customerId: "c1", category: "Motor" }),
    ];
    // "Motor" não participa de nenhum par em `combinations` -> nunca deve gerar oportunidade envolvendo Motor.
    expect(buildCrossSellOpportunities(items, combinations)).toEqual([]);
  });
});

describe("buildBasicOnlyUpsellOpportunities", () => {
  const stats: ServiceStats[] = [
    { category: "Lavação Bronze", quantity: 10, revenue: 1000, distinctOrders: 10, distinctCustomers: 5, distinctVehicles: 5, averageTicket: 100, lastSoldDate: "2026-08-01", firstSoldDate: "2026-01-01" },
    { category: "Vitrificação", quantity: 2, revenue: 800, distinctOrders: 2, distinctCustomers: 2, distinctVehicles: 2, averageTicket: 400, lastSoldDate: "2026-08-01", firstSoldDate: "2026-01-01" },
  ];

  it("cliente recorrente só com serviço barato, sem nunca ter feito o de maior ticket -> oportunidade", () => {
    const items = [
      enrichedItem({ orderId: "1", customerId: "c1", category: "Lavação Bronze" }),
      enrichedItem({ orderId: "2", customerId: "c1", category: "Lavação Bronze" }),
      enrichedItem({ orderId: "3", customerId: "c1", category: "Lavação Bronze" }),
    ];
    const opps = buildBasicOnlyUpsellOpportunities(items, stats, 3);
    expect(opps).toHaveLength(1);
    expect(opps[0]).toMatchObject({ customerId: "c1", suggestedService: "Vitrificação" });
  });

  it("cliente que já contratou o serviço de maior ticket nunca vira oportunidade", () => {
    const items = [
      enrichedItem({ orderId: "1", customerId: "c1", category: "Lavação Bronze" }),
      enrichedItem({ orderId: "2", customerId: "c1", category: "Lavação Bronze" }),
      enrichedItem({ orderId: "3", customerId: "c1", category: "Vitrificação" }),
    ];
    expect(buildBasicOnlyUpsellOpportunities(items, stats, 3)).toEqual([]);
  });

  it("cliente com poucas visitas (abaixo do mínimo) nunca vira oportunidade", () => {
    const items = [enrichedItem({ orderId: "1", customerId: "c1", category: "Lavação Bronze" }), enrichedItem({ orderId: "2", customerId: "c1", category: "Lavação Bronze" })];
    expect(buildBasicOnlyUpsellOpportunities(items, stats, 3)).toEqual([]);
  });

  it("conjunto de estatísticas vazio nunca lança, retorna vazio", () => {
    expect(buildBasicOnlyUpsellOpportunities([], [], 3)).toEqual([]);
  });
});
