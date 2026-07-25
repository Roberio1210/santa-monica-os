import { describe, expect, it } from "vitest";
import { deriveDivergencesFromConciliationDays, deriveDivergencesFromDayFetchResults, deriveDivergencesFromReconciliation } from "@/lib/integrations/stone/divergences";
import type { ReconciliationResult } from "@/lib/integrations/stone/jumpparkReconciliation";
import type { DayFetchResult } from "@/lib/integrations/stone/multiDay";
import type { NormalizedConciliation } from "@/lib/integrations/stone/normalize";

function reconciliationResult(overrides: Partial<ReconciliationResult> = {}): ReconciliationResult {
  return {
    type: "unmatched_stone",
    confidence: "low",
    heuristicScore: 0,
    favorableSignals: [],
    contrarySignals: ["nenhum pedido JumpPark correspondente"],
    limitations: [],
    ruleApplied: "teste",
    comparedFields: [],
    jumpparkOrder: null,
    stoneSale: { externalReference: "NSU-1", amount: 100, occurredAt: "2026-07-24T10:00:00", paymentMethod: "credito" },
    ...overrides,
  };
}

function conciliation(overrides: Partial<NormalizedConciliation> = {}): NormalizedConciliation {
  return {
    referenceDate: "2026-07-24",
    generationDateTime: "2026-07-25T05:30:00",
    establishmentCode: "900000001",
    layout: "XML2_4",
    sales: [],
    chargebacks: [],
    chargebackRefunds: [],
    expectedPayments: [],
    realizedPayments: [],
    advances: [],
    settlements: [],
    financialPositions: [],
    terminalSerialNumbers: [],
    ...overrides,
  };
}

describe("deriveDivergencesFromReconciliation — Sprint 7.0, Z3, decisão do usuário", () => {
  it("gera uma divergência por resultado problemático, com prioridade/evidência/recomendação/status inicial", () => {
    const divergences = deriveDivergencesFromReconciliation([reconciliationResult()]);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({ type: "transacao_stone_nao_encontrada_no_jumppark", status: "identificado", priority: "media" });
    expect(divergences[0].reviewRecommendation.length).toBeGreaterThan(0);
    expect(divergences[0].evidence.length).toBeGreaterThan(0);
  });

  it("exact_match, probable_match, date_mismatch e pending_processing nunca geram divergência", () => {
    const results: ReconciliationResult[] = [
      reconciliationResult({ type: "exact_match" }),
      reconciliationResult({ type: "probable_match" }),
      reconciliationResult({ type: "date_mismatch" }),
      reconciliationResult({ type: "pending_processing" }),
    ];
    expect(deriveDivergencesFromReconciliation(results)).toEqual([]);
  });

  it("nunca cria conta, lançamento ou correção — a divergência é só um registro de conferência, status sempre 'identificado'", () => {
    const divergences = deriveDivergencesFromReconciliation([reconciliationResult({ type: "value_mismatch" })]);
    expect(divergences[0].status).toBe("identificado");
  });

  it("duplicidade e diferença de valor nascem com prioridade alta — risco financeiro real", () => {
    const divergences = deriveDivergencesFromReconciliation([reconciliationResult({ type: "duplicate" }), reconciliationResult({ type: "value_mismatch" })]);
    expect(divergences.every((d) => d.priority === "alta")).toBe(true);
  });
});

describe("deriveDivergencesFromConciliationDays — chargebacks e estornos, independente do JumpPark", () => {
  it("chargeback vira divergência de prioridade alta, com evidência rastreável", () => {
    const day = conciliation({ chargebacks: [{ id: "CB-1", saleExternalReference: "NSU-X", installmentNumber: 2, amount: 97, occurredAt: "2026-07-25" }] });
    const divergences = deriveDivergencesFromConciliationDays([day]);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({ type: "chargeback", priority: "alta", financialImpact: 97 });
  });

  it("estorno de chargeback vira divergência distinta de chargeback", () => {
    const day = conciliation({ chargebackRefunds: [{ id: "CBR-1", saleExternalReference: "NSU-Y", installmentNumber: 3, amount: 50, occurredAt: "2026-07-28" }] });
    const divergences = deriveDivergencesFromConciliationDays([day]);
    expect(divergences[0].type).toBe("estorno");
  });

  it("sem chargeback/estorno no período, nenhuma divergência é criada", () => {
    expect(deriveDivergencesFromConciliationDays([conciliation()])).toEqual([]);
  });
});

describe("deriveDivergencesFromDayFetchResults — arquivo ausente/defasado, nunca silenciado", () => {
  it("dia com status diferente de ok vira divergência de baixa confiança, alta visibilidade", () => {
    const results: DayFetchResult[] = [{ referenceDate: "2026-07-20", status: "no_data", normalized: null, error: "arquivo ainda não disponível", limitations: [] }];
    const divergences = deriveDivergencesFromDayFetchResults(results);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({ type: "arquivo_stone_ausente_ou_defasado", confidence: "low" });
  });

  it("dias com status ok nunca viram divergência", () => {
    const results: DayFetchResult[] = [{ referenceDate: "2026-07-20", status: "ok", normalized: null, error: null, limitations: [] }];
    expect(deriveDivergencesFromDayFetchResults(results)).toEqual([]);
  });
});
