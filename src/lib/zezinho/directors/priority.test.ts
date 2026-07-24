import { describe, expect, it } from "vitest";
import { computeImpact, computePriority } from "@/lib/zezinho/directors/priority";

describe("computeImpact — classificação por domínio de fact key (Sprint 5.0, Z2)", () => {
  it("chaves financeiras conhecidas classificam impacto financeiro, nunca operacional", () => {
    const impact = computeImpact(["cashEntradas", "goal_progress"], "alta", 1, true);
    expect(impact.financialImpact).toBe("alto");
    expect(impact.operationalImpact).toBe("indeterminado");
  });

  it("chaves operacionais conhecidas classificam impacto operacional", () => {
    const impact = computeImpact(["vehicles", "historical_pattern"], "alta", 1, true);
    expect(impact.operationalImpact).toBe("alto");
    expect(impact.financialImpact).toBe("indeterminado");
  });

  it("uma única chave do domínio classifica como 'medio', nunca 'alto' sozinha", () => {
    const impact = computeImpact(["cashEntradas"], "alta", 1, true);
    expect(impact.financialImpact).toBe("medio");
  });

  it("nenhuma chave reconhecida classifica como 'indeterminado' — nunca inventa um nível", () => {
    const impact = computeImpact(["chave_desconhecida"], "alta", 1, true);
    expect(impact.financialImpact).toBe("indeterminado");
    expect(impact.operationalImpact).toBe("indeterminado");
  });

  it("risco tem urgência alta; oportunidade tem urgência média", () => {
    expect(computeImpact([], "alta", 1, true).urgency).toBe("alta");
    expect(computeImpact([], "alta", 1, false).urgency).toBe("media");
  });

  it("aceita ContextQuality diretamente, convertendo overallLevel para o nível qualitativo", () => {
    const impact = computeImpact([], { overallLevel: "medium", availableSources: [], missingSources: [], staleSources: [], failedSources: [], sampleQuality: null, gaps: [], confidenceDrivers: [], confidenceReducers: [] }, 1, true);
    expect(impact.dataConfidence).toBe("media");
  });
});

describe("computePriority — regras em estágios, nunca uma pontuação arbitrária (Sprint 5.0, Z2)", () => {
  it("dois ou mais sinais fortes com confiança boa vira prioridade alta", () => {
    const impact = { financialImpact: "alto" as const, operationalImpact: "alto" as const, urgency: "alta" as const, dataConfidence: "alta" as const, directorsInvolved: 1 };
    expect(computePriority(impact)).toBe("alta");
  });

  it("confiança baixa nunca sozinha vira prioridade alta, mesmo com sinais fortes (seção Limitações do usuário)", () => {
    const impact = { financialImpact: "alto" as const, operationalImpact: "alto" as const, urgency: "alta" as const, dataConfidence: "baixa" as const, directorsInvolved: 1 };
    expect(computePriority(impact)).not.toBe("alta");
  });

  it("nenhum sinal forte e confiança baixa vira prioridade baixa", () => {
    const impact = { financialImpact: "indeterminado" as const, operationalImpact: "indeterminado" as const, urgency: "media" as const, dataConfidence: "baixa" as const, directorsInvolved: 1 };
    expect(computePriority(impact)).toBe("baixa");
  });

  it("quantidade de diretores envolvidos conta como um sinal forte (critério explícito do usuário)", () => {
    // Um único sinal (impacto financeiro médio, urgência média) não basta para "alta" sozinho.
    const umSoDiretor = { financialImpact: "alto" as const, operationalImpact: "indeterminado" as const, urgency: "media" as const, dataConfidence: "alta" as const, directorsInvolved: 1 };
    expect(computePriority(umSoDiretor)).toBe("media");
    // O mesmo cenário, mas com uma correlação envolvendo 2+ Diretores, soma um segundo sinal forte e vira "alta".
    const doisDiretores = { ...umSoDiretor, directorsInvolved: 2 };
    expect(computePriority(doisDiretores)).toBe("alta");
  });
});
