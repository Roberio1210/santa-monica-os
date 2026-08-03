import { describe, expect, it } from "vitest";
import { auditDataQuality } from "@/lib/inventory/data-quality-audit";
import type { InventoryItem, StockMovement } from "@/lib/inventory/types";

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: "item-1",
    name: "Produto",
    originalName: null,
    brand: "Marca",
    category: "Outros",
    currentQuantity: 100,
    unit: "ml",
    packageCapacity: null,
    packageCount: null,
    condition: "aberto",
    minimumStock: null,
    idealStock: null,
    supplier: null,
    location: null,
    classification: null,
    canonicalItemId: null,
    consolidatedAt: null,
    notes: null,
    lastCountDate: "2026-07-10",
    unitCost: null,
    quantityStatus: "confirmed",
    ...overrides,
  };
}

function movement(overrides: Partial<StockMovement>): StockMovement {
  return {
    id: "m1",
    itemId: "item-1",
    type: "compra",
    quantity: 100,
    unit: "ml",
    date: "2026-07-10",
    notes: null,
    responsible: "Robério",
    reference: null,
    previousBalance: 0,
    newBalance: 100,
    ...overrides,
  };
}

describe("auditDataQuality", () => {
  it("nunca audita um item já consolidado (canonicalItemId preenchido)", () => {
    const result = auditDataQuality({ items: [item({ canonicalItemId: "master" })], movements: [], recipes: [], extraConsumptionItemIds: new Set() });
    expect(result.summary.totalProducts).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it("saldo negativo é crítico", () => {
    const result = auditDataQuality({ items: [item({ currentQuantity: -10 })], movements: [], recipes: [], extraConsumptionItemIds: new Set() });
    expect(result.summary.negativeBalance).toBe(1);
    expect(result.issues.find((i) => i.ruleId === "saldo_negativo")?.severity).toBe("critico");
  });

  it("item completo (todos os campos complementares preenchidos) conta como completo", () => {
    const complete = item({ supplier: "X", location: "Y", minimumStock: 10, idealStock: 50, unitCost: 1, classification: "quimico_volume" });
    const result = auditDataQuality({ items: [complete], movements: [], recipes: [], extraConsumptionItemIds: new Set() });
    expect(result.summary.completeProducts).toBe(1);
    expect(result.summary.incompleteProducts).toBe(0);
  });

  it("sem fornecedor/localização/mínimo/ideal geram issues informativos, cada um com ação recomendada", () => {
    const result = auditDataQuality({ items: [item({})], movements: [], recipes: [], extraConsumptionItemIds: new Set() });
    const ruleIds = result.issues.map((i) => i.ruleId);
    expect(ruleIds).toContain("sem_fornecedor");
    expect(ruleIds).toContain("sem_estoque_minimo");
    expect(ruleIds).toContain("sem_estoque_ideal");
    for (const issue of result.issues) {
      expect(issue.recommendedAction.length).toBeGreaterThan(0);
      expect(issue.severity).toBeTruthy();
    }
  });

  it("estoque mínimo maior que o ideal gera alerta", () => {
    const result = auditDataQuality({ items: [item({ minimumStock: 100, idealStock: 50 })], movements: [], recipes: [], extraConsumptionItemIds: new Set() });
    expect(result.issues.find((i) => i.ruleId === "minimo_maior_que_ideal")).toBeDefined();
  });

  it("nome com tamanho de embalagem gera aviso de 'embalagem no nome'", () => {
    const result = auditDataQuality({ items: [item({ name: "Izer 500ml" })], movements: [], recipes: [], extraConsumptionItemIds: new Set() });
    expect(result.issues.find((i) => i.ruleId === "embalagem_no_nome")).toBeDefined();
  });

  it("nome sugere unidade diferente da cadastrada", () => {
    const result = auditDataQuality({ items: [item({ name: "Cera 300g", unit: "ml" })], movements: [], recipes: [], extraConsumptionItemIds: new Set() });
    expect(result.summary.inconsistentUnit).toBe(1);
    expect(result.issues.find((i) => i.ruleId === "unidade_inconsistente_com_nome")).toBeDefined();
  });

  it("movimentação sem responsável gera alerta com referência da movimentação", () => {
    const result = auditDataQuality({
      items: [item({})],
      movements: [movement({ responsible: null })],
      recipes: [],
      extraConsumptionItemIds: new Set(),
    });
    const found = result.issues.find((i) => i.ruleId.startsWith("movimentacao_sem_origem"));
    expect(found?.sourceRef).toBe("m1");
  });

  it("consumido sem nenhuma entrada registrada", () => {
    const result = auditDataQuality({
      items: [item({})],
      movements: [movement({ id: "c1", type: "consumo_interno", quantity: 10 })],
      recipes: [],
      extraConsumptionItemIds: new Set(),
    });
    expect(result.summary.consumedWithoutEntry).toBe(1);
  });

  it("não aponta consumido-sem-entrada quando existe uma compra real registrada", () => {
    const result = auditDataQuality({
      items: [item({})],
      movements: [movement({ id: "e1", type: "compra" }), movement({ id: "c1", type: "consumo_interno", quantity: 10 })],
      recipes: [],
      extraConsumptionItemIds: new Set(),
    });
    expect(result.summary.consumedWithoutEntry).toBe(0);
  });

  it("custo médio muito diferente do histórico de preços pagos gera alerta", () => {
    const result = auditDataQuality({
      items: [item({ unitCost: 10 })],
      movements: [movement({ unitPricePaid: 1 })],
      recipes: [],
      extraConsumptionItemIds: new Set(),
    });
    expect(result.issues.find((i) => i.ruleId === "custo_medio_incompativel")).toBeDefined();
  });

  it("receita vinculada a produto consolidado é crítica, mesmo com item filtrado da lista 'viva'", () => {
    const master = item({ id: "master", name: "Mestre" });
    const merged = item({ id: "merged", name: "Antigo", canonicalItemId: "master" });
    const result = auditDataQuality({
      items: [master, merged],
      movements: [],
      recipes: [{ id: "r1", itemId: "merged", isActiveVersion: true }],
      extraConsumptionItemIds: new Set(),
    });
    const found = result.issues.find((i) => i.ruleId.startsWith("receita_produto_inativo"));
    expect(found?.severity).toBe("critico");
  });

  it("consumo extra sem receita vinculada aparece quando o item está no conjunto informado", () => {
    const result = auditDataQuality({ items: [item({})], movements: [], recipes: [], extraConsumptionItemIds: new Set(["item-1"]) });
    expect(result.issues.find((i) => i.ruleId === "consumo_extra_sem_receita")).toBeDefined();
  });
});
