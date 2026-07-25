import { describe, expect, it } from "vitest";
import { computeSyncStatus } from "@/lib/integrations/stone/syncStatus";
import type { StoneFailureCategory, StoneFailureStage } from "@/lib/integrations/stone/failureClassification";
import type { StoneImportRun, StoneImportRunStatus } from "@/lib/integrations/stone/persistence/types";

let seq = 0;

function run(overrides: Partial<StoneImportRun> = {}): StoneImportRun {
  seq += 1;
  return {
    id: `run-${seq}`,
    requestedPeriodFrom: "2026-06-25",
    requestedPeriodTo: "2026-07-25",
    referenceDate: `2026-07-${String((seq % 28) + 1).padStart(2, "0")}`,
    layout: "XML2_4",
    fileHash: "hash",
    startedAt: "2026-07-25T10:00:00.000Z",
    finishedAt: "2026-07-25T10:00:05.000Z",
    status: "succeeded",
    recordCount: 10,
    errorSanitized: null,
    failureStatus: null,
    failureStage: null,
    failureCategory: null,
    upstreamStatus: null,
    responseContentType: null,
    attemptCount: null,
    elapsedMs: null,
    sanitizedHost: null,
    sanitizedPath: null,
    occurredAt: null,
    origin: "manual",
    createdAt: "2026-07-25T10:00:00.000Z",
    updatedAt: "2026-07-25T10:00:05.000Z",
    ...overrides,
  };
}

function succeededDay(referenceDate: string, recordCount: number): StoneImportRun {
  return run({ referenceDate, status: "succeeded", recordCount, failureCategory: null });
}

function alertDay(referenceDate: string, category: StoneFailureCategory = "file_not_published_yet"): StoneImportRun {
  return run({ referenceDate, status: "succeeded", recordCount: 0, failureCategory: category, failureStage: "file_request" as StoneFailureStage });
}

function failedDay(referenceDate: string, category: StoneFailureCategory, status: StoneImportRunStatus = "failed"): StoneImportRun {
  return run({ referenceDate, status, recordCount: null, failureCategory: category, failureStage: "file_request" as StoneFailureStage, errorSanitized: "erro sanitizado" });
}

describe("computeSyncStatus — Sprint 7.1, Etapa 5, 5 estados visuais", () => {
  it("nenhuma execução ainda → 'Aguardando primeira sincronização'", () => {
    const report = computeSyncStatus([]);
    expect(report.status).toBe("awaiting_first_sync");
    expect(report.label).toBe("Aguardando primeira sincronização");
    expect(report.daysTotal).toBe(0);
  });

  it("todos os dias com sucesso real, nenhum alerta → 'Sincronização concluída'", () => {
    const runs = Array.from({ length: 31 }, (_, i) => succeededDay(`2026-07-${String(i + 1).padStart(2, "0")}`, 10));
    const report = computeSyncStatus(runs);
    expect(report.status).toBe("completed");
    expect(report.label).toBe("Sincronização concluída");
    expect(report.daysSucceeded).toBe(31);
    expect(report.daysWithAlert).toBe(0);
    expect(report.daysWithFailure).toBe(0);
  });

  it("30 dias com sucesso + 1 dia com arquivo ainda não publicado → 'Sincronização concluída com alertas' (caso real de produção)", () => {
    const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 5, 25 + i)).toISOString().slice(0, 10));
    const runs = [...dates.map((d) => succeededDay(d, 13)), alertDay("2026-07-25", "file_not_published_yet")];
    const report = computeSyncStatus(runs);
    expect(report.status).toBe("completed_with_alerts");
    expect(report.label).toBe("Sincronização concluída com alertas");
    expect(report.daysSucceeded).toBe(30);
    expect(report.daysWithAlert).toBe(1);
    expect(report.daysWithFailure).toBe(0);
    expect(report.lastRealDataDate).toBe("2026-07-24");
    expect(report.alertReason).toBe("Arquivo do dia ainda não publicado pela Stone.");
    expect(report.reprocessableDates).toEqual(["2026-07-25"]);
  });

  it("maioria com sucesso + uma falha de rede recuperável isolada → 'Sincronização concluída com alertas', nunca 'Falha temporária'", () => {
    const runs = [...Array.from({ length: 20 }, (_, i) => succeededDay(`2026-07-${String(i + 1).padStart(2, "0")}`, 5)), failedDay("2026-07-21", "temporary_network_failure")];
    const report = computeSyncStatus(runs);
    expect(report.status).toBe("completed_with_alerts");
  });

  it("todos os 31 dias falharam por causa de rede/técnica, zero sucesso → 'Falha temporária'", () => {
    const runs = Array.from({ length: 31 }, (_, i) => failedDay(`2026-07-${String(i + 1).padStart(2, "0")}`, "temporary_network_failure"));
    const report = computeSyncStatus(runs);
    expect(report.status).toBe("temporary_failure");
    expect(report.label).toBe("Falha temporária");
    expect(report.daysSucceeded).toBe(0);
    expect(report.failureReason).toBe("Não foi possível consultar a Stone agora — falha temporária de rede.");
  });

  it("credencial inválida (401) em qualquer dia → 'Ação necessária', mesmo com outros dias com sucesso", () => {
    const runs = [...Array.from({ length: 10 }, (_, i) => succeededDay(`2026-07-${String(i + 1).padStart(2, "0")}`, 5)), failedDay("2026-07-11", "authentication_failure")];
    const report = computeSyncStatus(runs);
    expect(report.status).toBe("action_required");
    expect(report.label).toBe("Ação necessária");
  });

  it("sem permissão (403) → 'Ação necessária'", () => {
    const runs = [failedDay("2026-07-11", "insufficient_permission")];
    const report = computeSyncStatus(runs);
    expect(report.status).toBe("action_required");
  });

  it("todos os dias são apenas alerta (sem sucesso real, sem falha técnica) → 'Sincronização concluída com alertas', nunca 'Falha temporária'", () => {
    const runs = [alertDay("2026-07-25", "no_data_expected")];
    const report = computeSyncStatus(runs);
    expect(report.status).toBe("completed_with_alerts");
  });

  it("transactionsUpdated soma apenas os dias com sucesso real, nunca dias de alerta ou falha", () => {
    const runs = [succeededDay("2026-07-01", 100), succeededDay("2026-07-02", 50), alertDay("2026-07-03"), failedDay("2026-07-04", "temporary_network_failure")];
    const report = computeSyncStatus(runs);
    expect(report.transactionsUpdated).toBe(150);
  });

  it("reprocessableDates inclui dias de alerta, credencial e falha técnica, ordenados", () => {
    const runs = [succeededDay("2026-07-01", 5), alertDay("2026-07-03"), failedDay("2026-07-02", "temporary_network_failure")];
    const report = computeSyncStatus(runs);
    expect(report.reprocessableDates).toEqual(["2026-07-02", "2026-07-03"]);
  });
});
