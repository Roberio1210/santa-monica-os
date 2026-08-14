import { describe, expect, it } from "vitest";
import { analyzeConsumptionBetweenCounts, buildManagerialAlert, getProductManagerialInventorySummary } from "@/lib/inventory/managerial-count-reconciliation";
import { registerPhysicalInventoryCount } from "@/lib/inventory/managerial-physical-count";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

describe("analyzeConsumptionBetweenCounts — Missão de Estoque Gerencial V2, seção 7/8/20 (modo memória)", () => {
  it("insuficiente com zero posições confiáveis (item nunca contado nesta sessão de teste)", async () => {
    const result = await analyzeConsumptionBetweenCounts("produto-sem-nenhuma-contagem-xyz");
    expect(result.hasTwoReliablePositions).toBe(false);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.dataQuality).toBe("INSUFFICIENT");
  });

  it("insuficiente com apenas uma posição confiável", async () => {
    await registerPhysicalInventoryCount({ itemId: "makker-vonixx", countedQuantity: 500, countedAt: "2026-08-13", source: "Teste" });
    const result = await analyzeConsumptionBetweenCounts("makker-vonixx");
    expect(result.hasTwoReliablePositions).toBe(false);
    expect(result.previousCount).toBeNull();
    expect(result.latestCount).not.toBeNull();
  });

  it("com duas posições, calcula entradas e consumo aparente corretamente a partir de movimentações reais entre as datas", async () => {
    const repo = getInventoryRepository();
    await registerPhysicalInventoryCount({ itemId: "sio2-pro-vonixx", countedQuantity: 4000, countedAt: "2026-08-01", source: "Teste" });
    await repo.recordMovement({ itemId: "sio2-pro-vonixx", type: "compra", quantity: 5000, unit: "ml", date: "2026-08-10", responsible: "Teste", reference: null, notes: null });
    await registerPhysicalInventoryCount({ itemId: "sio2-pro-vonixx", countedQuantity: 6000, countedAt: "2026-08-15", source: "Teste" });

    const result = await analyzeConsumptionBetweenCounts("sio2-pro-vonixx");
    expect(result.hasTwoReliablePositions).toBe(true);
    expect(result.previousCount?.quantity).toBe(4000);
    expect(result.latestCount?.quantity).toBe(6000);
    expect(result.entries).toBe(5000);
    // apparent = 4000 + 5000 - 6000 = 3000
    expect(result.apparentConsumption).toBe(3000);
  });

  it("sem receita gerencial declarada em Bronze/Silver/Gold, expected fica null e o motivo é explicado", async () => {
    await registerPhysicalInventoryCount({ itemId: "glaco-soft99", countedQuantity: 100, countedAt: "2026-08-01", source: "Teste" });
    await registerPhysicalInventoryCount({ itemId: "glaco-soft99", countedQuantity: 90, countedAt: "2026-08-15", source: "Teste" });
    const result = await analyzeConsumptionBetweenCounts("glaco-soft99");
    expect(result.expectedConsumption).toBeNull();
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

describe("getProductManagerialInventorySummary — Missão de Estoque Gerencial V2, seção 17", () => {
  it("retorna saldo atual, contagens e rendimento estimado mesmo sem duas posições", async () => {
    const summary = await getProductManagerialInventorySummary("blend-black-edition-vonixx");
    expect(summary.itemId).toBe("blend-black-edition-vonixx");
    expect(summary.currentQuantity).toBeGreaterThanOrEqual(0);
    expect(summary.status).toBe("INSUFFICIENT_DATA");
  });

  it("item inexistente lança erro claro", async () => {
    await expect(getProductManagerialInventorySummary("produto-inexistente-abc")).rejects.toThrow(/não encontrado/i);
  });
});

describe("buildManagerialAlert — Missão de Estoque Gerencial V2, seção 15/16", () => {
  it("NORMAL", () => {
    const alert = buildManagerialAlert({ itemName: "V-Floc", status: "NORMAL", variancePercentage: 5, periodStart: "2026-08-01", periodEnd: "2026-08-15" });
    expect(alert.severity).toBe("info");
    expect(alert.message).toContain("dentro da faixa gerencial esperada");
  });

  it("HIGH_CONSUMPTION — linguagem gerencial, nunca conclusiva", () => {
    const alert = buildManagerialAlert({ itemName: "V-Floc", status: "HIGH_CONSUMPTION", variancePercentage: 42, periodStart: "2026-08-01", periodEnd: "2026-08-15" });
    expect(alert.message).toContain("42%");
    expect(alert.message).toContain("possível consumo acima do esperado");
    expect(alert.message).not.toMatch(/desperdiçou|funcionário|serviço não foi feito/i);
  });

  it("LOW_CONSUMPTION — linguagem gerencial, nunca conclusiva", () => {
    const alert = buildManagerialAlert({ itemName: "Blend", status: "LOW_CONSUMPTION", variancePercentage: -70, periodStart: null, periodEnd: null });
    expect(alert.message).toContain("70%");
    expect(alert.message).toContain("possível consumo abaixo do esperado");
    expect(alert.message).not.toMatch(/desperdiçou|funcionário|serviço não foi feito/i);
  });

  it("ATTENTION", () => {
    const alert = buildManagerialAlert({ itemName: "3x1", status: "ATTENTION", variancePercentage: 32, periodStart: null, periodEnd: null });
    expect(alert.severity).toBe("warning");
  });

  it("INSUFFICIENT_DATA", () => {
    const alert = buildManagerialAlert({ itemName: "Atomic", status: "INSUFFICIENT_DATA", variancePercentage: null, periodStart: null, periodEnd: null });
    expect(alert.message).toContain("Não há duas posições físicas confiáveis");
  });
});
