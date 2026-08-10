import { describe, expect, it } from "vitest";
import { fetchComparableProductsAcrossSuppliers, fetchProductPurchaseDetail, fetchPurchasesGerencial } from "@/lib/inventory/purchasesQuery";
import { resolvePeriod } from "@/lib/utils/timezone";

describe("fetchPurchasesGerencial sem banco configurado (memória)", () => {
  it("nunca lança e retorna estrutura honesta, mesmo em modo memória", async () => {
    const period = resolvePeriod("month");
    const result = await fetchPurchasesGerencial(period);
    expect(result.storageMode).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.overview.purchaseCount).toBe(result.rows.length);
    expect(typeof result.hasAnyPurchase).toBe("boolean");
  });
});

describe("fetchProductPurchaseDetail", () => {
  it("id inexistente retorna found=false, nunca lança", async () => {
    const result = await fetchProductPurchaseDetail("00000000-0000-0000-0000-000000000000");
    expect(result.found).toBe(false);
  });
});

describe("fetchComparableProductsAcrossSuppliers", () => {
  it("nunca lança, retorna um Map (vazio quando não há dado suficiente)", async () => {
    const result = await fetchComparableProductsAcrossSuppliers();
    expect(result).toBeInstanceOf(Map);
  });
});
