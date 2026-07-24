import { describe, expect, it } from "vitest";
import { buildHypotheses } from "@/lib/zezinho/directors/hypotheses";
import type { Diagnosis, Finding } from "@/lib/zezinho/reasoning/types";

describe("buildHypotheses — Hipóteses (Sprint 5.0, Z2, decisão do usuário)", () => {
  it("sem evidência suficiente (nenhum diagnóstico), devolve lista vazia — nunca inventa uma hipótese", () => {
    const diagnosis: Diagnosis = { mainHypothesis: null, alternativeHypotheses: [] };
    expect(buildHypotheses(diagnosis, [])).toEqual([]);
  });

  it("converte a hipótese principal com descrição, evidências, base legível e confiança", () => {
    const findings: Finding[] = [{ key: "f1", statement: "achado principal", factKeys: ["weather_current", "historical_pattern"], confidence: "alta" }];
    const diagnosis: Diagnosis = { mainHypothesis: { statement: "queda causada pela chuva", supportingFindingKeys: ["f1"], confidence: "alta" }, alternativeHypotheses: [] };
    const hypotheses = buildHypotheses(diagnosis, findings);
    expect(hypotheses).toHaveLength(1);
    expect(hypotheses[0].description).toBe("queda causada pela chuva");
    expect(hypotheses[0].evidenceFactKeys.sort()).toEqual(["historical_pattern", "weather_current"]);
    expect(hypotheses[0].basis.sort()).toEqual(["clima", "histórico"]);
    expect(hypotheses[0].confidenceLevel).toBe("alta");
    expect(hypotheses[0].confidenceScore).toBeGreaterThan(0);
  });

  it("hipótese baseada em poucos fatos declara a limitação explicitamente", () => {
    const findings: Finding[] = [{ key: "f1", statement: "achado isolado", factKeys: ["vehicles"], confidence: "baixa" }];
    const diagnosis: Diagnosis = { mainHypothesis: { statement: "hipótese fraca", supportingFindingKeys: ["f1"], confidence: "baixa" }, alternativeHypotheses: [] };
    const hypotheses = buildHypotheses(diagnosis, findings);
    expect(hypotheses[0].limitations.length).toBeGreaterThan(0);
  });

  it("inclui hipóteses alternativas além da principal, na ordem certa", () => {
    const findings: Finding[] = [
      { key: "f1", statement: "principal", factKeys: ["vehicles", "revenue"], confidence: "alta" },
      { key: "f2", statement: "alternativa", factKeys: ["avgTicket"], confidence: "media" },
    ];
    const diagnosis: Diagnosis = {
      mainHypothesis: { statement: "principal", supportingFindingKeys: ["f1"], confidence: "alta" },
      alternativeHypotheses: [{ statement: "alternativa", supportingFindingKeys: ["f2"], confidence: "media" }],
    };
    const hypotheses = buildHypotheses(diagnosis, findings);
    expect(hypotheses).toHaveLength(2);
    expect(hypotheses[0].description).toBe("principal");
    expect(hypotheses[1].description).toBe("alternativa");
  });

  it("chave de fato sem rótulo conhecido usa a própria chave como base — nunca lança", () => {
    const findings: Finding[] = [{ key: "f1", statement: "x", factKeys: ["chave_nova_desconhecida"], confidence: "media" }];
    const diagnosis: Diagnosis = { mainHypothesis: { statement: "x", supportingFindingKeys: ["f1"], confidence: "media" }, alternativeHypotheses: [] };
    const hypotheses = buildHypotheses(diagnosis, findings);
    expect(hypotheses[0].basis).toEqual(["chave_nova_desconhecida"]);
  });
});
