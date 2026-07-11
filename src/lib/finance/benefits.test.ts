import { describe, expect, it } from "vitest";
import { remainingBenefitUsage } from "@/lib/finance/benefits";
import type { ContractBenefit } from "@/lib/finance/types";

describe("remainingBenefitUsage — renovação mensal da Funerária (6 lavações não cumulativas)", () => {
  const funerariaBenefit: ContractBenefit = {
    id: "beneficio-funeraria-6-lavacoes",
    contractId: "contrato-funeraria",
    description: "6 lavações mensais (Lavação funerária), não cumulativas",
    quantityPerPeriod: 6,
    periodType: "mensal",
    cumulative: false,
  };

  it("início do mês: nenhuma lavação usada ainda, restam as 6", () => {
    expect(remainingBenefitUsage(funerariaBenefit, 0)).toBe(6);
  });

  it("meio do mês: 4 lavações usadas, restam 2", () => {
    expect(remainingBenefitUsage(funerariaBenefit, 4)).toBe(2);
  });

  it("limite atingido: 6 lavações usadas, resta 0 (nunca negativo)", () => {
    expect(remainingBenefitUsage(funerariaBenefit, 6)).toBe(0);
    expect(remainingBenefitUsage(funerariaBenefit, 9)).toBe(0);
  });

  it("renovação mensal: sobra do mês anterior não cumulativa — novo mês sempre reinicia com 0 usadas", () => {
    const usedInJune = 6; // esgotou o benefício em junho
    const remainingInJune = remainingBenefitUsage(funerariaBenefit, usedInJune);
    expect(remainingInJune).toBe(0);

    // Julho é um novo período: o contador de uso reinicia (não cumulativo), não soma com junho.
    const usedInJuly = 0;
    const remainingInJuly = remainingBenefitUsage(funerariaBenefit, usedInJuly);
    expect(remainingInJuly).toBe(6);
  });

  it("sem quantityPerPeriod informado, não inventa um limite (retorna null)", () => {
    const benefitSemLimite: ContractBenefit = { ...funerariaBenefit, quantityPerPeriod: null };
    expect(remainingBenefitUsage(benefitSemLimite, 3)).toBeNull();
  });
});
