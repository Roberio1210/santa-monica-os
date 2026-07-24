import { describe, expect, it } from "vitest";
import { buildExecutiveTimeline, computeChanges, computeTrends } from "@/lib/zezinho/directors/executiveTimeline";
import type { ConversationTurn, ConversationalMemory, Hypothesis, TimelineEntry } from "@/lib/zezinho/directors/types";

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return { description: "hipótese", evidenceFactKeys: [], contraryEvidenceFactKeys: [], basis: [], confidenceScore: 60, confidenceLevel: "media", limitations: [], ...overrides };
}

function turn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return { askedAt: "2026-07-24T12:00:00.000Z", question: "?", hypotheses: [], decisions: null, recommendations: [], actionPlans: [], ...overrides };
}

describe("computeChanges — diff real entre turnos, nunca inventado", () => {
  it("sem hipóteses/recomendações novas, não há mudanças", () => {
    const t = turn({ hypotheses: [hypothesis({ description: "h1" })] });
    expect(computeChanges(t, t)).toEqual([]);
  });

  it("aponta hipóteses e recomendações novas em relação ao turno anterior", () => {
    const previous = turn({ hypotheses: [hypothesis({ description: "h1" })] });
    const current = turn({
      hypotheses: [hypothesis({ description: "h1" }), hypothesis({ description: "h2" })],
      recommendations: [{ action: "ligar para clientes", reason: "x", evidenceFactKeys: [], priority: "alta", risk: null, howToVerify: "y" }],
    });
    const changes = computeChanges(previous, current);
    expect(changes).toContain("Nova hipótese: h2");
    expect(changes).toContain("Nova recomendação: ligar para clientes");
    expect(changes.some((c) => c.includes("h1"))).toBe(false);
  });
});

describe("computeTrends — honesto sobre histórico insuficiente", () => {
  it("com menos de 3 dias, declara que não há histórico suficiente, nunca inventa uma tendência", () => {
    const entries: TimelineEntry[] = [{ date: "2026-07-22", summary: "s", changes: [], importantEvents: [] }];
    expect(computeTrends(entries)).toEqual(["Ainda não há dias suficientes nesta conversa para apontar uma tendência (mínimo de 3)."]);
  });

  it("com 3+ dias todos trazendo novidades, aponta o padrão real", () => {
    const entries: TimelineEntry[] = [
      { date: "2026-07-22", summary: "s", changes: ["Nova hipótese: h1"], importantEvents: [] },
      { date: "2026-07-23", summary: "s", changes: ["Nova hipótese: h2"], importantEvents: [] },
      { date: "2026-07-24", summary: "s", changes: ["Nova hipótese: h3"], importantEvents: [] },
    ];
    expect(computeTrends(entries)).toContain("Todos os dias registrados nesta conversa trouxeram novidades (novas hipóteses ou recomendações).");
  });
});

describe("buildExecutiveTimeline — agrupa a memória conversacional por dia, única fonte real até o Z3B", () => {
  it("memória vazia gera timeline vazia com tendência honesta", () => {
    const memory: ConversationalMemory = { turns: [] };
    const timeline = buildExecutiveTimeline(memory);
    expect(timeline.entries).toEqual([]);
    expect(timeline.trends[0]).toMatch(/não há dias suficientes/);
  });

  it("agrupa turnos do mesmo dia numa única entrada, em ordem cronológica de dias", () => {
    const memory: ConversationalMemory = {
      turns: [
        turn({ askedAt: "2026-07-23T09:00:00.000Z", question: "pergunta A" }),
        turn({ askedAt: "2026-07-23T15:00:00.000Z", question: "pergunta B" }),
        turn({ askedAt: "2026-07-24T09:00:00.000Z", question: "pergunta C" }),
      ],
    };
    const timeline = buildExecutiveTimeline(memory);
    expect(timeline.entries.map((e) => e.date)).toEqual(["2026-07-23", "2026-07-24"]);
    expect(timeline.entries[0].summary).toContain("2 perguntas");
    expect(timeline.entries[1].summary).toContain("1 pergunta");
  });

  it("importantEvents só inclui hipóteses de alta confiança e planos de alta prioridade", () => {
    const memory: ConversationalMemory = {
      turns: [
        turn({
          hypotheses: [hypothesis({ description: "alta", confidenceLevel: "alta" }), hypothesis({ description: "media", confidenceLevel: "media" })],
          actionPlans: [{ id: "p1", status: "identificado", action: "agir", reason: "r", priority: "alta", responsible: null, expectedImpact: "e", suggestedDeadline: null, evidenceFactKeys: [] }],
        }),
      ],
    };
    const timeline = buildExecutiveTimeline(memory);
    expect(timeline.entries[0].importantEvents).toEqual(["Hipótese de alta confiança: alta", "Plano de alta prioridade: agir"]);
  });

  it("changes da primeira entrada fica vazio (sem entrada anterior); a segunda reflete o diff real", () => {
    const memory: ConversationalMemory = {
      turns: [
        turn({ askedAt: "2026-07-23T09:00:00.000Z", hypotheses: [hypothesis({ description: "h1" })] }),
        turn({ askedAt: "2026-07-24T09:00:00.000Z", hypotheses: [hypothesis({ description: "h1" }), hypothesis({ description: "h2" })] }),
      ],
    };
    const timeline = buildExecutiveTimeline(memory);
    expect(timeline.entries[0].changes).toEqual([]);
    expect(timeline.entries[1].changes).toEqual(["Nova hipótese: h2"]);
  });
});
