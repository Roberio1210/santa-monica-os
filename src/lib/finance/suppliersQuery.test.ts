import { describe, expect, it } from "vitest";
import { fetchComparableProducts, fetchSupplierDetail, fetchSuppliersGerencial } from "@/lib/finance/suppliersQuery";
import { resolvePeriod } from "@/lib/utils/timezone";

describe("fetchSuppliersGerencial sem banco configurado (memória)", () => {
  it("nunca lança e retorna estrutura honesta, mesmo em modo memória", async () => {
    const period = resolvePeriod("month");
    const result = await fetchSuppliersGerencial(period);
    expect(result.storageMode).toBeDefined();
    expect(Array.isArray(result.suppliers)).toBe(true);
    expect(result.overview.totalSuppliers).toBe(result.suppliers.length);
  });
});

describe("fetchSupplierDetail", () => {
  it("id inexistente retorna found=false, nunca lança", async () => {
    const period = resolvePeriod("month");
    const result = await fetchSupplierDetail("00000000-0000-0000-0000-000000000000", period);
    expect(result.found).toBe(false);
  });
});

describe("fetchComparableProducts", () => {
  it("nunca lança, retorna um Map (vazio quando não há dado suficiente)", async () => {
    const result = await fetchComparableProducts();
    expect(result).toBeInstanceOf(Map);
  });
});
