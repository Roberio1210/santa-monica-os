import { describe, expect, it } from "vitest";
import { recordDiretoriaRun } from "@/lib/zezinho/directors/organizationalMemory/service";
import { testFact, testReport } from "@/lib/zezinho/directors/testFixtures";
import { MIN_CONFIRMATIONS_FOR_APRENDIZADO, MIN_DAYS_SPAN_FOR_APRENDIZADO } from "@/lib/zezinho/directors/organizationalMemory/learnings";

/**
 * `getOrganizationalMemoryRepository()` é um singleton por arquivo de teste (mesmo padrão dos
 * demais `repository-factory.ts` do projeto) — por isso cada teste aqui usa um diretor/hipótese
 * com texto único, para nunca colidir com o estado deixado por um teste anterior no mesmo arquivo.
 */

function day(offset: number): Date {
  return new Date(new Date("2026-07-01T12:00:00.000Z").getTime() + offset * 86400000);
}

describe("recordDiretoriaRun — Memória Organizacional (Sprint 5.0, Z3B, decisão do usuário)", () => {
  it("grava a leitura do dia e devolve memoryNote null no primeiro dia (histórico insuficiente)", async () => {
    const report = testReport({
      director: "financeiro",
      facts: [testFact({ key: "cashResultado", direction: "queda", statement: "caixa caiu" })],
      risks: [{ statement: "caixa caiu — sinal financeiro-svc-teste-1", evidenceFactKeys: ["cashResultado"] }],
    });
    const { reports } = await recordDiretoriaRun([report], day(0));
    expect(reports[0].memoryNote).toBeNull();
  });

  it("memoryNote aponta a sequência real depois de dias consecutivos com o mesmo sinal", async () => {
    const makeReport = () =>
      testReport({
        director: "operacoes",
        facts: [testFact({ key: "avgTicket", direction: "queda", statement: "ticket médio caiu — teste-streak" })],
        risks: [{ statement: "ticket médio em queda — teste-streak", evidenceFactKeys: ["avgTicket"] }],
      });

    await recordDiretoriaRun([makeReport()], day(10));
    await recordDiretoriaRun([makeReport()], day(11));
    const { reports } = await recordDiretoriaRun([makeReport()], day(12));

    expect(reports[0].memoryNote).toBe('Já é o 3º dia consecutivo de queda em "avgTicket".');
  });

  it("uma hipótese isolada (uma só ocorrência) nunca vira aprendizado — nunca promove sem recorrência real", async () => {
    const report = testReport({
      director: "comercial",
      hypotheses: [{ description: "hipótese isolada teste-unica", evidenceFactKeys: [], contraryEvidenceFactKeys: [], basis: [], confidenceScore: 60, confidenceLevel: "media", limitations: [] }],
    });
    const { organizationalMemory } = await recordDiretoriaRun([report], day(20));
    expect(organizationalMemory.recentLearnings.some((l) => l.description === "hipótese isolada teste-unica")).toBe(false);
  });

  it("promove observacao -> aprendizado depois de confirmações suficientes em dias reais distintos", async () => {
    const makeReport = () =>
      testReport({
        director: "estoque",
        hypotheses: [{ description: "gargalo recorrente teste-promocao", evidenceFactKeys: [], contraryEvidenceFactKeys: [], basis: [], confidenceScore: 60, confidenceLevel: "media", limitations: [] }],
      });

    let organizationalMemory;
    for (let i = 0; i < MIN_CONFIRMATIONS_FOR_APRENDIZADO; i++) {
      ({ organizationalMemory } = await recordDiretoriaRun([makeReport()], day(30 + i * MIN_DAYS_SPAN_FOR_APRENDIZADO)));
    }

    const promoted = organizationalMemory!.recentLearnings.find((l) => l.description === "gargalo recorrente teste-promocao");
    expect(promoted?.status).toBe("aprendizado");
    expect(promoted?.confirmationCount).toBe(MIN_CONFIRMATIONS_FOR_APRENDIZADO);
  });

  it("expira observações não confirmadas depois do prazo — mecanismo de esquecimento explícito", async () => {
    const onceReport = testReport({ director: "marketing", hypotheses: [{ description: "observação única teste-esquecimento", evidenceFactKeys: [], contraryEvidenceFactKeys: [], basis: [], confidenceScore: 60, confidenceLevel: "media", limitations: [] }] });
    await recordDiretoriaRun([onceReport], day(40));

    const laterReport = testReport({ director: "marketing", hypotheses: [] });
    const { organizationalMemory } = await recordDiretoriaRun([laterReport], day(40 + 20));

    expect(organizationalMemory.expiredObservationsCount).toBeGreaterThanOrEqual(1);
  });

  it("extrai itens de Memória Estratégica reais a partir de goal_progress, nunca inventa projeto/objetivo", async () => {
    const report = testReport({ director: "financeiro", facts: [testFact({ key: "goal_progress", statement: 'Meta "Teste Estratégico": 50% atingido.' })] });
    const { organizationalMemory } = await recordDiretoriaRun([report], day(50));
    expect(organizationalMemory.strategicItems.some((i) => i.title === "Teste Estratégico")).toBe(true);
  });

  it("sempre declara limitações honestas sobre o alcance da Memória Organizacional", async () => {
    const { organizationalMemory } = await recordDiretoriaRun([testReport()], day(60));
    expect(organizationalMemory.limitations.length).toBeGreaterThan(0);
  });
});
