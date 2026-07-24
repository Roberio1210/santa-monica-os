import { describe, expect, it } from "vitest";
import { deriveStrategicCandidates } from "@/lib/zezinho/directors/organizationalMemory/strategic";
import { testFact, testReport } from "@/lib/zezinho/directors/testFixtures";

describe("deriveStrategicCandidates — Memória Estratégica (Sprint 5.0, Z3B, decisão do usuário)", () => {
  it("sem nenhum fato goal_progress, nenhum candidato — nunca inventa meta/projeto/objetivo", () => {
    expect(deriveStrategicCandidates([testReport()])).toEqual([]);
  });

  it("extrai o título da meta a partir do texto real do fato", () => {
    const report = testReport({ facts: [testFact({ key: "goal_progress", statement: 'Meta "Lavação Julho": 62% atingido, ritmo abaixo do ritmo.' })] });
    const candidates = deriveStrategicCandidates([report]);
    expect(candidates).toEqual([{ kind: "meta", title: "Lavação Julho", description: 'Meta "Lavação Julho": 62% atingido, ritmo abaixo do ritmo.', evidenceFactKeys: ["goal_progress"] }]);
  });

  it("sem o padrão esperado no texto, usa o texto inteiro como título honestamente, nunca lança", () => {
    const report = testReport({ facts: [testFact({ key: "goal_progress", statement: "texto sem o padrão esperado" })] });
    expect(deriveStrategicCandidates([report])[0].title).toBe("texto sem o padrão esperado");
  });

  it("um candidato por Diretor com goal_progress, mesmo entre vários relatórios", () => {
    const reports = [testReport({ director: "financeiro", facts: [testFact({ key: "goal_progress", statement: 'Meta "A": 1% atingido.' })] }), testReport({ director: "operacoes" })];
    expect(deriveStrategicCandidates(reports)).toHaveLength(1);
  });
});
