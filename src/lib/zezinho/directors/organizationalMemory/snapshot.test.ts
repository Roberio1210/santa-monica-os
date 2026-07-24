import { describe, expect, it } from "vitest";
import { computeMemoryNote, summarizeDirectorForSnapshot } from "@/lib/zezinho/directors/organizationalMemory/snapshot";
import { testFact, testReport } from "@/lib/zezinho/directors/testFixtures";
import type { DirectorDailySnapshot } from "@/lib/zezinho/directors/organizationalMemory/types";

function snapshot(overrides: Partial<DirectorDailySnapshot> = {}): DirectorDailySnapshot {
  return { id: "1", directorId: "financeiro", snapshotDate: "2026-07-20", summary: "s", metricKey: "cashResultado", direction: "queda", evidenceFactKeys: [], createdAt: "2026-07-20T12:00:00.000Z", ...overrides };
}

describe("summarizeDirectorForSnapshot — Memória Operacional (Sprint 5.0, Z3B, decisão do usuário)", () => {
  it("sem nenhum sinal (sem fatos/riscos/oportunidades/hipóteses), devolve null — nunca grava uma leitura vazia", () => {
    expect(summarizeDirectorForSnapshot(testReport())).toBeNull();
  });

  it("prioriza um risco, e busca o fato correspondente pela evidência para achar a direção", () => {
    const report = testReport({
      facts: [testFact({ key: "goal_progress", direction: "queda", statement: "meta abaixo do ritmo" })],
      risks: [{ statement: "ritmo abaixo do necessário", evidenceFactKeys: ["goal_progress"] }],
    });
    const candidate = summarizeDirectorForSnapshot(report);
    expect(candidate).toEqual({ summary: "ritmo abaixo do necessário", metricKey: "goal_progress", direction: "queda", evidenceFactKeys: ["goal_progress"] });
  });

  it("sem risco, usa a primeira oportunidade", () => {
    const report = testReport({
      facts: [testFact({ key: "crm_at_risk_count", direction: "aumento" })],
      opportunities: [{ statement: "clientes disponíveis para contato", evidenceFactKeys: ["crm_at_risk_count"] }],
    });
    const candidate = summarizeDirectorForSnapshot(report);
    expect(candidate?.summary).toBe("clientes disponíveis para contato");
    expect(candidate?.direction).toBe("aumento");
  });

  it("sem risco/oportunidade, usa a hipótese principal", () => {
    const report = testReport({ hypotheses: [{ description: "gargalo de conversão", evidenceFactKeys: [], contraryEvidenceFactKeys: [], basis: [], confidenceScore: 60, confidenceLevel: "media", limitations: [] }] });
    const candidate = summarizeDirectorForSnapshot(report);
    expect(candidate?.summary).toBe("gargalo de conversão");
    expect(candidate?.metricKey).toBeNull();
    expect(candidate?.direction).toBe("indisponivel");
  });

  it("sem risco/oportunidade/hipótese, usa o primeiro fato com tendência real (nunca estável/indisponível)", () => {
    const report = testReport({ facts: [testFact({ key: "vehicles", direction: "estavel" }), testFact({ key: "avgTicket", direction: "queda", statement: "ticket médio caiu" })] });
    const candidate = summarizeDirectorForSnapshot(report);
    expect(candidate).toEqual({ summary: "ticket médio caiu", metricKey: "avgTicket", direction: "queda", evidenceFactKeys: ["avgTicket"] });
  });
});

describe("computeMemoryNote — nota de tendência entre dias, nunca inventada", () => {
  it("sem histórico, devolve null", () => {
    expect(computeMemoryNote([])).toBeNull();
  });

  it("direção estável/indisponível no dia de hoje nunca vira nota", () => {
    expect(computeMemoryNote([snapshot({ direction: "estavel" })])).toBeNull();
  });

  it("sem metricKey no dia de hoje, devolve null", () => {
    expect(computeMemoryNote([snapshot({ metricKey: null })])).toBeNull();
  });

  it("um único dia (sem histórico anterior) nunca vira nota — mínimo de 2 dias consecutivos", () => {
    expect(computeMemoryNote([snapshot({ snapshotDate: "2026-07-24" })])).toBeNull();
  });

  it("3 dias consecutivos com a mesma métrica/direção vira uma nota real", () => {
    const history = [
      snapshot({ snapshotDate: "2026-07-22" }),
      snapshot({ snapshotDate: "2026-07-23" }),
      snapshot({ snapshotDate: "2026-07-24" }),
    ];
    expect(computeMemoryNote(history)).toBe('Já é o 3º dia consecutivo de queda em "cashResultado".');
  });

  it("quebra a sequência quando a métrica ou a direção mudam num dia anterior", () => {
    const history = [
      snapshot({ snapshotDate: "2026-07-21", metricKey: "avgTicket" }),
      snapshot({ snapshotDate: "2026-07-22", direction: "aumento" }),
      snapshot({ snapshotDate: "2026-07-23" }),
      snapshot({ snapshotDate: "2026-07-24" }),
    ];
    expect(computeMemoryNote(history)).toBe('Já é o 2º dia consecutivo de queda em "cashResultado".');
  });
});
