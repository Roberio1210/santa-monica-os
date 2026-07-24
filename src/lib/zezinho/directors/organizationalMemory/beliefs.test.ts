import { describe, expect, it } from "vitest";
import { SEED_BELIEFS, findRelevantBeliefs } from "@/lib/zezinho/directors/organizationalMemory/beliefs";
import type { Belief } from "@/lib/zezinho/directors/organizationalMemory/types";

describe("SEED_BELIEFS — crenças da empresa (Sprint 5.0, Z3B, decisão do usuário)", () => {
  it("inclui os 4 exemplos dados literalmente pelo usuário", () => {
    const statements = SEED_BELIEFS.map((b) => b.statement);
    expect(statements.some((s) => /qualidade acima da velocidade/i.test(s))).toBe(true);
    expect(statements.some((s) => /adicionais/i.test(s))).toBe(true);
    expect(statements.some((s) => /experiência do cliente/i.test(s))).toBe(true);
    expect(statements.some((s) => /comunicação ativa com leads/i.test(s))).toBe(true);
  });

  it("todas rastreáveis a uma origem — nunca uma crença sem source", () => {
    expect(SEED_BELIEFS.every((b) => b.source.length > 0)).toBe(true);
  });
});

describe("findRelevantBeliefs — sobreposição real de palavras-chave, nunca uma pontuação inventada", () => {
  const beliefs: Belief[] = [
    { id: "1", statement: "Qualidade acima da velocidade.", category: "qualidade", source: "teste", active: true },
    { id: "2", statement: "Manter comunicação ativa com leads.", category: "vendas", source: "teste", active: true },
  ];

  it("sem nenhuma palavra em comum, devolve lista vazia", () => {
    expect(findRelevantBeliefs(beliefs, "estoque de produtos químicos baixo")).toEqual([]);
  });

  it("encontra a crença cujas palavras aparecem no texto", () => {
    const relevant = findRelevantBeliefs(beliefs, "Ligar para os leads que ainda não responderam");
    expect(relevant.map((b) => b.id)).toEqual(["2"]);
  });

  it("ordena por maior sobreposição primeiro", () => {
    const relevant = findRelevantBeliefs(beliefs, "manter velocidade e qualidade na comunicação com leads");
    expect(relevant.map((b) => b.id)).toEqual(["2", "1"]);
  });

  it("texto sem palavras relevantes (só conectores curtos) devolve lista vazia", () => {
    expect(findRelevantBeliefs(beliefs, "de a e o")).toEqual([]);
  });
});
