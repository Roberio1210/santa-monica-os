import { describe, expect, it } from "vitest";
import { computeServiceCounts, computeRecentPurchases, computeRelevantOkItems } from "@/lib/management/dailyClosing";
import type { WashCategoryGroup } from "@/lib/integrations/jumppark/wash-grouping";
import type { InventoryItemView, StockMovement } from "@/lib/inventory/types";
import type { ServiceCatalogEntry } from "@/lib/services/catalog";

/**
 * Missão Z5 — funções puras que compõem o resumo de estoque/serviços do fechamento diário, todas
 * derivadas de dados JÁ buscados por uma única consulta real (nunca uma consulta por item/serviço).
 */

function group(label: string, count: number, amount = 0): WashCategoryGroup {
  return { label, count, amount };
}

function item(overrides: Partial<InventoryItemView> = {}): InventoryItemView {
  return {
    id: "id",
    name: "Item",
    originalName: null,
    brand: "Marca",
    category: "Outros",
    currentQuantity: 1,
    unit: "unidade",
    packageCapacity: null,
    packageCount: null,
    condition: "lacrado",
    minimumStock: null,
    idealStock: null,
    unitCost: null,
    supplier: null,
    location: null,
    classification: null,
    technicalFunction: null,
    usageType: null,
    canonicalItemId: null,
    consolidatedAt: null,
    lastCountDate: "2026-08-21",
    quantityStatus: "confirmed",
    active: true,
    notes: null,
    status: "ok",
    stockValue: null,
    fillPercent: null,
    physicalState: "peca",
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "m1",
    itemId: "id",
    type: "compra",
    quantity: 1,
    unit: "unidade",
    date: "2026-08-21",
    notes: null,
    responsible: "Robério",
    reference: null,
    supplier: null,
    unitPricePaid: null,
    previousBalance: 0,
    newBalance: 1,
    externalId: null,
    ...overrides,
  };
}

function catalogEntry(overrides: Partial<ServiceCatalogEntry> = {}): ServiceCatalogEntry {
  return {
    id: "svc",
    name: "Serviço",
    category: null,
    defaultPrice: null,
    currentPrice: null,
    priceVariants: [],
    shortDescription: null,
    detailedDescription: null,
    estimatedDurationMinutes: null,
    benefits: null,
    indications: null,
    restrictions: null,
    requiresInspection: false,
    operationalSteps: [],
    products: [],
    ...overrides,
  };
}

describe("computeServiceCounts — quantidade por serviço e adicionais (seção 1A da missão Z5)", () => {
  it("separa pacotes (Bronze/Silver/Gold) de adicionais reais", () => {
    const groups = [group("Bronze", 3), group("Silver", 2), group("Higienização Interna", 2), group("Motor", 1)];
    const { serviceCounts, additionalServicesCount } = computeServiceCounts(groups);
    expect(serviceCounts).toEqual([
      { description: "Bronze", count: 3 },
      { description: "Silver", count: 2 },
      { description: "Higienização Interna", count: 2 },
      { description: "Motor", count: 1 },
    ]);
    expect(additionalServicesCount).toBe(3); // 2 (Higienização) + 1 (Motor), nunca conta os pacotes
  });

  it("sem nenhum serviço de lavação -> contagens vazias, nunca inventadas", () => {
    expect(computeServiceCounts([])).toEqual({ serviceCounts: [], additionalServicesCount: 0 });
  });
});

describe("computeRecentPurchases — itens comprados recentemente (seção 3/8 da missão Z5)", () => {
  it("inclui compra dentro da janela de 7 dias, exclui fora da janela e exclui tipos que não são compra", () => {
    const items = new Map([["id", item({ id: "id", name: "Glaco" })]]);
    const movements = [
      movement({ itemId: "id", date: "2026-08-22" }), // dentro da janela (hoje = 2026-08-24)
      movement({ itemId: "id", date: "2026-08-01" }), // fora da janela
      movement({ itemId: "id", date: "2026-08-23", type: "consumo_interno" }), // não é compra
    ];
    const result = computeRecentPurchases(movements, items, "2026-08-24");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Glaco", date: "2026-08-22" });
  });

  it("item não encontrado no mapa -> nunca lança, nome honesto 'não identificado'", () => {
    const result = computeRecentPurchases([movement({ itemId: "desconhecido", date: "2026-08-23" })], new Map(), "2026-08-24");
    expect(result[0].name).toBe("Item não identificado");
  });

  it("sem nenhuma compra recente -> lista vazia, nunca inventada", () => {
    expect(computeRecentPurchases([], new Map(), "2026-08-24")).toEqual([]);
  });
});

describe("computeRelevantOkItems — OK relevante hoje (seção 3 da missão Z5: nunca listar dezenas de itens normais)", () => {
  it("item OK usado num serviço vendido hoje aparece com motivo 'usado_em_servico_hoje'", () => {
    const items = [item({ name: "Glaco", status: "ok" })];
    const catalog = [catalogEntry({ name: "Cristalização de Vidros", products: [{ productName: "Glaco", brand: "Soft99", role: "Proteção", isAlternative: false, variantLabel: null, durabilityLabel: null, estoque: { quantidadeAtual: 420, unidade: "ml", disponivel: true, status: "ok" } }] })];
    const result = computeRelevantOkItems(items, ["Cristalização de Vidros"], catalog, []);
    expect(result).toEqual([{ name: "Glaco", brand: "Marca", currentQuantity: 1, unit: "unidade", reason: "usado_em_servico_hoje" }]);
  });

  it("item OK comprado recentemente aparece com motivo 'comprado_recentemente'", () => {
    const items = [item({ name: "Kit Pincéis", status: "sem_minimo" })];
    const result = computeRelevantOkItems(items, [], [], [{ name: "Kit Pincéis", quantity: 1, unit: "unidade", date: "2026-08-21" }]);
    expect(result).toEqual([{ name: "Kit Pincéis", brand: "Marca", currentQuantity: 1, unit: "unidade", reason: "comprado_recentemente" }]);
  });

  it("item OK irrelevante (não usado hoje, não comprado recentemente) NUNCA aparece — nunca lista dezenas de itens normais", () => {
    const items = [item({ name: "Produto Qualquer Normal", status: "ok" })];
    const result = computeRelevantOkItems(items, ["Outro Serviço"], [], []);
    expect(result).toEqual([]);
  });

  it("item com status comprar/atencao nunca aparece aqui (já está na lista de decisão, não na de OK)", () => {
    const items = [item({ name: "Zerado", status: "comprar" }), item({ name: "Baixo", status: "atencao" })];
    const result = computeRelevantOkItems(items, [], [], [{ name: "Zerado", quantity: 1, unit: "unidade", date: "2026-08-21" }]);
    expect(result).toEqual([]);
  });
});
