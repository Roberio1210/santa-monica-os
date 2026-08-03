import { describe, expect, it } from "vitest";
import { buildPurchaseImportPreview, computeDedupeKey } from "@/lib/inventory/purchase-import-preview";
import { parsePurchaseImportRow } from "@/lib/inventory/purchase-import-format";
import type { InventoryItem } from "@/lib/inventory/types";

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    name: "Izer Vonixx",
    originalName: null,
    brand: "Vonixx",
    category: "Vitrificação",
    currentQuantity: 1000,
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
    unitCost: 0.05,
    quantityStatus: "confirmed",
    ...overrides,
  };
}

function row(fields: Record<string, string>) {
  return parsePurchaseImportRow(0, { data: "2026-07-15", quantidade_embalagens: "1", volume_ou_peso_por_embalagem: "500", unidade_embalagem: "ml", ...fields });
}

describe("computeDedupeKey", () => {
  it("prioriza chave da NF-e quando presente", () => {
    const key = computeDedupeKey(row({ produto: "Izer", chave_nfe: "123", identificador_externo: "ext-1" }).fields);
    expect(key).toBe("nfe:123");
  });

  it("usa identificador externo quando não há chave de NF-e", () => {
    const key = computeDedupeKey(row({ produto: "Izer", identificador_externo: "ext-1" }).fields);
    expect(key).toBe("ext:ext-1");
  });

  it("usa combinação segura de campos quando não há chave nem identificador", () => {
    const key = computeDedupeKey(row({ produto: "Izer", numero_nota: "100", fornecedor: "XPTO" }).fields);
    expect(key).toContain("combo:");
  });

  it("retorna null quando não há dados suficientes para deduplicar", () => {
    const key = computeDedupeKey(row({ produto: "Izer" }).fields);
    expect(key).toBeNull();
  });
});

describe("buildPurchaseImportPreview", () => {
  it("linha inválida entra no resumo sem status de match ou conversão", () => {
    const rows = [parsePurchaseImportRow(0, {})];
    const { lines, summary } = buildPurchaseImportPreview({ rows, items: [], existingDedupeKeys: new Set() });
    expect(summary.invalidRows).toBe(1);
    expect(lines[0].matchStatus).toBeNull();
    expect(lines[0].conversion).toBeNull();
  });

  it("detecta produto encontrado por nome normalizado exatamente igual", () => {
    const rows = [row({ produto: "Izer Vonixx", marca: "Vonixx" })];
    const { lines, summary } = buildPurchaseImportPreview({ rows, items: [item()], existingDedupeKeys: new Set() });
    expect(lines[0].matchStatus).toBe("encontrado");
    expect(lines[0].matchedItemId).toBe("item-1");
    expect(summary.foundProducts).toBe(1);
  });

  it("detecta produto possível quando nomes são parecidos mas não idênticos", () => {
    const rows = [row({ produto: "Izer Kit Vonixx Premium", marca: "Vonixx" })];
    const { lines, summary } = buildPurchaseImportPreview({ rows, items: [item()], existingDedupeKeys: new Set() });
    expect(lines[0].matchStatus).toBe("possivel");
    expect(lines[0].matchCandidates.length).toBeGreaterThan(0);
    expect(summary.possibleProducts).toBe(1);
  });

  it("produto não encontrado quando não há nenhuma semelhança relevante", () => {
    const rows = [row({ produto: "Compressor de Ar Industrial" })];
    const { lines, summary } = buildPurchaseImportPreview({ rows, items: [item()], existingDedupeKeys: new Set() });
    expect(lines[0].matchStatus).toBe("nao_encontrado");
    expect(summary.notFoundProducts).toBe(1);
  });

  it("produto consolidado (canonicalItemId preenchido) nunca é candidato a match", () => {
    const rows = [row({ produto: "Izer Vonixx", marca: "Vonixx" })];
    const consolidated = item({ id: "item-old", canonicalItemId: "item-1" });
    const { lines } = buildPurchaseImportPreview({ rows, items: [consolidated], existingDedupeKeys: new Set() });
    expect(lines[0].matchedItemId).not.toBe("item-old");
  });

  it("marca como duplicada quando a chave de dedupe já existe entre as confirmadas", () => {
    const rows = [row({ produto: "Izer", identificador_externo: "ext-1" })];
    const { lines, summary } = buildPurchaseImportPreview({ rows, items: [], existingDedupeKeys: new Set(["ext:ext-1"]) });
    expect(lines[0].isDuplicate).toBe(true);
    expect(summary.duplicateRows).toBe(1);
  });

  it("marca como duplicada quando duas linhas do mesmo lote compartilham a mesma chave", () => {
    const rows = [row({ produto: "Izer", identificador_externo: "ext-1" }), row({ produto: "Izer", identificador_externo: "ext-1" })];
    const { summary } = buildPurchaseImportPreview({ rows, items: [], existingDedupeKeys: new Set() });
    expect(summary.duplicateRows).toBe(1);
  });

  it("calcula conversão de embalagem para unidade-base", () => {
    const rows = [row({ produto: "Izer", quantidade_embalagens: "2", volume_ou_peso_por_embalagem: "500", unidade_embalagem: "ml" })];
    const { lines } = buildPurchaseImportPreview({ rows, items: [], existingDedupeKeys: new Set() });
    expect(lines[0].conversion).toEqual({ baseUnit: "ml", totalQuantity: 1000 });
  });

  it("calcula impacto de custo quando o produto é encontrado e tem custo cadastrado", () => {
    const rows = [row({ produto: "Izer Vonixx", marca: "Vonixx", valor_unitario_embalagem: "50", volume_ou_peso_por_embalagem: "500" })];
    const { lines } = buildPurchaseImportPreview({ rows, items: [item({ unitCost: 0.05 })], existingDedupeKeys: new Set() });
    expect(lines[0].costImpact).toContain("acima");
  });

  it("impacto de custo é null quando o produto encontrado não tem custo cadastrado", () => {
    const rows = [row({ produto: "Izer Vonixx", marca: "Vonixx", valor_unitario_embalagem: "50" })];
    const { lines } = buildPurchaseImportPreview({ rows, items: [item({ unitCost: null })], existingDedupeKeys: new Set() });
    expect(lines[0].costImpact).toBeNull();
  });
});
