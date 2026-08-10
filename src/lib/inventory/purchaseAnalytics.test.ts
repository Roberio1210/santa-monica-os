import { describe, expect, it } from "vitest";
import {
  aggregateCategoryPurchaseStats,
  aggregateProductPurchaseStats,
  detectPriceIncreaseOpportunities,
  detectPriceOpportunities,
  detectPossibleDuplicateProductNames,
  estimateNextPurchase,
  purchaseTotalValue,
  type PurchaseEvent,
} from "@/lib/inventory/purchaseAnalytics";

function event(overrides: Partial<PurchaseEvent> = {}): PurchaseEvent {
  return {
    movementId: "m1",
    itemId: "i1",
    itemName: "Shampoo Automotivo",
    category: "Lavagem",
    unit: "ml",
    orderDate: "2026-08-01",
    quantity: 5000,
    unitPricePaid: 20,
    supplierText: null,
    reference: null,
    responsible: null,
    notes: null,
    ...overrides,
  };
}

describe("purchaseTotalValue", () => {
  it("calcula quantidade x preço quando preço é conhecido", () => {
    expect(purchaseTotalValue({ quantity: 10, unitPricePaid: 5 })).toBe(50);
  });

  it("retorna null quando preço não foi informado — nunca vira 0", () => {
    expect(purchaseTotalValue({ quantity: 10, unitPricePaid: null })).toBeNull();
  });
});

describe("aggregateProductPurchaseStats", () => {
  it("agrupa por produto e soma quantidade/valor só das compras com preço conhecido", () => {
    const events = [event({ movementId: "1", quantity: 100, unitPricePaid: 10 }), event({ movementId: "2", quantity: 50, unitPricePaid: null })];
    const [stats] = aggregateProductPurchaseStats(events);
    expect(stats.purchaseCount).toBe(2);
    expect(stats.totalQuantity).toBe(150); // soma toda quantidade, com ou sem preço
    expect(stats.totalValue).toBe(1000); // só a compra com preço conhecido
    expect(stats.purchasesWithKnownValue).toBe(1);
  });

  it("min/max/average price ignoram compras sem preço", () => {
    const events = [event({ movementId: "1", orderDate: "2026-06-01", unitPricePaid: 15 }), event({ movementId: "2", orderDate: "2026-07-01", unitPricePaid: 25 }), event({ movementId: "3", orderDate: "2026-08-01", unitPricePaid: null })];
    const [stats] = aggregateProductPurchaseStats(events);
    expect(stats.minPrice).toBe(15);
    expect(stats.maxPrice).toBe(25);
    expect(stats.averagePrice).toBe(20);
    expect(stats.lastPrice).toBe(25); // última compra COM preço conhecido, não a última compra em si
  });

  it("nenhuma compra com preço -> min/max/average/lastPrice null, nunca 0", () => {
    const events = [event({ unitPricePaid: null })];
    const [stats] = aggregateProductPurchaseStats(events);
    expect(stats.minPrice).toBeNull();
    expect(stats.maxPrice).toBeNull();
    expect(stats.averagePrice).toBeNull();
    expect(stats.lastPrice).toBeNull();
    expect(stats.totalValue).toBe(0);
  });

  it("conjunto vazio -> lista vazia, nunca lança", () => {
    expect(aggregateProductPurchaseStats([])).toEqual([]);
  });
});

describe("aggregateCategoryPurchaseStats", () => {
  it("agrupa por categoria e calcula participação percentual", () => {
    const events = [event({ movementId: "1", category: "Lavagem", unitPricePaid: 300 }), event({ movementId: "2", category: "Polimento", unitPricePaid: 100, itemId: "i2" })];
    const stats = aggregateCategoryPurchaseStats(events);
    const lavagem = stats.find((s) => s.category === "Lavagem")!;
    expect(lavagem.share).toBe(75);
    expect(lavagem.distinctProducts).toBe(1);
  });
});

describe("estimateNextPurchase", () => {
  it("menos de 3 compras em datas distintas -> null (evidência insuficiente)", () => {
    expect(estimateNextPurchase(["2026-06-01", "2026-07-01"])).toBeNull();
  });

  it("3+ compras -> estima a próxima data a partir do intervalo médio real", () => {
    const result = estimateNextPurchase(["2026-06-01", "2026-07-01", "2026-08-01"]); // ~30-31 dias de intervalo
    expect(result).not.toBeNull();
    expect(result!.averageIntervalDays).toBeGreaterThan(25);
    expect(result!.basis).toContain("não é uma previsão real");
  });
});

describe("detectPriceOpportunities", () => {
  it("último preço maior que o menor histórico -> oportunidade sinalizada", () => {
    const stats = aggregateProductPurchaseStats([
      event({ movementId: "1", orderDate: "2026-06-01", unitPricePaid: 15 }),
      event({ movementId: "2", orderDate: "2026-08-01", unitPricePaid: 20 }),
    ]);
    const opps = detectPriceOpportunities(stats);
    expect(opps).toHaveLength(1);
    expect(opps[0].kind).toBe("preco_menor_no_passado");
  });

  it("preço estável ou caindo -> nenhuma oportunidade", () => {
    const stats = aggregateProductPurchaseStats([
      event({ movementId: "1", orderDate: "2026-06-01", unitPricePaid: 20 }),
      event({ movementId: "2", orderDate: "2026-08-01", unitPricePaid: 15 }),
    ]);
    expect(detectPriceOpportunities(stats)).toEqual([]);
  });

  it("só uma compra com preço conhecido -> nunca gera oportunidade (nada para comparar)", () => {
    const stats = aggregateProductPurchaseStats([event({ unitPricePaid: 20 })]);
    expect(detectPriceOpportunities(stats)).toEqual([]);
  });
});

describe("detectPriceIncreaseOpportunities", () => {
  it("aumento acima de 20% entre primeira e última compra conhecida -> sinalizado", () => {
    const events = [event({ movementId: "1", orderDate: "2026-06-01", unitPricePaid: 10 }), event({ movementId: "2", orderDate: "2026-08-01", unitPricePaid: 15 })]; // +50%
    const opps = detectPriceIncreaseOpportunities(events);
    expect(opps).toHaveLength(1);
    expect(opps[0].kind).toBe("preco_subiu");
  });

  it("aumento dentro do limiar -> não sinalizado", () => {
    const events = [event({ movementId: "1", orderDate: "2026-06-01", unitPricePaid: 10 }), event({ movementId: "2", orderDate: "2026-08-01", unitPricePaid: 11 })]; // +10%
    expect(detectPriceIncreaseOpportunities(events)).toEqual([]);
  });
});

describe("detectPossibleDuplicateProductNames", () => {
  it("reaproveita a mesma varredura léxica genérica — nomes com palavras em comum são sinalizados", () => {
    const pairs = detectPossibleDuplicateProductNames(["Shampoo Automotivo Concentrado", "Shampoo Automotivo Neutro"]);
    expect(pairs.length).toBeGreaterThan(0);
  });
});
