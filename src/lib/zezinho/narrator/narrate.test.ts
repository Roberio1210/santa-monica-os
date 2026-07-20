import { describe, expect, it } from "vitest";
import { narrate } from "@/lib/zezinho/narrator/narrate";
import type { ReasoningResult } from "@/lib/zezinho/reasoning/types";

function baseResult(overrides: Partial<ReasoningResult> = {}): ReasoningResult {
  return {
    intent: "compare",
    objective: "business_health",
    facts: [{ key: "revenue", label: "Faturamento operacional", statement: "Faturamento operacional cresceu (+20%), de R$ 10.000,00 para R$ 12.000,00", direction: "aumento", source: "JumpPark", isProxy: false }],
    findings: [],
    diagnosis: null,
    confidence: "media",
    gaps: [],
    recommendations: [],
    links: [],
    sources: ["JumpPark"],
    toolTrace: [],
    ...overrides,
  };
}

describe("narrate — nunca usa o formato de relatório proibido", () => {
  it("compare não abre sempre com 'Comparando'", () => {
    const { answer } = narrate(baseResult(), { usedOpeners: [] });
    expect(answer.text.trim().startsWith("Comparando")).toBe(false);
  });

  it("nunca usa os cabeçalhos fixos 'O que melhorou'/'O que merece atenção'", () => {
    const { answer } = narrate(baseResult({ intent: "recommend", recommendations: [{ action: "Focar no ticket médio.", reason: "Ele caiu.", evidenceFactKeys: [], priority: "alta", risk: null, howToVerify: "Acompanhar." }] }), { usedOpeners: [] });
    expect(answer.text).not.toContain("O que melhorou");
    expect(answer.text).not.toContain("O que merece atenção");
    expect(answer.text).not.toContain("Números principais");
  });
});

describe("narrate — recommend", () => {
  it("uma única recomendação vira prosa direta, sem numeração", () => {
    const { answer } = narrate(baseResult({ intent: "recommend", recommendations: [{ action: "Ligar para Maria hoje.", reason: "Está há 45 dias sem retorno.", evidenceFactKeys: [], priority: "alta", risk: null, howToVerify: "Confirmar retorno." }] }), { usedOpeners: [] });
    expect(answer.text).not.toMatch(/^\d\./m);
    // A abertura ("Pensando como gerente aqui,") funde com a ação em minúscula para formar uma frase só — nunca duas frases desconexas.
    expect(answer.text).toMatch(/ligar para Maria hoje/i);
  });

  it("múltiplas recomendações viram lista numerada, no máximo o que foi passado", () => {
    const { answer } = narrate(
      baseResult({
        intent: "recommend",
        recommendations: [
          { action: "Ação 1.", reason: "Motivo 1.", evidenceFactKeys: [], priority: "alta", risk: null, howToVerify: "V1" },
          { action: "Ação 2.", reason: "Motivo 2.", evidenceFactKeys: [], priority: "media", risk: null, howToVerify: "V2" },
        ],
      }),
      { usedOpeners: [] },
    );
    expect(answer.text).toContain("1. Ação 1.");
    expect(answer.text).toContain("2. Ação 2.");
  });
});

describe("narrate — variação de abertura entre turnos", () => {
  it("não repete a mesma abertura já usada na sessão", () => {
    const first = narrate(baseResult({ intent: "diagnose", diagnosis: { mainHypothesis: { statement: "O gargalo é mix de serviços.", supportingFindingKeys: [], confidence: "media" }, alternativeHypotheses: [] } }), { usedOpeners: [] });
    const second = narrate(baseResult({ intent: "diagnose", diagnosis: { mainHypothesis: { statement: "O gargalo é mix de serviços.", supportingFindingKeys: [], confidence: "media" }, alternativeHypotheses: [] } }), { usedOpeners: first.openerUsed ? [first.openerUsed] : [] });
    expect(second.openerUsed).not.toBe(first.openerUsed);
  });
});

describe("narrate — evaluate_decision assume posição clara", () => {
  it("lidera com a ação (posição), depois motivo, risco e verificação", () => {
    const { answer } = narrate(
      baseResult({ intent: "evaluate_decision", recommendations: [{ action: "Eu não mexeria no preço agora.", reason: "O ticket já está subindo.", evidenceFactKeys: [], priority: "baixa", risk: "Pode alienar cliente sensível a preço.", howToVerify: "Acompanhar o ticket." }] }),
      { usedOpeners: [] },
    );
    expect(answer.text).toContain("Eu não mexeria no preço agora");
    expect(answer.text).toContain("Risco:");
    expect(answer.text).toContain("Para confirmar:");
  });
});

describe("narrate — clarify_needed faz uma única pergunta objetiva", () => {
  it("responde com uma pergunta curta, nunca despeja dados", () => {
    const { answer } = narrate(baseResult({ intent: "clarify_needed" }), { usedOpeners: [] });
    expect(answer.text).toContain("?");
    expect(answer.links).toEqual([]);
  });
});
