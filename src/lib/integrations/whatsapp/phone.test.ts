import { describe, expect, it } from "vitest";
import { normalizeBrazilianPhoneToE164, isValidBrazilianPhone } from "@/lib/integrations/whatsapp/phone";

/**
 * Missão Z6.2 (teste obrigatório 9: "telefone brasileiro normalizado corretamente"; teste 8:
 * "telefone inválido -> não envia", provado aqui na camada pura que o bloqueia). Pura, sem banco.
 */
describe("normalizeBrazilianPhoneToE164", () => {
  it("celular com 9º dígito, com formatação humana", () => {
    expect(normalizeBrazilianPhoneToE164("(11) 99999-8888")).toBe("+5511999998888");
  });

  it("celular já em E.164 com +55", () => {
    expect(normalizeBrazilianPhoneToE164("+5511999998888")).toBe("+5511999998888");
  });

  it("celular com 55 sem o +", () => {
    expect(normalizeBrazilianPhoneToE164("5511999998888")).toBe("+5511999998888");
  });

  it("celular sem código de país, só DDD + número", () => {
    expect(normalizeBrazilianPhoneToE164("11999998888")).toBe("+5511999998888");
  });

  it("fixo (8 dígitos), sem exigir começar com 9", () => {
    expect(normalizeBrazilianPhoneToE164("1133334444")).toBe("+551133334444");
  });

  it("DDD de outra praça válido (Bahia, 71)", () => {
    expect(normalizeBrazilianPhoneToE164("71988887777")).toBe("+5571988887777");
  });

  it("celular com 9 dígitos que NÃO começa com 9 -> inválido", () => {
    expect(normalizeBrazilianPhoneToE164("11899998888")).toBeNull();
  });

  it("DDD inexistente (ex.: 00, 10, 20, 23) -> inválido", () => {
    expect(normalizeBrazilianPhoneToE164("00999998888")).toBeNull();
    expect(normalizeBrazilianPhoneToE164("10999998888")).toBeNull();
    expect(normalizeBrazilianPhoneToE164("23999998888")).toBeNull();
  });

  it("dígitos insuficientes -> inválido, nunca uma melhor tentativa", () => {
    expect(normalizeBrazilianPhoneToE164("11999")).toBeNull();
  });

  it("dígitos em excesso -> inválido", () => {
    expect(normalizeBrazilianPhoneToE164("551199999888877")).toBeNull();
  });

  it("string vazia, null, undefined -> null, nunca lança", () => {
    expect(normalizeBrazilianPhoneToE164("")).toBeNull();
    expect(normalizeBrazilianPhoneToE164(null)).toBeNull();
    expect(normalizeBrazilianPhoneToE164(undefined)).toBeNull();
  });

  it("texto sem nenhum dígito -> null", () => {
    expect(normalizeBrazilianPhoneToE164("telefone não informado")).toBeNull();
  });

  it("isValidBrazilianPhone espelha o mesmo critério", () => {
    expect(isValidBrazilianPhone("(11) 99999-8888")).toBe(true);
    expect(isValidBrazilianPhone("123")).toBe(false);
  });
});
