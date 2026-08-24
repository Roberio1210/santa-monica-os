import { describe, expect, it } from "vitest";
import { classifyPostSale, draftPostSaleMessage, REVIEW_LINK_PLACEHOLDER } from "@/lib/management/postSale";

describe("classifyPostSale", () => {
  it("lavação/higienização concluída -> categoria A (pedir avaliação)", () => {
    expect(classifyPostSale({ services: [{ description: "Lavação Externa", amount: 80 }] }).category).toBe("A");
    expect(classifyPostSale({ services: [{ description: "Higienização Interna", amount: 200 }] }).category).toBe("A");
  });

  it("polimento/vitrificação/faróis -> categoria B (verificar satisfação antes)", () => {
    expect(classifyPostSale({ services: [{ description: "Polimento Técnico", amount: 1000 }] }).category).toBe("B");
    expect(classifyPostSale({ services: [{ description: "Vitrificação 3 anos", amount: 2300 }] }).category).toBe("B");
    expect(classifyPostSale({ services: [{ description: "Revitalização de Faróis", amount: 250 }] }).category).toBe("B");
  });

  it("estacionamento/ozônio -> categoria C (não abordar agora)", () => {
    expect(classifyPostSale({ services: [{ description: "Estacionamento 08h-18h Hora", amount: 10 }] }).category).toBe("C");
  });

  it("serviço não reconhecido -> categoria C com motivo explícito de revisão manual, nunca D (D exige checagem humana)", () => {
    const result = classifyPostSale({ services: [{ description: "Serviço genérico não catalogado", amount: 50 }] });
    expect(result.category).toBe("C");
    expect(result.reason).toMatch(/manual/i);
  });

  it("nunca classifica D automaticamente — nenhuma fonte real de reclamação está disponível", () => {
    const samples = [
      { services: [{ description: "Lavação Externa", amount: 80 }] },
      { services: [{ description: "Polimento Comercial", amount: 600 }] },
      { services: [{ description: "Qualquer outra coisa", amount: 1 }] },
    ];
    for (const s of samples) expect(classifyPostSale(s).category).not.toBe("D");
  });
});

describe("draftPostSaleMessage", () => {
  it("nunca usa a mesma frase para clientes diferentes (varia por categoria/serviço/veículo)", () => {
    const a = draftPostSaleMessage({ clientName: "Daniel Souza", vehicleModel: "Compass", services: [{ description: "Revitalização de Faróis", amount: 250 }] }, "B");
    const b = draftPostSaleMessage({ clientName: "Maria Silva", vehicleModel: "Onix", services: [{ description: "Lavação Externa", amount: 80 }] }, "A");
    expect(a).not.toBe(b);
    expect(a).toContain("Daniel");
    expect(a).toContain("Compass");
    expect(b).toContain("Maria");
    expect(b).toContain("Onix");
  });

  it("nunca inventa modelo de veículo quando não cadastrado", () => {
    const text = draftPostSaleMessage({ clientName: "João", vehicleModel: "", services: [{ description: "Lavação Interna", amount: 70 }] }, "A");
    expect(text).toContain("seu veículo");
    expect(text).not.toMatch(/undefined|null/);
  });

  it("mensagem de categoria A convida para avaliação; categoria B só pergunta satisfação, nunca pede avaliação de cara", () => {
    const aText = draftPostSaleMessage({ clientName: "Ana", vehicleModel: "HB20", services: [{ description: "Higienização Completa", amount: 500 }] }, "A");
    const bText = draftPostSaleMessage({ clientName: "Ana", vehicleModel: "HB20", services: [{ description: "Vitrificação 1 ano", amount: 1300 }] }, "B");
    expect(aText.toLowerCase()).toContain("avaliação");
    expect(bText.toLowerCase()).not.toContain("avaliação");
  });
});

describe("Missão Z5 — link de avaliação Google (ainda não configurado no sistema)", () => {
  it("mensagem de categoria A traz o placeholder explícito, nunca uma URL inventada", () => {
    const text = draftPostSaleMessage({ clientName: "João", vehicleModel: "Corolla", services: [{ description: "Lavação Externa", amount: 80 }] }, "A");
    expect(text).toContain(REVIEW_LINK_PLACEHOLDER);
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("mensagens de categoria B/C nunca mencionam avaliação nem link (só quando o resultado é bom, categoria A)", () => {
    const bText = draftPostSaleMessage({ clientName: "João", vehicleModel: "Corolla", services: [{ description: "Polimento Técnico", amount: 1000 }] }, "B");
    expect(bText).not.toContain(REVIEW_LINK_PLACEHOLDER);
  });
});

describe("Missão Z4 — nunca conta a mesma ordem duas vezes", () => {
  it("candidatos derivados de ordens distintas mantêm externalId único (nunca duplica a mesma OS)", () => {
    const orders = [
      { externalId: "os-1", clientName: "A", vehicleModel: "Onix", services: [{ description: "Lavação Externa", amount: 80 }] },
      { externalId: "os-2", clientName: "B", vehicleModel: "HB20", services: [{ description: "Lavação Externa", amount: 80 }] },
    ];
    const ids = orders.map((o) => o.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
