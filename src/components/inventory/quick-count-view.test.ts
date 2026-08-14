import { describe, expect, it } from "vitest";
import { matchesFilter } from "@/components/inventory/quick-count-view";
import type { QuickCountItem } from "@/components/inventory/quick-count-view";

function item(overrides: Partial<QuickCountItem> = {}): QuickCountItem {
  return {
    id: "i1",
    name: "Produto Teste",
    brand: "Marca",
    currentQuantity: 100,
    unit: "ml",
    packageCapacity: null,
    classification: null,
    quantityStatus: "confirmed",
    category: "Lavagem",
    isPriority: false,
    countStatus: "sem_contagem",
    ...overrides,
  };
}

describe("matchesFilter — Missão de UI Operacional de Contagem V1, seção 5/24", () => {
  it("'todos' sempre inclui o item (lista produtos)", () => {
    expect(matchesFilter(item(), "todos")).toBe(true);
  });

  it("'prioritarios' só inclui itens marcados como prioritários", () => {
    expect(matchesFilter(item({ isPriority: true }), "prioritarios")).toBe(true);
    expect(matchesFilter(item({ isPriority: false }), "prioritarios")).toBe(false);
  });

  it("'sem_contagem' só inclui countStatus sem_contagem", () => {
    expect(matchesFilter(item({ countStatus: "sem_contagem" }), "sem_contagem")).toBe(true);
    expect(matchesFilter(item({ countStatus: "uma_contagem" }), "sem_contagem")).toBe(false);
  });

  it("'precisam_recontagem' só inclui countStatus uma_contagem", () => {
    expect(matchesFilter(item({ countStatus: "uma_contagem" }), "precisam_recontagem")).toBe(true);
    expect(matchesFilter(item({ countStatus: "pronto_para_analise" }), "precisam_recontagem")).toBe(false);
  });

  it("2+ posições (pronto_para_analise) não aparece em 'sem_contagem' nem 'precisam_recontagem'", () => {
    const prontoItem = item({ countStatus: "pronto_para_analise" });
    expect(matchesFilter(prontoItem, "sem_contagem")).toBe(false);
    expect(matchesFilter(prontoItem, "precisam_recontagem")).toBe(false);
  });

  it("'quimicos' inclui quimico_volume e solido_peso, exclui os demais", () => {
    expect(matchesFilter(item({ classification: "quimico_volume" }), "quimicos")).toBe(true);
    expect(matchesFilter(item({ classification: "solido_peso" }), "quimicos")).toBe(true);
    expect(matchesFilter(item({ classification: "epi" }), "quimicos")).toBe(false);
  });

  it("'polimento' usa a categoria real do item", () => {
    expect(matchesFilter(item({ category: "Polimento" }), "polimento")).toBe(true);
    expect(matchesFilter(item({ category: "Lavagem" }), "polimento")).toBe(false);
  });

  it("'outros' exclui químicos e polimento, inclui o resto", () => {
    expect(matchesFilter(item({ classification: "quimico_volume" }), "outros")).toBe(false);
    expect(matchesFilter(item({ category: "Polimento" }), "outros")).toBe(false);
    expect(matchesFilter(item({ classification: "epi", category: "EPIs" }), "outros")).toBe(true);
  });
});
