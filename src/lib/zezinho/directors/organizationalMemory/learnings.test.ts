import { describe, expect, it } from "vitest";
import {
  MIN_CONFIRMATIONS_FOR_APRENDIZADO,
  MIN_CONFIRMATIONS_FOR_CONHECIMENTO,
  MIN_DAYS_SPAN_FOR_APRENDIZADO,
  MIN_DAYS_SPAN_FOR_CONHECIMENTO,
  OBSERVATION_EXPIRY_DAYS,
  candidateSignalsFromReport,
  deriveSignalKey,
  expiryDateFrom,
  isExpired,
  nextStatus,
  recentLearnings,
} from "@/lib/zezinho/directors/organizationalMemory/learnings";
import { testReport } from "@/lib/zezinho/directors/testFixtures";
import type { Learning } from "@/lib/zezinho/directors/organizationalMemory/types";

function learning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: "1",
    directorId: "financeiro",
    signalKey: "gargalo-de-conversao",
    description: "gargalo de conversão",
    evidenceFactKeys: [],
    status: "observacao",
    confidenceLevel: "media",
    confirmationCount: 1,
    firstObservedAt: "2026-07-10T12:00:00.000Z",
    lastConfirmedAt: "2026-07-10T12:00:00.000Z",
    expiresAt: "2026-07-24T12:00:00.000Z",
    limitations: [],
    ...overrides,
  };
}

describe("deriveSignalKey — chave determinística, nunca correspondência fuzzy", () => {
  it("normaliza acentos, caixa e pontuação para o mesmo texto virar a mesma chave", () => {
    expect(deriveSignalKey("Gargalo de Conversão!")).toBe(deriveSignalKey("gargalo de conversao"));
  });

  it("textos diferentes viram chaves diferentes", () => {
    expect(deriveSignalKey("gargalo de conversão")).not.toBe(deriveSignalKey("problema de captura de leads"));
  });
});

describe("candidateSignalsFromReport — hipóteses do dia como candidatos, nunca um cálculo novo", () => {
  it("sem hipóteses, nenhum candidato", () => {
    expect(candidateSignalsFromReport(testReport())).toEqual([]);
  });

  it("cada hipótese vira um candidato com a mesma evidência/confiança/limitações", () => {
    const report = testReport({
      hypotheses: [{ description: "gargalo de conversão", evidenceFactKeys: ["goal_progress"], contraryEvidenceFactKeys: [], basis: ["financeiro"], confidenceScore: 60, confidenceLevel: "media", limitations: ["poucos fatos"] }],
    });
    expect(candidateSignalsFromReport(report)).toEqual([{ description: "gargalo de conversão", evidenceFactKeys: ["goal_progress"], confidenceLevel: "media", limitations: ["poucos fatos"] }]);
  });
});

describe("nextStatus — nunca promove sem evidência de recorrência real", () => {
  it("permanece observacao sem confirmações suficientes", () => {
    expect(nextStatus("observacao", MIN_CONFIRMATIONS_FOR_APRENDIZADO - 1, "2026-07-01T00:00:00.000Z", "2026-07-20T00:00:00.000Z")).toBe("observacao");
  });

  it("permanece observacao com confirmações suficientes mas sem período real (mesmo dia)", () => {
    expect(nextStatus("observacao", MIN_CONFIRMATIONS_FOR_APRENDIZADO + 2, "2026-07-01T00:00:00.000Z", "2026-07-01T01:00:00.000Z")).toBe("observacao");
  });

  it("promove observacao -> aprendizado quando confirmações E período mínimo são atingidos", () => {
    const first = "2026-07-01T00:00:00.000Z";
    const last = new Date(new Date(first).getTime() + MIN_DAYS_SPAN_FOR_APRENDIZADO * 86400000).toISOString();
    expect(nextStatus("observacao", MIN_CONFIRMATIONS_FOR_APRENDIZADO, first, last)).toBe("aprendizado");
  });

  it("promove aprendizado -> conhecimento quando confirmações E período mínimo são atingidos", () => {
    const first = "2026-06-01T00:00:00.000Z";
    const last = new Date(new Date(first).getTime() + MIN_DAYS_SPAN_FOR_CONHECIMENTO * 86400000).toISOString();
    expect(nextStatus("aprendizado", MIN_CONFIRMATIONS_FOR_CONHECIMENTO, first, last)).toBe("conhecimento");
  });

  it("aprendizado sem confirmações suficientes para conhecimento permanece aprendizado — nunca demove", () => {
    expect(nextStatus("aprendizado", 1, "2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z")).toBe("aprendizado");
  });

  it("conhecimento e descartado nunca mudam automaticamente", () => {
    expect(nextStatus("conhecimento", 100, "2026-01-01T00:00:00.000Z", "2026-07-24T00:00:00.000Z")).toBe("conhecimento");
    expect(nextStatus("descartado", 100, "2026-01-01T00:00:00.000Z", "2026-07-24T00:00:00.000Z")).toBe("descartado");
  });
});

describe("expiryDateFrom/isExpired — esquecimento explícito de observações não confirmadas", () => {
  it("expira exatamente OBSERVATION_EXPIRY_DAYS depois", () => {
    const observedAt = "2026-07-01T00:00:00.000Z";
    const expiry = expiryDateFrom(observedAt);
    const days = (new Date(expiry).getTime() - new Date(observedAt).getTime()) / 86400000;
    expect(days).toBe(OBSERVATION_EXPIRY_DAYS);
  });

  it("observação expirada é detectada", () => {
    const l = learning({ status: "observacao", expiresAt: "2026-07-01T00:00:00.000Z" });
    expect(isExpired(l, "2026-07-24T00:00:00.000Z")).toBe(true);
  });

  it("observação ainda dentro do prazo não é expirada", () => {
    const l = learning({ status: "observacao", expiresAt: "2026-08-01T00:00:00.000Z" });
    expect(isExpired(l, "2026-07-24T00:00:00.000Z")).toBe(false);
  });

  it("aprendizado/conhecimento nunca expiram por tempo, mesmo com expiresAt no passado", () => {
    const l = learning({ status: "aprendizado", expiresAt: "2020-01-01T00:00:00.000Z" });
    expect(isExpired(l, "2026-07-24T00:00:00.000Z")).toBe(false);
  });
});

describe("recentLearnings — 'o que aprendemos recentemente', nunca observações não confirmadas", () => {
  it("exclui observacao e descartado, mesmo dentro da janela", () => {
    const learnings = [learning({ status: "observacao", lastConfirmedAt: "2026-07-23T00:00:00.000Z" }), learning({ status: "descartado", lastConfirmedAt: "2026-07-23T00:00:00.000Z" })];
    expect(recentLearnings(learnings, "2026-07-20T00:00:00.000Z")).toEqual([]);
  });

  it("inclui aprendizado/conhecimento confirmados dentro da janela", () => {
    const l = learning({ status: "aprendizado", lastConfirmedAt: "2026-07-23T00:00:00.000Z" });
    expect(recentLearnings([l], "2026-07-20T00:00:00.000Z")).toEqual([l]);
  });

  it("exclui confirmações antigas fora da janela", () => {
    const l = learning({ status: "conhecimento", lastConfirmedAt: "2026-01-01T00:00:00.000Z" });
    expect(recentLearnings([l], "2026-07-20T00:00:00.000Z")).toEqual([]);
  });
});
