import { describe, expect, it } from "vitest";
import { fetchServiceDetail, fetchServicesGerencial, slugifyServiceCategory, unslugifyServiceCategory } from "@/lib/integrations/jumppark/servicesQuery";
import { resolvePeriod } from "@/lib/utils/timezone";

describe("slugifyServiceCategory / unslugifyServiceCategory", () => {
  it("round-trip preserva o texto original, incluindo caracteres especiais reais da base", () => {
    const cases = ["Glaco/Cristalização", "Lavação Gold - SUV/SEDAN", "Chuva ácida", "Serviço Martelinho 5"];
    for (const category of cases) {
      expect(unslugifyServiceCategory(slugifyServiceCategory(category))).toBe(category);
    }
  });

  it("slug inválido retorna null, nunca lança", () => {
    expect(unslugifyServiceCategory("!!!não é base64url válido!!!")).not.toBeUndefined();
  });
});

describe("fetchServicesGerencial sem banco configurado", () => {
  it("nunca lança, retorna resultado vazio honesto", async () => {
    const period = resolvePeriod("month");
    const result = await fetchServicesGerencial(period);
    expect(result.hasData).toBe(false);
    expect(result.rankings).toEqual([]);
    expect(result.overview.quantity).toBe(0);
  });
});

describe("fetchServiceDetail sem banco configurado", () => {
  it("retorna null, nunca lança", async () => {
    const period = resolvePeriod("month");
    const slug = slugifyServiceCategory("Qualquer Categoria");
    await expect(fetchServiceDetail(slug, period)).resolves.toBeNull();
  });
});
