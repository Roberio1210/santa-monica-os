import { describe, expect, it } from "vitest";
import { buildCustomerSearchTerms } from "@/lib/integrations/jumppark/customerSearch";

describe("buildCustomerSearchTerms — Missão CRM V2 Fase 1, seção 6/7/8/35", () => {
  it("nome simples só ativa o termo bruto para ILIKE", () => {
    const terms = buildCustomerSearchTerms("José");
    expect(terms.raw).toBe("José");
  });

  it("telefone completo extrai dígitos suficientes", () => {
    const terms = buildCustomerSearchTerms("(48) 99999-1234");
    expect(terms.phoneDigits).toBe("48999991234");
  });

  it("telefone parcial (>=3 dígitos) ainda é aceito para busca", () => {
    const terms = buildCustomerSearchTerms("91234");
    expect(terms.phoneDigits).toBe("91234");
  });

  it("fragmento numérico curto demais (<3 dígitos) não vira busca de telefone — evita matching absurdo", () => {
    const terms = buildCustomerSearchTerms("12");
    expect(terms.phoneDigits).toBeNull();
  });

  it("placa completa é normalizada (maiúscula, sem espaço/hífen)", () => {
    const terms = buildCustomerSearchTerms("abc-1d23");
    expect(terms.platePattern).toBe("ABC1D23");
  });

  it("placa parcial (>=2 caracteres) ainda é aceita", () => {
    const terms = buildCustomerSearchTerms("1D23");
    expect(terms.platePattern).toBe("1D23");
  });

  it("fragmento de 1 caractere não vira busca de placa — evita matching absurdo", () => {
    const terms = buildCustomerSearchTerms("A");
    expect(terms.platePattern).toBeNull();
  });

  it("string vazia não ativa nenhum termo estruturado", () => {
    const terms = buildCustomerSearchTerms("   ");
    expect(terms.raw).toBe("");
    expect(terms.phoneDigits).toBeNull();
    expect(terms.platePattern).toBeNull();
  });

  it("Missão CRM V2 Final, cenário 32 — busca por modelo ('Tucson') usa o termo bruto, comparado via ILIKE contra vehicles.model em buildCustomerSearchCondition (customersQuery.ts)", () => {
    const terms = buildCustomerSearchTerms("Tucson");
    expect(terms.raw).toBe("Tucson");
    expect(terms.phoneDigits).toBeNull();
    // Sem letra+dígito misturados, a comparação de placa (EXISTS ... like '%TUCSON%') nunca bate
    // numa placa real — inofensivo, mas o termo em si fica ativo por não termos exigido o padrão
    // letra+dígito aqui (mesma simplicidade de design documentada em customerSearch.ts).
    expect(terms.platePattern).toBe("TUCSON");
  });
});
