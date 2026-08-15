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

  it("Missão Financeiro V2.5 (achado técnico, caso real) — 'LTDA.' sozinho (sem nome antes) nunca vira contraparte '.' — some para vazio, nunca pontuação solta", () => {
    expect(extractCounterpartyKey("LTDA. / Transferência | Pix")).toBe("");
  });

  it("'BRASIL LTDA.' recupera 'BRASIL' como fragmento — o ponto sobrando do sufixo legal mal removido nunca fica sozinho", () => {
    expect(extractCounterpartyKey("BRASIL LTDA. / Transferência | Pix")).toBe("BRASIL");
    expect(extractCounterpartyKey("BRASIL LTDA. / Transferência | Pix / STONE INSTITUIÇÃO DE")).toBe("BRASIL");
  });

  it("descrição sem nenhuma contraparte capturada (ex.: 'Transferência | Pix' sozinho) permanece vazia — nunca herda texto de linha vizinha (Recebimento vendas/Stone Instituição de)", () => {
    expect(extractCounterpartyKey("Transferência | Pix")).toBe("");
    expect(extractCounterpartyKey("Transferência | Pix / Recebimento vendas")).toBe("");
    expect(extractCounterpartyKey("Transferência | Pix / STONE INSTITUIÇÃO DE / Recebimento vendas")).toBe("");
  });

  it("caso real recuperado pelo fix: nome legítimo que ficava mascarado por 'LTDA.' agora agrupa corretamente com as demais ocorrências da mesma contraparte", () => {
    expect(extractCounterpartyKey("LTDA. / Transferência | Pix / MARCELO CORREA DE SOUZA")).toBe(extractCounterpartyKey("MARCELO CORREA DE SOUZA / Transferência | Pix"));
  });

  it("'S.A.' (com pontos) é removido por completo, sem deixar ponto solto, e sem comer 'SANEAMENTO' (nunca casa 'SA' no meio de outra palavra)", () => {
    expect(extractCounterpartyKey("TELEFONICA BRASIL S.A. / Transferência | Pix")).toBe("TELEFONICA BRASIL");
    expect(extractCounterpartyKey("AGUAS E SANEAMENTO CASAN / Transferência | Pix")).toContain("SANEAMENTO");
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
