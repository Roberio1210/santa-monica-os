import { describe, expect, it } from "vitest";
import { extractExplicitIsoRange, hasComparisonIntent, parseComparisonExpression, parseSinglePeriodExpression } from "@/lib/zezinho/date-parser";

// 19/07/2026 em America/Sao_Paulo (referência fixa usada em toda a sprint anterior).
const REFERENCE = new Date("2026-07-19T15:00:00.000Z");

describe("parseComparisonExpression — pergunta obrigatória da sprint", () => {
  it("'estes 19 dias do mês de julho em relação aos 19 dias do mês de junho' -> 01-19/07 x 01-19/06", () => {
    const text = "Bom dia, o que você está achando da performance destes 19 dias do mês de julho em relação aos 19 dias do mês de junho?";
    const result = parseComparisonExpression(text, REFERENCE);
    expect(result).not.toBeNull();
    expect(result!.periodA).toMatchObject({ from: "2026-07-01", to: "2026-07-19" });
    expect(result!.periodB).toMatchObject({ from: "2026-06-01", to: "2026-06-19" });
    expect(result!.dayMatched).toBe(true);
    expect(result!.note).toContain("19/07");
  });

  it("funciona com 'desses' em vez de 'destes'", () => {
    const text = "o que você está achando da performance desses 19 dias do mês de julho em relação aos 19 dias do mês de junho?";
    const result = parseComparisonExpression(text, REFERENCE);
    expect(result?.periodA).toMatchObject({ from: "2026-07-01", to: "2026-07-19" });
    expect(result?.periodB).toMatchObject({ from: "2026-06-01", to: "2026-06-19" });
  });
});

describe("parseComparisonExpression — variações da seção 16", () => {
  it("'Compare julho com junho.' com mês atual incompleto casa os dias", () => {
    const result = parseComparisonExpression("Compare julho com junho.", REFERENCE);
    expect(result).not.toBeNull();
    expect(result!.periodA).toMatchObject({ from: "2026-07-01", to: "2026-07-19" });
    expect(result!.periodB).toMatchObject({ from: "2026-06-01", to: "2026-06-19" });
    expect(result!.dayMatched).toBe(true);
  });

  it("'Estamos melhores que no mês passado?' cai no default mês atual x mês anterior", () => {
    const result = parseComparisonExpression("Estamos melhores que no mês passado?", REFERENCE);
    expect(result).not.toBeNull();
    expect(result!.periodA.to).toBe("2026-07-19");
    expect(result!.periodB.to).toBe("2026-06-19");
  });

  it("'Compare hoje com ontem.'", () => {
    const result = parseComparisonExpression("Compare hoje com ontem.", REFERENCE);
    expect(result).toEqual({
      periodA: { key: "today", from: "2026-07-19", to: "2026-07-19", label: "Hoje" },
      periodB: { key: "yesterday", from: "2026-07-18", to: "2026-07-18", label: "Ontem" },
      dayMatched: false,
      note: null,
    });
  });

  it("'compare os últimos 7 dias' usa os 7 dias anteriores como base", () => {
    const result = parseComparisonExpression("compare os últimos 7 dias", REFERENCE);
    expect(result).not.toBeNull();
    expect(result!.periodA).toMatchObject({ from: "2026-07-13", to: "2026-07-19" });
    expect(result!.periodB).toMatchObject({ from: "2026-07-06", to: "2026-07-12" });
  });

  it("mês futuro dentro do ano (ex.: citar 'dezembro' em julho) assume o ano anterior", () => {
    const result = parseComparisonExpression("compare dezembro com novembro", REFERENCE);
    expect(result).not.toBeNull();
    expect(result!.periodA.from).toBe("2025-12-01");
    expect(result!.periodA.to).toBe("2025-12-31");
  });

  it("texto sem nenhum gatilho de comparação e sem período reconhecível retorna null", () => {
    expect(parseComparisonExpression("qual o nome do gato da loja", REFERENCE)).toBeNull();
  });

  it("'Como você avalia estes primeiros 19 dias?' sem mês explícito compara com o mesmo período do mês anterior", () => {
    const result = parseComparisonExpression("Como você avalia estes primeiros 19 dias?", REFERENCE);
    expect(result).not.toBeNull();
    expect(result!.periodA).toMatchObject({ from: "2026-07-01", to: "2026-07-19" });
    expect(result!.periodB).toMatchObject({ from: "2026-06-01", to: "2026-06-19" });
  });

  it("'O que você acha da nossa performance?' sem período explícito cai no default mês atual x anterior", () => {
    const result = parseComparisonExpression("O que você acha da nossa performance?", REFERENCE);
    expect(result).not.toBeNull();
    expect(result!.periodA.to).toBe("2026-07-19");
    expect(result!.periodB.to).toBe("2026-06-19");
  });
});

describe("hasComparisonIntent", () => {
  it("reconhece gatilhos comuns", () => {
    expect(hasComparisonIntent("compare julho com junho")).toBe(true);
    expect(hasComparisonIntent("estamos melhor ou pior?")).toBe(true);
    expect(hasComparisonIntent("julho em relação a junho")).toBe(true);
  });
  it("não reconhece texto sem gatilho", () => {
    expect(hasComparisonIntent("quanto faturamos hoje")).toBe(false);
  });
});

describe("parseSinglePeriodExpression", () => {
  it("'hoje'", () => {
    expect(parseSinglePeriodExpression("como foi hoje", REFERENCE)).toMatchObject({ from: "2026-07-19", to: "2026-07-19" });
  });
  it("'ontem'", () => {
    expect(parseSinglePeriodExpression("como foi ontem", REFERENCE)).toMatchObject({ from: "2026-07-18", to: "2026-07-18" });
  });
  it("'este mês'", () => {
    expect(parseSinglePeriodExpression("como está este mês", REFERENCE)).toMatchObject({ from: "2026-07-01", to: "2026-07-19" });
  });
  it("'mês passado' (mês completo)", () => {
    expect(parseSinglePeriodExpression("como foi o mês passado", REFERENCE)).toMatchObject({ from: "2026-06-01", to: "2026-06-30" });
  });
  it("um único mês citado (mês passado completo, não é o mês atual)", () => {
    expect(parseSinglePeriodExpression("como foi maio", REFERENCE)).toMatchObject({ from: "2026-05-01", to: "2026-05-31" });
  });
  it("texto sem período reconhecível retorna null", () => {
    expect(parseSinglePeriodExpression("qual o nome do gato", REFERENCE)).toBeNull();
  });
});

describe("extractExplicitIsoRange", () => {
  it("extrai duas datas ISO e ordena", () => {
    expect(extractExplicitIsoRange("de 2026-07-19 até 2026-07-01")).toEqual({ from: "2026-07-01", to: "2026-07-19" });
  });
  it("retorna null com menos de duas datas", () => {
    expect(extractExplicitIsoRange("2026-07-19")).toBeNull();
  });
});
