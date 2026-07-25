import { describe, expect, it } from "vitest";
import { computeIntegrationHealth } from "@/lib/integrations/stone/healthStatus";
import type { StoneImportRun } from "@/lib/integrations/stone/persistence/types";

const NOW = new Date("2026-07-24T12:00:00.000Z");

function run(overrides: Partial<StoneImportRun> = {}): StoneImportRun {
  return {
    id: "run-1",
    requestedPeriodFrom: "2026-06-24",
    requestedPeriodTo: "2026-07-24",
    referenceDate: "2026-07-23",
    layout: "XML2_4",
    fileHash: "abc",
    startedAt: "2026-07-24T10:00:00.000Z",
    finishedAt: "2026-07-24T10:00:05.000Z",
    status: "succeeded",
    recordCount: 5,
    errorSanitized: null,
    failureStatus: null,
    origin: "manual",
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:05.000Z",
    ...overrides,
  };
}

describe("computeIntegrationHealth — Sprint 7.0, Z4, 11 valores (decisão do usuário)", () => {
  it("not_configured quando a integração não está configurada, independente do histórico", () => {
    expect(computeIntegrationHealth(false, [run()], NOW)).toBe("not_configured");
  });

  it("credentials_pending quando configurada mas nunca houve nenhuma execução", () => {
    expect(computeIntegrationHealth(true, [], NOW)).toBe("credentials_pending");
  });

  it("syncing quando existe uma execução em andamento", () => {
    expect(computeIntegrationHealth(true, [run({ status: "running", recordCount: null, finishedAt: null })], NOW)).toBe("syncing");
  });

  it("access_pending quando a única falha é de permissão e nunca houve sucesso com dado real antes", () => {
    const runs = [run({ status: "failed", recordCount: null, failureStatus: "insufficient_permission", errorSanitized: "sem permissão" })];
    expect(computeIntegrationHealth(true, runs, NOW)).toBe("access_pending");
  });

  it("auth_error quando já teve dado real antes e agora falha por permissão (credencial revogada)", () => {
    const runs = [
      run({ id: "run-2", status: "failed", recordCount: null, failureStatus: "insufficient_permission", errorSanitized: "sem permissão", startedAt: "2026-07-24T11:00:00.000Z" }),
      run({ id: "run-1", status: "succeeded", recordCount: 10, startedAt: "2026-07-23T10:00:00.000Z" }),
    ];
    expect(computeIntegrationHealth(true, runs, NOW)).toBe("auth_error");
  });

  it("temporary_failure quando a última execução falhou por motivo não relacionado a permissão", () => {
    const runs = [run({ status: "failed", recordCount: null, failureStatus: "temporary_failure", errorSanitized: "timeout" })];
    expect(computeIntegrationHealth(true, runs, NOW)).toBe("temporary_failure");
  });

  it("no_data quando a última execução teve sucesso mas sem nenhum registro, e nunca houve dado real", () => {
    const runs = [run({ recordCount: 0 })];
    expect(computeIntegrationHealth(true, runs, NOW)).toBe("no_data");
  });

  it("connected quando a última execução não trouxe registro, mas já houve dado real recentemente", () => {
    const runs = [
      run({ id: "run-2", recordCount: 0, startedAt: "2026-07-24T11:00:00.000Z", finishedAt: "2026-07-24T11:00:05.000Z" }),
      run({ id: "run-1", recordCount: 10, startedAt: "2026-07-23T10:00:00.000Z", finishedAt: "2026-07-23T10:00:05.000Z" }),
    ];
    expect(computeIntegrationHealth(true, runs, NOW)).toBe("connected");
  });

  it("stale_data quando o último dado real é mais antigo que o limite de tolerância (48h)", () => {
    const runs = [
      run({ id: "run-2", recordCount: 0, startedAt: "2026-07-24T11:00:00.000Z", finishedAt: "2026-07-24T11:00:05.000Z" }),
      run({ id: "run-1", recordCount: 10, startedAt: "2026-07-20T10:00:00.000Z", finishedAt: "2026-07-20T10:00:05.000Z" }),
    ];
    expect(computeIntegrationHealth(true, runs, NOW)).toBe("stale_data");
  });

  it("healthy quando a última execução trouxe dado real e nenhuma execução recente falhou", () => {
    expect(computeIntegrationHealth(true, [run({ recordCount: 8 })], NOW)).toBe("healthy");
  });

  it("degraded quando a última execução trouxe dado real mas há falhas recentes na janela", () => {
    const runs = [
      run({ id: "run-2", recordCount: 8, startedAt: "2026-07-24T11:00:00.000Z" }),
      run({ id: "run-1", status: "failed", recordCount: null, failureStatus: "temporary_failure", startedAt: "2026-07-23T10:00:00.000Z" }),
    ];
    expect(computeIntegrationHealth(true, runs, NOW)).toBe("degraded");
  });

  it("nunca lança para histórico vazio nem para runs com finishedAt nulo", () => {
    expect(() => computeIntegrationHealth(true, [], NOW)).not.toThrow();
    expect(() => computeIntegrationHealth(true, [run({ finishedAt: null })], NOW)).not.toThrow();
  });
});
