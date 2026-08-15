import { describe, expect, it } from "vitest";
import { counterpartyMatchesRegisteredName, extractCounterpartyKey, normalizeDescription } from "@/lib/finance/bankStatement/normalization";

describe("normalizeDescription — Missão Financeiro V2.2 (Fase B)", () => {
  it("remove rótulos técnicos do extrato Stone, preserva o nome da contraparte", () => {
    expect(normalizeDescription("CELESC DISTRIBUICAO S.A / Transferência | Pix")).toContain("CELESC");
    expect(normalizeDescription("Transferência | Pix / VERISURE BRASIL")).toContain("VERISURE BRASIL");
  });

  it("nunca lança nem retorna vazio para descrição só com ruído", () => {
    expect(() => normalizeDescription("Transferência | Pix")).not.toThrow();
  });

  it("colapsa espaços duplicados e remove acentuação/caixa", () => {
    expect(normalizeDescription("Água   e   Saneamento")).toBe("AGUA E SANEAMENTO");
  });

  it("mesma contraparte com grafias levemente diferentes normaliza igual", () => {
    const a = normalizeDescription("Transferência | Pix / celesc distribuicao s.a");
    const b = normalizeDescription("CELESC DISTRIBUICAO S.A / Transferência | Pix");
    expect(a).toBe(b);
  });
});

describe("extractCounterpartyKey", () => {
  it("remove fragmentos numéricos curtos isolados (ex.: código truncado de CPF)", () => {
    const key = extractCounterpartyKey("51.097.860  RODRIGO PASSOS / Pix | Maquininha");
    expect(key).toContain("RODRIGO PASSOS");
  });

  it("preserva números longos que podem ser identificadores reais", () => {
    const key = extractCounterpartyKey("40.844.861 FERNANDO PINOTTI / Transferência | Pix");
    expect(key).toContain("FERNANDO PINOTTI");
  });
});

describe("counterpartyMatchesRegisteredName — nunca aproxima além de sufixo legal/acento/caixa", () => {
  it("match exato após remover sufixos legais/setoriais", () => {
    expect(counterpartyMatchesRegisteredName("CELESC DISTRIBUICAO S.A", "Celesc")).toBe("exact");
  });

  it("nome parcial (contém) quando não é redutível a sufixo conhecido", () => {
    expect(counterpartyMatchesRegisteredName("VERISURE BRASIL MONITORAMENTO", "Verisure")).toBe("contains");
  });

  it("nome idêntico -> exact", () => {
    expect(counterpartyMatchesRegisteredName("Verisure", "Verisure")).toBe("exact");
  });

  it("nomes sem nenhuma relação -> none", () => {
    expect(counterpartyMatchesRegisteredName("UBER DO BRASIL TECNOLOGIA", "Celesc")).toBe("none");
  });

  it("string vazia nunca gera match falso-positivo", () => {
    expect(counterpartyMatchesRegisteredName("", "Celesc")).toBe("none");
  });

  it("Missão Financeiro V2.2 (item 7A, caso real) — CASANOVA nunca bate com fornecedor CASAN (substring dentro de outra palavra)", () => {
    expect(counterpartyMatchesRegisteredName("ELANA CASANOVA", "CASAN")).toBe("none");
    expect(counterpartyMatchesRegisteredName("66.434.434 ELANA CASANOVA", "CASAN")).toBe("none");
    expect(counterpartyMatchesRegisteredName("66.434.434 ELANA CASANOVA FACEBOOK SERVICOS ONLINE DO", "CASAN")).toBe("none");
  });

  it("mas CASAN continua batendo normalmente como palavra inteira (nunca quebra o caso legítimo)", () => {
    expect(counterpartyMatchesRegisteredName("AGUAS E SANEAMENTO CASAN", "CASAN")).toBe("contains");
    expect(counterpartyMatchesRegisteredName("CASAN", "CASAN")).toBe("exact");
  });

  it("nenhuma outra palavra-substring é confundida com o fornecedor (ex.: 'STONE' dentro de 'STONEHENGE' nunca bate)", () => {
    expect(counterpartyMatchesRegisteredName("EMPRESA STONEHENGE LTDA", "Stone")).toBe("none");
  });
});
