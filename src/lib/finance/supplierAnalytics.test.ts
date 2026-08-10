import { describe, expect, it } from "vitest";
import {
  aggregateSupplierProductPrices,
  aggregateSupplierStats,
  classifyInactivity,
  computeConcentration,
  detectPossibleDuplicateSupplierNames,
  productsWithMultipleSuppliers,
  type SupplierProductPurchase,
  type SupplierPurchaseItem,
} from "@/lib/finance/supplierAnalytics";

function purchase(overrides: Partial<SupplierPurchaseItem> = {}): SupplierPurchaseItem {
  return { supplierId: "s1", orderDate: "2026-08-01", amount: 100, description: "Compra", categoryName: "Produtos e insumos", ...overrides };
}

describe("aggregateSupplierStats", () => {
  it("agrupa por fornecedor e soma o total gasto", () => {
    const stats = aggregateSupplierStats([purchase({ supplierId: "a", amount: 50 }), purchase({ supplierId: "a", amount: 70 }), purchase({ supplierId: "b", amount: 30 })]);
    const a = stats.find((s) => s.supplierId === "a")!;
    expect(a.count).toBe(2);
    expect(a.total).toBe(120);
    expect(a.averageTicket).toBe(60);
  });

  it("first/lastDate refletem o intervalo real de datas", () => {
    const items = [purchase({ orderDate: "2026-07-01" }), purchase({ orderDate: "2026-08-15" }), purchase({ orderDate: "2026-06-10" })];
    const [stats] = aggregateSupplierStats(items);
    expect(stats.firstDate).toBe("2026-06-10");
    expect(stats.lastDate).toBe("2026-08-15");
  });

  it("conjunto vazio -> lista vazia, nunca lança", () => {
    expect(aggregateSupplierStats([])).toEqual([]);
  });
});

describe("computeConcentration", () => {
  it("calcula a participação do Top 1/3/5 sobre o total", () => {
    const result = computeConcentration([500, 300, 100, 60, 40]);
    expect(result.top1Share).toBe(50);
    expect(result.top3Share).toBe(90);
    expect(result.top5Share).toBe(100);
    expect(result.suppliersWithSpend).toBe(5);
  });

  it("menos de 5 fornecedores -> topNShare cobre só os que existem, sem quebrar", () => {
    const result = computeConcentration([100, 50]);
    expect(result.top1Share).toBe(66.67);
    expect(result.top3Share).toBe(100);
    expect(result.top5Share).toBe(100);
  });

  it("conjunto vazio -> tudo zero, nunca divide por zero", () => {
    expect(computeConcentration([])).toEqual({ top1Share: 0, top3Share: 0, top5Share: 0, suppliersWithSpend: 0 });
  });
});

describe("classifyInactivity", () => {
  it("null (nunca comprou) -> ativo por convenção — não há como classificar inatividade sem histórico", () => {
    expect(classifyInactivity(null)).toBe("ativo");
  });

  it("classifica pelos limiares fixos, sem julgamento", () => {
    expect(classifyInactivity(10)).toBe("ativo");
    expect(classifyInactivity(29)).toBe("ativo");
    expect(classifyInactivity(30)).toBe("30_dias");
    expect(classifyInactivity(59)).toBe("30_dias");
    expect(classifyInactivity(60)).toBe("60_dias");
    expect(classifyInactivity(89)).toBe("60_dias");
    expect(classifyInactivity(90)).toBe("90_dias");
    expect(classifyInactivity(200)).toBe("90_dias");
  });
});

describe("aggregateSupplierProductPrices", () => {
  function p(overrides: Partial<SupplierProductPurchase> = {}): SupplierProductPurchase {
    return { supplierId: "s1", itemId: "i1", itemName: "Shampoo Automotivo", date: "2026-08-01", quantity: 5, unitPrice: 20, ...overrides };
  }

  it("agrupa por (fornecedor, produto) e calcula min/max/média/último preço", () => {
    const purchases = [p({ date: "2026-06-01", unitPrice: 18 }), p({ date: "2026-07-01", unitPrice: 22 }), p({ date: "2026-08-01", unitPrice: 20 })];
    const [row] = aggregateSupplierProductPrices(purchases);
    expect(row.purchaseCount).toBe(3);
    expect(row.minPrice).toBe(18);
    expect(row.maxPrice).toBe(22);
    expect(row.averagePrice).toBe(20);
    expect(row.lastPrice).toBe(20); // a compra mais recente (2026-08-01)
    expect(row.lastDate).toBe("2026-08-01");
  });

  it("mesmo produto, fornecedores diferentes -> linhas separadas", () => {
    const rows = aggregateSupplierProductPrices([p({ supplierId: "a" }), p({ supplierId: "b" })]);
    expect(rows).toHaveLength(2);
  });

  it("nunca declara um fornecedor 'melhor' — só expõe os números", () => {
    const rows = aggregateSupplierProductPrices([p({ supplierId: "a", unitPrice: 15 }), p({ supplierId: "b", unitPrice: 25 })]);
    expect(rows.every((r) => !("best" in r) && !("recommended" in r))).toBe(true);
  });
});

describe("productsWithMultipleSuppliers", () => {
  it("só inclui produtos com 2+ fornecedores distintos", () => {
    const rows = aggregateSupplierProductPrices([
      { supplierId: "a", itemId: "i1", itemName: "Produto 1", date: "2026-08-01", quantity: 1, unitPrice: 10 },
      { supplierId: "b", itemId: "i1", itemName: "Produto 1", date: "2026-08-01", quantity: 1, unitPrice: 12 },
      { supplierId: "a", itemId: "i2", itemName: "Produto 2 (só fornecedor a)", date: "2026-08-01", quantity: 1, unitPrice: 5 },
    ]);
    const comparable = productsWithMultipleSuppliers(rows);
    expect(comparable.has("i1")).toBe(true);
    expect(comparable.has("i2")).toBe(false);
    expect(comparable.get("i1")).toHaveLength(2);
  });
});

describe("detectPossibleDuplicateSupplierNames", () => {
  it("reaproveita a mesma varredura léxica de Serviços — nomes parecidos são sinalizados", () => {
    const pairs = detectPossibleDuplicateSupplierNames(["Distribuidora Vonixx SC", "Vonixx Distribuidora"]);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("nomes sem nenhuma palavra em comum nunca são sinalizados", () => {
    expect(detectPossibleDuplicateSupplierNames(["Celesc", "Auto Leds"])).toEqual([]);
  });
});
