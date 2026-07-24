import { describe, expect, it } from "vitest";
import { recalculateConfidence, reviewHypotheses } from "@/lib/zezinho/directors/crossReview";
import { testReport } from "@/lib/zezinho/directors/testFixtures";
import type { Hypothesis } from "@/lib/zezinho/directors/types";

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return { description: "hipótese", evidenceFactKeys: [], contraryEvidenceFactKeys: [], basis: ["financeiro"], confidenceScore: 60, confidenceLevel: "media", limitations: [], ...overrides };
}

describe("recalculateConfidence — Evidências Contrárias (Sprint 5.0, Z3A, decisão do usuário)", () => {
  it("sem revisões, devolve a hipótese intacta", () => {
    const h = hypothesis();
    expect(recalculateConfidence(h, [])).toBe(h);
  });

  it("cada confirmação reforça um pouco a confiança, sem estourar 100", () => {
    const h = hypothesis({ confidenceScore: 60 });
    const reviews = [
      { reviewerDirector: "operacoes" as const, stance: "confirma" as const, statement: "confirmo", evidenceFactKeys: ["historical_pattern"] },
      { reviewerDirector: "comercial" as const, stance: "confirma" as const, statement: "também confirmo", evidenceFactKeys: ["crm_at_risk_count"] },
    ];
    const result = recalculateConfidence(h, reviews);
    expect(result.confidenceScore).toBe(76);
    expect(result.confidenceLevel).toBe("alta");
    expect(result.contraryEvidenceFactKeys).toEqual([]);
  });

  it("contestação pesa mais que confirmação, registra evidência contrária e declara a limitação", () => {
    const h = hypothesis({ confidenceScore: 60, limitations: ["base original"] });
    const reviews = [{ reviewerDirector: "marketing" as const, stance: "contesta" as const, statement: "discordo", evidenceFactKeys: ["marketing_traffic"] }];
    const result = recalculateConfidence(h, reviews);
    expect(result.confidenceScore).toBe(42);
    expect(result.confidenceLevel).toBe("baixa");
    expect(result.contraryEvidenceFactKeys).toEqual(["marketing_traffic"]);
    expect(result.limitations).toContain("base original");
    expect(result.limitations.some((l) => l.includes("evidência contrária"))).toBe(true);
  });

  it("nunca sai da faixa 0-100", () => {
    const h = hypothesis({ confidenceScore: 10 });
    const reviews = [
      { reviewerDirector: "marketing" as const, stance: "contesta" as const, statement: "a", evidenceFactKeys: ["k1"] },
      { reviewerDirector: "estoque" as const, stance: "contesta" as const, statement: "b", evidenceFactKeys: ["k2"] },
    ];
    expect(recalculateConfidence(h, reviews).confidenceScore).toBe(0);
  });
});

describe("reviewHypotheses — só revisa com evidência própria real, nunca uma opinião sem lastro", () => {
  it("sem nenhum outro Diretor com risco/oportunidade no mesmo domínio, a hipótese fica sem revisões", () => {
    const financeiro = testReport({ director: "financeiro", hypotheses: [hypothesis({ basis: ["financeiro"] })] });
    const operacoes = testReport({ director: "operacoes", risks: [], opportunities: [] });
    const result = reviewHypotheses([financeiro, operacoes]);
    expect(result).toHaveLength(1);
    expect(result[0].reviews).toEqual([]);
    expect(result[0].sourceDirector).toBe("financeiro");
  });

  it("um Diretor com risco real no mesmo domínio confirma a hipótese de outro", () => {
    const financeiro = testReport({ director: "financeiro", hypotheses: [hypothesis({ basis: ["operação"] })] });
    const operacoes = testReport({ director: "operacoes", risks: [{ statement: "movimento abaixo do padrão", evidenceFactKeys: ["vehicles"] }] });
    const result = reviewHypotheses([financeiro, operacoes]);
    expect(result[0].reviews).toHaveLength(1);
    expect(result[0].reviews[0]).toMatchObject({ reviewerDirector: "operacoes", stance: "confirma" });
  });

  it("um Diretor com oportunidade real no mesmo domínio contesta a hipótese de outro", () => {
    const financeiro = testReport({ director: "financeiro", hypotheses: [hypothesis({ basis: ["clientes"] })] });
    const comercial = testReport({ director: "comercial", opportunities: [{ statement: "clientes disponíveis para contato", evidenceFactKeys: ["crm_at_risk_count"] }] });
    const result = reviewHypotheses([financeiro, comercial]);
    expect(result[0].reviews).toHaveLength(1);
    expect(result[0].reviews[0]).toMatchObject({ reviewerDirector: "comercial", stance: "contesta" });
  });

  it("um Diretor nunca revisa a própria hipótese", () => {
    const financeiro = testReport({
      director: "financeiro",
      hypotheses: [hypothesis({ basis: ["financeiro"] })],
      risks: [{ statement: "risco próprio no mesmo domínio", evidenceFactKeys: ["cashResultado"] }],
    });
    const result = reviewHypotheses([financeiro]);
    expect(result[0].reviews).toEqual([]);
  });

  it("hipóteses cruzadas (sourceDirector null) também são revisadas contra todos os Diretores", () => {
    const financeiro = testReport({ director: "financeiro" });
    const operacoes = testReport({ director: "operacoes", risks: [{ statement: "movimento abaixo do padrão", evidenceFactKeys: ["vehicles"] }] });
    const crossHypothesis = hypothesis({ basis: ["operação"], description: "gargalo de conversão" });
    const result = reviewHypotheses([financeiro, operacoes], [crossHypothesis]);
    expect(result).toHaveLength(1);
    expect(result[0].sourceDirector).toBeNull();
    expect(result[0].reviews).toHaveLength(1);
  });
});
