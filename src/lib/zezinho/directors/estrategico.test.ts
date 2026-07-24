import { describe, expect, it } from "vitest";
import { consolidate, computeExecutiveAdvice, computeExecutiveDecisions, detectCrossDirectorHypotheses } from "@/lib/zezinho/directors/estrategico";
import { testFact, testReport as report } from "@/lib/zezinho/directors/testFixtures";

describe("consolidate — Diretor Estratégico (Sprint 5.0, Z1: consolidação simples)", () => {
  it("nunca perde informação — todos os relatórios de origem continuam íntegros", () => {
    const r1 = report({ director: "financeiro", risks: [{ statement: "risco financeiro", evidenceFactKeys: ["x"] }] });
    const r2 = report({ director: "estoque", opportunities: [{ statement: "oportunidade de estoque", evidenceFactKeys: ["y"] }] });
    const consolidated = consolidate([r1, r2]);
    expect(consolidated.reports).toEqual([r1, r2]);
    expect(consolidated.risks).toHaveLength(1);
    expect(consolidated.opportunities).toHaveLength(1);
  });

  it("sem nenhum risco/oportunidade de nenhum diretor, prioridade geral é baixa", () => {
    const consolidated = consolidate([report({}), report({ director: "estoque" })]);
    expect(consolidated.overallPriority).toBe("baixa");
  });

  it("participatingDirectors reflete só quem passou no próprio participationCriteria", () => {
    const consolidated = consolidate([report({ director: "financeiro", shouldParticipateInBriefing: true }), report({ director: "rh", shouldParticipateInBriefing: false })]);
    expect(consolidated.participatingDirectors).toEqual(["financeiro"]);
  });

  it("limitations nunca duplica a mesma frase de dois diretores", () => {
    const consolidated = consolidate([report({ director: "financeiro", limitations: ["JumpPark não configurado."] }), report({ director: "operacoes", limitations: ["JumpPark não configurado."] })]);
    expect(consolidated.limitations).toEqual(["JumpPark não configurado."]);
  });

  it("correlações do Diretor de Inteligência são preservadas na saída consolidada", () => {
    const consolidated = consolidate([report({})], [{ statement: "correlação real", confidence: "media", evidenceFactKeys: ["a", "b"], directors: ["financeiro", "operacoes"] }]);
    expect(consolidated.correlations).toHaveLength(1);
  });

  it("agrega os planos de ação de todos os diretores", () => {
    const plan = { id: "financeiro-plan-0-x", status: "identificado" as const, action: "fazer x", reason: "porque y", priority: "alta" as const, responsible: null, expectedImpact: "z", suggestedDeadline: null, evidenceFactKeys: [] };
    const consolidated = consolidate([report({ director: "financeiro", actionPlans: [plan] })]);
    expect(consolidated.actionPlans).toEqual([plan]);
  });
});

describe("detectCrossDirectorHypotheses — 'Contradições' (Sprint 5.0, Z2, decisão do usuário)", () => {
  it("gargalo de conversão: só surge com evidência real dos 3 diretores (Financeiro + Operações + Comercial)", () => {
    const semNada = [report({ director: "financeiro" }), report({ director: "operacoes" }), report({ director: "comercial" })];
    expect(detectCrossDirectorHypotheses(semNada)).toEqual([]);

    const comEvidencia = [
      report({ director: "financeiro", risks: [{ statement: "ritmo abaixo do necessário", evidenceFactKeys: ["goal_progress"] }] }),
      report({ director: "operacoes", risks: [{ statement: "movimento abaixo do histórico", evidenceFactKeys: ["historical_pattern", "vehicles"] }] }),
      report({ director: "comercial", opportunities: [{ statement: "clientes em risco", evidenceFactKeys: ["crm_at_risk_count"] }] }),
    ];
    const hypotheses = detectCrossDirectorHypotheses(comEvidencia);
    expect(hypotheses).toHaveLength(1);
    expect(hypotheses[0].description).toMatch(/gargalo de conversão/i);
    expect(hypotheses[0].confidenceLevel).toBe("media");
  });

  it("problema de captura de leads: fica dormente sem Marketing ter fonte real (nunca inventa)", () => {
    const reports = [report({ director: "marketing", dataAvailability: "indisponivel" }), report({ director: "comercial" })];
    expect(detectCrossDirectorHypotheses(reports)).toEqual([]);
  });

  it("problema de captura de leads: dispara quando (hipoteticamente) há evidência real dos dois lados", () => {
    const reports = [
      report({ director: "marketing", facts: [testFact({ key: "marketing_traffic", direction: "aumento" })] }),
      report({ director: "comercial", facts: [testFact({ key: "crm_contacts", direction: "queda" })] }),
    ];
    const hypotheses = detectCrossDirectorHypotheses(reports);
    expect(hypotheses).toHaveLength(1);
    expect(hypotheses[0].description).toMatch(/captura de leads/i);
  });
});

describe("computeExecutiveDecisions — as três perguntas centrais (Sprint 5.0, Z2, decisão do usuário)", () => {
  it("'o que merece atenção hoje' prioriza hipóteses cruzadas antes dos riscos individuais, no máximo 3", () => {
    const reports = [report({ director: "financeiro", risks: [{ statement: "risco 1", evidenceFactKeys: [] }, { statement: "risco 2", evidenceFactKeys: [] }, { statement: "risco 3", evidenceFactKeys: [] }, { statement: "risco 4", evidenceFactKeys: [] }] })];
    const hypotheses = [{ description: "hipótese cruzada", evidenceFactKeys: [], contraryEvidenceFactKeys: [], basis: [], confidenceScore: 60, confidenceLevel: "media" as const, limitations: [] }];
    const decisions = computeExecutiveDecisions(reports, hypotheses);
    expect(decisions.whatDeservesAttentionToday.length).toBeLessThanOrEqual(3);
    expect(decisions.whatDeservesAttentionToday[0].statement).toBe("hipótese cruzada");
  });

  it("'o que eu faria primeiro' é a recomendação de maior prioridade entre todos os diretores", () => {
    const reports = [
      report({ director: "financeiro", recommendations: [{ action: "ação média", reason: "r", evidenceFactKeys: [], priority: "media", risk: null, howToVerify: "v" }] }),
      report({ director: "estoque", recommendations: [{ action: "ação alta", reason: "r", evidenceFactKeys: [], priority: "alta", risk: null, howToVerify: "v" }] }),
    ];
    const decisions = computeExecutiveDecisions(reports, []);
    expect(decisions.whatIWouldDoFirst?.action).toBe("ação alta");
  });

  it("sem nenhuma recomendação, 'o que eu faria primeiro' é honestamente null", () => {
    const decisions = computeExecutiveDecisions([report({})], []);
    expect(decisions.whatIWouldDoFirst).toBeNull();
  });

  it("'o que pode esperar' vem das oportunidades, nunca dos riscos", () => {
    const reports = [report({ director: "estoque", opportunities: [{ statement: "oportunidade", evidenceFactKeys: [] }], risks: [{ statement: "risco", evidenceFactKeys: [] }] })];
    const decisions = computeExecutiveDecisions(reports, []);
    expect(decisions.whatCanWait).toEqual([{ statement: "oportunidade", evidenceFactKeys: [] }]);
  });
});

describe("computeExecutiveAdvice — 'Meu conselho para hoje' (novo componente, decisão do usuário)", () => {
  it("baseado na recomendação de maior prioridade quando existe uma", () => {
    const decisions = { whatDeservesAttentionToday: [], whatIWouldDoFirst: { action: "Reforçar adicionais.", reason: "ticket baixo", evidenceFactKeys: ["avgTicket"], priority: "alta" as const, risk: null, howToVerify: "v" }, whatCanWait: [] };
    const advice = computeExecutiveAdvice(decisions, "media");
    expect(advice.statement).toMatch(/se eu estivesse administrando/i);
    expect(advice.statement).toMatch(/reforçar adicionais/i);
    expect(advice.basedOnFactKeys).toEqual(["avgTicket"]);
  });

  it("sem nenhuma recomendação nem risco, admite honestamente — nunca inventa um conselho", () => {
    const advice = computeExecutiveAdvice({ whatDeservesAttentionToday: [], whatIWouldDoFirst: null, whatCanWait: [] }, "baixa");
    expect(advice.statement).toMatch(/não tenho dados suficientes/i);
    expect(advice.confidence).toBe("baixa");
  });
});
