import { describe, expect, it } from "vitest";
import { compareFeeToContractualRate, lookupContractualFeeRatePercent, mapStoneBrandIdToFeeTableBrand } from "@/lib/integrations/stone/feeTable";

describe("mapStoneBrandIdToFeeTableBrand", () => {
  it("1 e 2 (Visa/MasterCard) mapeiam para visa_mastercard", () => {
    expect(mapStoneBrandIdToFeeTableBrand(1)).toBe("visa_mastercard");
    expect(mapStoneBrandIdToFeeTableBrand(2)).toBe("visa_mastercard");
  });

  it("171 (Elo) mapeia para elo", () => {
    expect(mapStoneBrandIdToFeeTableBrand(171)).toBe("elo");
  });

  it("3 (Amex) mapeia para amex", () => {
    expect(mapStoneBrandIdToFeeTableBrand(3)).toBe("amex");
  });

  it("bandeira fora da tabela informada (ex.: 9 Hipercard) -> null, nunca inventa", () => {
    expect(mapStoneBrandIdToFeeTableBrand(9)).toBeNull();
  });
});

describe("lookupContractualFeeRatePercent — tabela real informada pelo gestor em 14/08/2026", () => {
  it("Visa/Master débito = 1,10%", () => {
    expect(lookupContractualFeeRatePercent("visa_mastercard", "debito", 1)).toBe(1.1);
  });

  it("Visa/Master crédito 1x = 3,27%, 12x = 11,78%", () => {
    expect(lookupContractualFeeRatePercent("visa_mastercard", "credito", 1)).toBe(3.27);
    expect(lookupContractualFeeRatePercent("visa_mastercard", "credito", 12)).toBe(11.78);
  });

  it("Elo débito = 1,74%, crédito 18x = 17,50%", () => {
    expect(lookupContractualFeeRatePercent("elo", "debito", 1)).toBe(1.74);
    expect(lookupContractualFeeRatePercent("elo", "credito", 18)).toBe(17.5);
  });

  it("Amex crédito 12x = 12,85%", () => {
    expect(lookupContractualFeeRatePercent("amex", "credito", 12)).toBe(12.85);
  });

  it("Amex débito não existe na tabela -> null, nunca inventado", () => {
    expect(lookupContractualFeeRatePercent("amex", "debito", 1)).toBeNull();
  });

  it("Amex 13x+ não informado pelo gestor -> null", () => {
    expect(lookupContractualFeeRatePercent("amex", "credito", 13)).toBeNull();
  });
});

describe("compareFeeToContractualRate — taxa real SEMPRE prevalece, tabela é só conferência", () => {
  it("taxa real bate com a contratual -> sem divergência significativa", () => {
    const result = compareFeeToContractualRate({ brandId: 1, method: "credito", installments: 1, grossAmount: 1000, feeAmount: 32.7 });
    expect(result.realRatePercent).toBe(3.27);
    expect(result.contractualRatePercent).toBe(3.27);
    expect(result.hasSignificantDivergence).toBe(false);
  });

  it("taxa real diverge da contratual -> sinaliza divergência, nunca sobrescreve o valor real", () => {
    const result = compareFeeToContractualRate({ brandId: 1, method: "credito", installments: 1, grossAmount: 1000, feeAmount: 50 });
    expect(result.realRatePercent).toBe(5);
    expect(result.contractualRatePercent).toBe(3.27);
    expect(result.divergencePercentPoints).toBeCloseTo(1.73, 2);
    expect(result.hasSignificantDivergence).toBe(true);
    // a taxa REAL nunca é substituída pela contratual — o resultado sempre reporta a real calculada de feeAmount/grossAmount.
    expect(result.realRatePercent).toBe(5);
  });

  it("sem taxa contratual disponível (bandeira fora da tabela) -> divergência null, nunca 0 inventado", () => {
    const result = compareFeeToContractualRate({ brandId: 9, method: "credito", installments: 1, grossAmount: 1000, feeAmount: 40 });
    expect(result.contractualRatePercent).toBeNull();
    expect(result.divergencePercentPoints).toBeNull();
    expect(result.hasSignificantDivergence).toBe(false);
  });

  it("método 'outro' (ex.: boleto) nunca é comparado contra a tabela de cartão", () => {
    const result = compareFeeToContractualRate({ brandId: 1, method: "outro", installments: 1, grossAmount: 1000, feeAmount: 10 });
    expect(result.contractualRatePercent).toBeNull();
  });
});
