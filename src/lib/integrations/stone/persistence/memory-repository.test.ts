import { describe, expect, it } from "vitest";
import { StoneMemoryRepository } from "@/lib/integrations/stone/persistence/memory-repository";
import type { StoneDivergenceRecord, StoneNormalizedTransactionRecord, StoneReconciliationResultRecord } from "@/lib/integrations/stone/persistence/types";

function transaction(overrides: Partial<StoneNormalizedTransactionRecord> = {}): StoneNormalizedTransactionRecord {
  return {
    externalKey: "key-1",
    acquirerTransactionKey: "NSU-1",
    authorizationCode: "AUTH1",
    initiatorTransactionKey: "INIT-1",
    establishmentCode: "900000001",
    terminalSerialNumber: "TERM-1",
    capturedAt: "2026-07-24T10:00:00.000Z",
    installmentNumber: 1,
    grossAmount: 100,
    feeAmount: 3,
    netAmount: 97,
    paymentMethod: "credito",
    brandId: "1",
    eventType: "sale",
    receivableState: "scheduled",
    expectedPaymentDate: "2026-07-25",
    settledPaymentDate: null,
    settledAmount: null,
    sourceFile: "900000001-20260724-XML2_4-without_reversals.xml",
    importRunId: null,
    ...overrides,
  };
}

function reconciliationResult(overrides: Partial<StoneReconciliationResultRecord> = {}): StoneReconciliationResultRecord {
  return {
    naturalKey: "exact_match:NSU-1:ORDER-1",
    stoneSaleExternalKey: "NSU-1",
    jumpparkOrderExternalId: "ORDER-1",
    matchType: "exact_match",
    confidence: "high",
    heuristicScore: 100,
    favorableSignals: ["valor compatível"],
    contrarySignals: [],
    ruleApplied: "identificador forte",
    periodFrom: "2026-07-01",
    periodTo: "2026-07-24",
    ...overrides,
  };
}

function divergence(overrides: Partial<StoneDivergenceRecord> = {}): StoneDivergenceRecord {
  return {
    naturalKey: "diferenca_de_valor:NSU-1:ORDER-1",
    type: "diferenca_de_valor",
    priority: "alta",
    financialImpact: 10,
    evidence: ["valor Stone diferente do JumpPark"],
    involvedStoneSaleExternalKey: "NSU-1",
    involvedJumpparkOrderExternalId: "ORDER-1",
    confidence: "medium",
    recommendation: "conferir manualmente",
    periodFrom: "2026-07-01",
    periodTo: "2026-07-24",
    ...overrides,
  };
}

describe("StoneMemoryRepository — import runs (Sprint 7.0, Z4)", () => {
  it("startImportRun cria uma execução nova com status 'running'", async () => {
    const repo = new StoneMemoryRepository();
    const run = await repo.startImportRun({ referenceDate: "2026-07-24", layout: "XML2_4", requestedPeriodFrom: "2026-07-01", requestedPeriodTo: "2026-07-24", origin: "manual" });
    expect(run.status).toBe("running");
    expect(run.referenceDate).toBe("2026-07-24");
  });

  it("reprocessar o mesmo dia (mesma referenceDate+layout) nunca cria uma segunda execução — idempotente", async () => {
    const repo = new StoneMemoryRepository();
    const first = await repo.startImportRun({ referenceDate: "2026-07-24", layout: "XML2_4", requestedPeriodFrom: null, requestedPeriodTo: null, origin: "manual" });
    await repo.finishImportRun({ id: first.id, status: "succeeded", recordCount: 5, errorSanitized: null, failureStatus: null, fileHash: "hash-1", failureDiagnostics: null });

    const second = await repo.startImportRun({ referenceDate: "2026-07-24", layout: "XML2_4", requestedPeriodFrom: null, requestedPeriodTo: null, origin: "manual_reprocess" });
    expect(second.id).toBe(first.id);

    const all = await repo.listImportRuns(10);
    expect(all).toHaveLength(1);
  });

  it("mesma referenceDate com layout diferente é uma execução distinta", async () => {
    const repo = new StoneMemoryRepository();
    await repo.startImportRun({ referenceDate: "2026-07-24", layout: "XML2_4", requestedPeriodFrom: null, requestedPeriodTo: null, origin: "manual" });
    await repo.startImportRun({ referenceDate: "2026-07-24", layout: "XML2_2", requestedPeriodFrom: null, requestedPeriodTo: null, origin: "manual" });
    expect(await repo.listImportRuns(10)).toHaveLength(2);
  });

  it("getLatestSucceededImportRun ignora execuções falhadas ou em andamento", async () => {
    const repo = new StoneMemoryRepository();
    const failed = await repo.startImportRun({ referenceDate: "2026-07-23", layout: "XML2_4", requestedPeriodFrom: null, requestedPeriodTo: null, origin: "manual" });
    await repo.finishImportRun({ id: failed.id, status: "failed", recordCount: null, errorSanitized: "erro", failureStatus: "temporary_failure", fileHash: null, failureDiagnostics: null });
    const succeeded = await repo.startImportRun({ referenceDate: "2026-07-24", layout: "XML2_4", requestedPeriodFrom: null, requestedPeriodTo: null, origin: "manual" });
    await repo.finishImportRun({ id: succeeded.id, status: "succeeded", recordCount: 5, errorSanitized: null, failureStatus: null, fileHash: "hash", failureDiagnostics: null });

    const latest = await repo.getLatestSucceededImportRun();
    expect(latest?.id).toBe(succeeded.id);
  });
});

describe("StoneMemoryRepository — transações normalizadas (Sprint 7.0, Z4)", () => {
  it("upsertNormalizedTransactions por externalKey nunca duplica ao reprocessar", async () => {
    const repo = new StoneMemoryRepository();
    await repo.upsertNormalizedTransactions([transaction()]);
    await repo.upsertNormalizedTransactions([transaction({ receivableState: "settled_on_time", settledPaymentDate: "2026-07-25", settledAmount: 97 })]);

    const rows = await repo.listNormalizedTransactionsByExpectedDateRange("2026-07-01", "2026-12-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].receivableState).toBe("settled_on_time");
  });

  it("filtra por intervalo de data prevista, nunca traz parcela fora da janela", async () => {
    const repo = new StoneMemoryRepository();
    await repo.upsertNormalizedTransactions([transaction({ externalKey: "a", expectedPaymentDate: "2026-01-01" }), transaction({ externalKey: "b", expectedPaymentDate: "2026-07-25" })]);
    const rows = await repo.listNormalizedTransactionsByExpectedDateRange("2026-07-01", "2026-07-31");
    expect(rows.map((r) => r.externalKey)).toEqual(["b"]);
  });
});

describe("StoneMemoryRepository — resultados de conciliação (Sprint 7.0, Z4)", () => {
  it("upsertReconciliationResults por naturalKey nunca duplica ao reprocessar o mesmo período", async () => {
    const repo = new StoneMemoryRepository();
    await repo.upsertReconciliationResults([reconciliationResult()]);
    await repo.upsertReconciliationResults([reconciliationResult({ heuristicScore: 95 })]);

    const rows = await repo.listReconciliationResults("2026-07-01", "2026-07-24");
    expect(rows).toHaveLength(1);
    expect(rows[0].heuristicScore).toBe(95);
  });

  it("reprocessar nunca reseta a revisão manual já feita (reviewStatus preservado)", async () => {
    const repo = new StoneMemoryRepository();
    await repo.upsertReconciliationResults([reconciliationResult()]);
    const [row] = await repo.listReconciliationResults("2026-07-01", "2026-07-24");
    await repo.updateReconciliationReviewStatus(row.id, "confirmed_issue");

    await repo.upsertReconciliationResults([reconciliationResult({ heuristicScore: 90 })]);
    const [updated] = await repo.listReconciliationResults("2026-07-01", "2026-07-24");
    expect(updated.reviewStatus).toBe("confirmed_issue");
    expect(updated.heuristicScore).toBe(90);
  });
});

describe("StoneMemoryRepository — divergências (Sprint 7.0, Z4)", () => {
  it("upsertDivergences por naturalKey nunca duplica ao reprocessar", async () => {
    const repo = new StoneMemoryRepository();
    await repo.upsertDivergences([divergence()]);
    await repo.upsertDivergences([divergence({ financialImpact: 15 })]);

    const rows = await repo.listDivergences();
    expect(rows).toHaveLength(1);
    expect(rows[0].financialImpact).toBe(15);
  });

  it("reprocessar nunca sobrescreve status/assignee/resolutionNote de uma divergência já revisada — preserva auditoria", async () => {
    const repo = new StoneMemoryRepository();
    await repo.upsertDivergences([divergence()]);
    const [row] = await repo.listDivergences();
    await repo.updateDivergenceReview({ id: row.id, status: "resolved", assignee: "Financeiro", resolutionNote: "Confirmado com o cliente." });

    await repo.upsertDivergences([divergence({ financialImpact: 20, evidence: ["nova evidência"] })]);
    const [updated] = await repo.listDivergences();
    expect(updated.status).toBe("resolved");
    expect(updated.assignee).toBe("Financeiro");
    expect(updated.resolutionNote).toBe("Confirmado com o cliente.");
    expect(updated.financialImpact).toBe(20);
    expect(updated.evidence).toEqual(["nova evidência"]);
  });

  it("nova divergência sempre nasce com status 'open' — nunca pula direto para um estado resolvido", async () => {
    const repo = new StoneMemoryRepository();
    await repo.upsertDivergences([divergence()]);
    const [row] = await repo.listDivergences();
    expect(row.status).toBe("open");
  });

  it("filtra divergências por status quando solicitado", async () => {
    const repo = new StoneMemoryRepository();
    await repo.upsertDivergences([divergence(), divergence({ naturalKey: "outra", involvedStoneSaleExternalKey: "NSU-2" })]);
    const [row] = await repo.listDivergences();
    await repo.updateDivergenceReview({ id: row.id, status: "resolved" });

    const open = await repo.listDivergences({ status: "open" });
    const resolved = await repo.listDivergences({ status: "resolved" });
    expect(open).toHaveLength(1);
    expect(resolved).toHaveLength(1);
  });

  it("resolvedAt só é preenchido quando o status vira 'resolved'", async () => {
    const repo = new StoneMemoryRepository();
    await repo.upsertDivergences([divergence()]);
    const [row] = await repo.listDivergences();
    expect(row.resolvedAt).toBeNull();

    const underReview = await repo.updateDivergenceReview({ id: row.id, status: "under_review" });
    expect(underReview.resolvedAt).toBeNull();

    const resolved = await repo.updateDivergenceReview({ id: row.id, status: "resolved" });
    expect(resolved.resolvedAt).not.toBeNull();
  });
});
