import { describe, expect, it } from "vitest";
import { findDuplicateSuspects, normalizeProductName } from "@/lib/inventory/duplicate-detection";
import type { InventoryItem } from "@/lib/inventory/types";

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: "id",
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

describe("normalizeProductName", () => {
  it("remove tamanho de embalagem, acentos e pontuação", () => {
    expect(normalizeProductName("Izer 500ml")).toBe("izer");
    expect(normalizeProductName("Delet 5L")).toBe("delet");
    expect(normalizeProductName("Composto Polidor - Extra Forte!")).toBe("composto polidor extra forte");
  });

  it("nomes iguais após normalizar viram a mesma string", () => {
    expect(normalizeProductName("Limpa-Pneus Delet")).toBe(normalizeProductName("Limpa Pneus Delet"));
  });
});

describe("findDuplicateSuspects", () => {
  it("exemplo da missão: 'Delet' e 'Limpa Pneus Delet' viram suspeita por contenção", () => {
    const items = [item({ id: "a", name: "Delet", brand: "Vonixx" }), item({ id: "b", name: "Limpa Pneus Delet", brand: "Vonixx" })];
    const suspects = findDuplicateSuspects(items);
    expect(suspects).toHaveLength(1);
    expect(suspects[0].reasons.some((r) => r.includes("contido"))).toBe(true);
  });

  it("'Delet' e 'Delet 5L' viram suspeita por nome idêntico após remover o tamanho", () => {
    const items = [item({ id: "a", name: "Delet", brand: "Vonixx" }), item({ id: "b", name: "Delet 5L", brand: "Vonixx" })];
    const suspects = findDuplicateSuspects(items);
    expect(suspects[0].reasons.some((r) => r.includes("idêntico"))).toBe(true);
    expect(suspects[0].similarity).toBe(100);
  });

  it("nunca aponta suspeita só por mesma marca/categoria sem nenhuma semelhança de nome", () => {
    const items = [item({ id: "a", name: "V-Floc Shampoo", brand: "Vonixx", category: "Lavagem" }), item({ id: "b", name: "Bactran", brand: "Vonixx", category: "Lavagem" })];
    expect(findDuplicateSuspects(items)).toEqual([]);
  });

  it("nunca compara um item já consolidado (canonicalItemId preenchido)", () => {
    const items = [item({ id: "a", name: "Delet", canonicalItemId: "master-id" }), item({ id: "b", name: "Delet 5L" })];
    expect(findDuplicateSuspects(items)).toEqual([]);
  });

  it("marcas diferentes ainda geram suspeita por nome, mas com aviso explícito para revisar", () => {
    const items = [item({ id: "a", name: "Delet", brand: "Vonixx" }), item({ id: "b", name: "Delet", brand: "Outra Marca" })];
    const suspects = findDuplicateSuspects(items);
    expect(suspects[0].reasons.some((r) => r.includes("Marcas diferentes"))).toBe(true);
  });

  it("cada suspeita sempre tem pelo menos um motivo explicado", () => {
    const items = [item({ id: "a", name: "Delet", brand: "Vonixx" }), item({ id: "b", name: "Delet 5L", brand: "Vonixx" })];
    const suspects = findDuplicateSuspects(items);
    expect(suspects[0].reasons.length).toBeGreaterThan(0);
  });
});
