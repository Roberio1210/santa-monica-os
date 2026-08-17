import { describe, expect, it } from "vitest";
import { orderMatchesPartnerKeywords, resolveOrderCorporateExclusionAmount, resolveOrderPartnerAmount } from "@/lib/finance/corporatePartnerRevenue";

describe("resolveOrderCorporateExclusionAmount", () => {
  it("ordem vinculada a qualquer parceiro exclui o valor líquido inteiro, independente dos itens", () => {
    const amount = resolveOrderCorporateExclusionAmount({ servicesAmount: 170, discountAmount: null, partnerId: "partner-x" }, []);
    expect(amount).toBe(170);
  });

  it("ordem vinculada abate o desconto do valor excluído", () => {
    const amount = resolveOrderCorporateExclusionAmount({ servicesAmount: 170, discountAmount: 20, partnerId: "partner-x" }, []);
    expect(amount).toBe(150);
  });

  it("ordem vinculada nunca produz exclusão negativa", () => {
    const amount = resolveOrderCorporateExclusionAmount({ servicesAmount: 30, discountAmount: 999, partnerId: "partner-x" }, []);
    expect(amount).toBe(0);
  });

  it("ordem sem vínculo cai no fallback textual legado ('iesa'), item a item", () => {
    const amount = resolveOrderCorporateExclusionAmount({ servicesAmount: 150, discountAmount: null, partnerId: null }, [
      { description: "Lavação Parceria IESA - Nissan", amount: 70 },
      { description: "Lavação Silver - SUV", amount: 80 },
    ]);
    expect(amount).toBe(70);
  });

  it("fallback legado NUNCA casa 'nissan' sozinho — só 'iesa' (nunca ampliado, preserva histórico)", () => {
    const amount = resolveOrderCorporateExclusionAmount({ servicesAmount: 100, discountAmount: null, partnerId: null }, [{ description: "Polimento Peça - Nissan", amount: 100 }]);
    expect(amount).toBe(0);
  });
});

describe("resolveOrderPartnerAmount", () => {
  it("ordem vinculada ao parceiro-alvo retorna o valor líquido inteiro", () => {
    const amount = resolveOrderPartnerAmount({ servicesAmount: 170, discountAmount: null, partnerId: "iesa" }, [], "iesa", "iesa");
    expect(amount).toBe(170);
  });

  it("ordem vinculada a OUTRO parceiro nunca soma no total deste parceiro", () => {
    const amount = resolveOrderPartnerAmount({ servicesAmount: 170, discountAmount: null, partnerId: "outro-parceiro" }, [], "iesa", "iesa");
    expect(amount).toBe(0);
  });

  it("sem vínculo, usa o fallback textual quando fornecido", () => {
    const amount = resolveOrderPartnerAmount({ servicesAmount: 150, discountAmount: null, partnerId: null }, [{ description: "Lavação Parceria IESA - Nissan", amount: 70 }], "iesa", "iesa");
    expect(amount).toBe(70);
  });

  it("sem vínculo e sem fallback (parceiro novo, sem histórico textual) nunca inventa um valor", () => {
    const amount = resolveOrderPartnerAmount({ servicesAmount: 150, discountAmount: null, partnerId: null }, [{ description: "Revisão geral", amount: 150 }], "revenda-x", null);
    expect(amount).toBe(0);
  });
});

describe("orderMatchesPartnerKeywords", () => {
  it("casa por clientName", () => {
    expect(orderMatchesPartnerKeywords({ clientName: "GRUPO IESA" }, [], ["iesa", "nissan"])).toBe(true);
  });

  it("casa por descrição de item quando clientName está ausente", () => {
    expect(orderMatchesPartnerKeywords({ clientName: null }, [{ description: "Polimento Peça - Nissan" }], ["iesa", "nissan"])).toBe(true);
  });

  it("não casa quando nenhuma keyword aparece em clientName nem em nenhum item", () => {
    expect(orderMatchesPartnerKeywords({ clientName: "Giovani" }, [{ description: "Lavação Silver - SUV" }], ["iesa", "nissan"])).toBe(false);
  });

  it("sem keywords cadastradas, nunca casa (parceiro sem vínculo automático configurado)", () => {
    expect(orderMatchesPartnerKeywords({ clientName: "GRUPO IESA" }, [], [])).toBe(false);
  });

  it("é case-insensitive e ignora espaços extras", () => {
    expect(orderMatchesPartnerKeywords({ clientName: "  Grupo Iesa  " }, [], ["IESA"])).toBe(true);
  });
});
