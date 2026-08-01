import { describe, expect, it } from "vitest";
import { classifyServiceCategory } from "@/lib/domain/operational/category";

describe("classifyServiceCategory — Sprint 10", () => {
  it("ordem sem serviço agregado (estacionamento puro) é sempre Estacionamento", () => {
    expect(classifyServiceCategory([])).toBe("Estacionamento");
  });

  it("classifica Martelinho mesmo combinado com outro texto — categoria mais específica vence", () => {
    expect(classifyServiceCategory(["Martelinho - Porta dianteira"])).toBe("Martelinho");
    expect(classifyServiceCategory(["Lavação + Martelinho"])).toBe("Martelinho");
  });

  it("classifica PPF", () => {
    expect(classifyServiceCategory(["Aplicação de PPF - capô"])).toBe("PPF");
  });

  it("classifica Vitrificação, com e sem acento", () => {
    expect(classifyServiceCategory(["Vitrificação Premium"])).toBe("Vitrificação");
    expect(classifyServiceCategory(["Vitrificacao Standard"])).toBe("Vitrificação");
  });

  it("classifica Polimento", () => {
    expect(classifyServiceCategory(["Polimento técnico"])).toBe("Polimento");
  });

  it("classifica Higienização", () => {
    expect(classifyServiceCategory(["Higienização de bancos"])).toBe("Higienização");
  });

  it("classifica Motor", () => {
    expect(classifyServiceCategory(["Lavagem de motor"])).toBe("Motor");
  });

  it("classifica Lavação — lavação, lavagem e lava-rápido", () => {
    expect(classifyServiceCategory(["Lavação Silver - SUV"])).toBe("Lavação");
    expect(classifyServiceCategory(["Lavagem simples"])).toBe("Lavação");
  });

  it("texto sem nenhuma palavra-chave reconhecível vira Outros — nunca uma adivinhação específica", () => {
    expect(classifyServiceCategory(["Serviço avulso XYZ"])).toBe("Outros");
  });

  it("nunca lança para texto vazio ou só espaços", () => {
    expect(classifyServiceCategory([""])).toBe("Outros");
    expect(classifyServiceCategory(["   "])).toBe("Outros");
  });
});
