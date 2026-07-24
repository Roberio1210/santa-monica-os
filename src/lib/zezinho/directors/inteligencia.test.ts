import { describe, expect, it } from "vitest";
import { deriveCorrelations } from "@/lib/zezinho/directors/inteligencia";
import { testFact as fact, testReport as report } from "@/lib/zezinho/directors/testFixtures";

describe("deriveCorrelations — Diretor de Inteligência (Sprint 5.0, Z1)", () => {
  it("clima × movimento: só correlaciona quando AMBOS os diretores têm o risco real, nunca com um só", () => {
    const inteligencia = report({ director: "inteligencia", risks: [{ statement: "chuva prevista", evidenceFactKeys: ["weather_current"] }] });
    const operacoesSemRisco = report({ director: "operacoes" });
    expect(deriveCorrelations([inteligencia, operacoesSemRisco])).toEqual([]);

    const operacoesComRisco = report({ director: "operacoes", risks: [{ statement: "movimento abaixo do histórico", evidenceFactKeys: ["historical_pattern", "vehicles"] }] });
    const correlations = deriveCorrelations([inteligencia, operacoesComRisco]);
    expect(correlations).toHaveLength(1);
    expect(correlations[0].directors).toEqual(["inteligencia", "operacoes"]);
    expect(correlations[0].confidence).toBe("media");
  });

  it("CRM × ticket médio: confiança baixa por ser um único período, nunca inflada", () => {
    const comercial = report({ director: "comercial", opportunities: [{ statement: "clientes em risco", evidenceFactKeys: ["crm_at_risk_count"] }] });
    const operacoes = report({ director: "operacoes", facts: [fact({ key: "avgTicket", direction: "queda" })] });
    const correlations = deriveCorrelations([comercial, operacoes]);
    expect(correlations).toHaveLength(1);
    expect(correlations[0].confidence).toBe("baixa");
  });

  it("nunca correlaciona ticket médio em alta com clientes em risco — direção precisa ser queda", () => {
    const comercial = report({ director: "comercial", opportunities: [{ statement: "clientes em risco", evidenceFactKeys: ["crm_at_risk_count"] }] });
    const operacoes = report({ director: "operacoes", facts: [fact({ key: "avgTicket", direction: "aumento" })] });
    expect(deriveCorrelations([comercial, operacoes])).toEqual([]);
  });

  it("sem nenhum diretor relevante presente, nunca lança e devolve lista vazia", () => {
    expect(deriveCorrelations([])).toEqual([]);
  });

  it("toda correlação carrega evidenceFactKeys de pelo menos dois diretores diferentes", () => {
    const inteligencia = report({ director: "inteligencia", risks: [{ statement: "chuva prevista", evidenceFactKeys: ["weather_current"] }] });
    const operacoes = report({ director: "operacoes", risks: [{ statement: "movimento abaixo do histórico", evidenceFactKeys: ["historical_pattern", "vehicles"] }] });
    const correlations = deriveCorrelations([inteligencia, operacoes]);
    expect(correlations[0].evidenceFactKeys.length).toBeGreaterThanOrEqual(2);
    expect(correlations[0].directors.length).toBeGreaterThanOrEqual(2);
  });
});
