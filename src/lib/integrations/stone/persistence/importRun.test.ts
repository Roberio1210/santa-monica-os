import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoneCache } from "@/lib/integrations/stone/cache";
import { OFFICIAL_SAMPLE_XML } from "@/lib/integrations/stone/__fixtures__/official-sample";
import { syncStonePeriod, sumPrepaymentEvents } from "@/lib/integrations/stone/persistence/importRun";
import type { StoneFinancialEvent } from "@/lib/integrations/stone/types";
import { getStonePersistenceRepository, resetStonePersistenceRepositoryForTests } from "@/lib/integrations/stone/persistence/repository-factory";

const ORIGINAL_ENV = { ...process.env };

function gzipResponse(status: number, xml: string) {
  const gzipped = gzipSync(Buffer.from(xml, "utf-8"));
  return { ok: status >= 200 && status < 300, status, statusText: String(status), url: "https://conciliation.stone.com.br/mock", redirected: false, headers: { get: () => "application/gzip" }, arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) };
}

function badRequestResponse(body: string) {
  return {
    ok: false,
    status: 400,
    statusText: "400",
    url: "https://conciliation.stone.com.br/mock",
    redirected: false,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    arrayBuffer: async () => Buffer.from(body, "utf-8"),
  };
}

describe("syncStonePeriod — Sprint 7.0, Z4, pipeline de importação real e idempotente", () => {
  beforeEach(() => {
    clearStoneCache();
    resetStonePersistenceRepositoryForTests();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.JUMPPARK_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("sem credenciais Stone, devolve not_configured honestamente, nunca lança", async () => {
    delete process.env.STONE_API_KEY;
    delete process.env.STONE_ACCOUNT_ID;
    const result = await syncStonePeriod({ fromDate: "2026-07-24", toDate: "2026-07-24", origin: "manual" });
    expect(result.status).toBe("not_configured");
    expect(result.days).toEqual([]);
  });

  it("importação bem-sucedida persiste transações e cria uma execução por dia", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));

    const result = await syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual" });
    expect(result.status).toBe("ok");
    expect(result.days).toHaveLength(1);
    expect(result.days[0].status).toBe("succeeded");
    expect(result.transactionsPersisted).toBeGreaterThan(0);

    const runs = await getStonePersistenceRepository().listImportRuns(10);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("succeeded");
    expect(runs[0].fileHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reprocessar o mesmo dia nunca duplica a execução nem as transações — idempotente", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));

    const first = await syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual" });
    const second = await syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual_reprocess" });

    expect(first.transactionsPersisted).toBe(second.transactionsPersisted);
    const runs = await getStonePersistenceRepository().listImportRuns(10);
    expect(runs).toHaveLength(1);

    const transactions = await getStonePersistenceRepository().listNormalizedTransactionsByExpectedDateRange("2020-01-01", "2030-01-01");
    const uniqueKeys = new Set(transactions.map((t) => t.externalKey));
    expect(uniqueKeys.size).toBe(transactions.length);
  });

  it("dia obtido após retry (429 seguido de sucesso) persiste normalmente e reprocessar depois continua idempotente", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    const fetchMock = vi.fn().mockResolvedValueOnce(gzipResponse(429, OFFICIAL_SAMPLE_XML)).mockResolvedValueOnce(gzipResponse(200, OFFICIAL_SAMPLE_XML));
    vi.stubGlobal("fetch", fetchMock);

    const first = await syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual" });
    expect(first.days[0].status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    clearStoneCache();
    fetchMock.mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML));
    const second = await syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual_reprocess" });

    expect(first.transactionsPersisted).toBe(second.transactionsPersisted);
    const runs = await getStonePersistenceRepository().listImportRuns(10);
    expect(runs).toHaveLength(1);
  });

  it("importação concorrente do mesmo dia (chamadas sobrepostas) nunca duplica a execução", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));

    await Promise.all([
      syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual" }),
      syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual" }),
    ]);

    const runs = await getStonePersistenceRepository().listImportRuns(10);
    expect(runs).toHaveLength(1);
  });

  it("dia sem arquivo publicado ainda (no_data) conclui como sucesso, com zero registros — nunca um erro", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: "404", headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }));

    const result = await syncStonePeriod({ fromDate: "2026-07-24", toDate: "2026-07-24", origin: "manual" });
    expect(result.status).toBe("ok");
    expect(result.days[0].status).toBe("succeeded");
    expect(result.days[0].recordCount).toBe(0);
  });

  it("falha real (500) marca a execução como failed com o status estruturado, sem derrubar o processo", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "500", headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }));

    const result = await syncStonePeriod({ fromDate: "2026-07-24", toDate: "2026-07-24", origin: "manual" });
    expect(result.status).toBe("no_data");
    expect(result.days[0].status).toBe("failed");

    const runs = await getStonePersistenceRepository().listImportRuns(10);
    expect(runs[0].failureStatus).toBe("temporary_failure");
  });

  it("HTTP 400 com corpo indicando data inválida (Sprint 7.2) é classificado pela evidência real, nunca retryable, e reprocessar depois continua idempotente", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    const fetchMock = vi.fn().mockResolvedValue(badRequestResponse(JSON.stringify({ message: "Reference date is invalid." })));
    vi.stubGlobal("fetch", fetchMock);

    const first = await syncStonePeriod({ fromDate: "2026-07-25", toDate: "2026-07-25", origin: "manual" });
    expect(first.days[0].status).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(1); // HTTP 400 nunca é retryable

    const firstRun = await getStonePersistenceRepository().getImportRun("2026-07-25", "XML2_4");
    expect(firstRun?.failureCategory).toBe("invalid_reference_date");

    const second = await syncStonePeriod({ fromDate: "2026-07-25", toDate: "2026-07-25", origin: "manual_reprocess" });
    expect(second.days[0].status).toBe("failed");

    const runs = await getStonePersistenceRepository().listImportRuns(10);
    expect(runs).toHaveLength(1); // reprocessar nunca duplica a execução
  });

  it("período com dias mistos (sucesso e falha) reporta status 'partial'", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        call += 1;
        return call === 1 ? gzipResponse(200, OFFICIAL_SAMPLE_XML) : { ok: false, status: 500, statusText: "500", headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
      }),
    );

    const result = await syncStonePeriod({ fromDate: "2026-07-21", toDate: "2026-07-22", origin: "manual" });
    expect(result.status).toBe("partial");
  });

  it("JumpPark indisponível não impede a persistência das transações Stone, só a conciliação", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));

    const result = await syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual" });
    expect(result.transactionsPersisted).toBeGreaterThan(0);
    expect(result.reconciliationResultsPersisted).toBe(0);
    expect(result.divergencesPersisted).toBe(0);
  });

  it("valores monetários persistidos são cents-safe — nunca float impreciso", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));

    await syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual" });
    const transactions = await getStonePersistenceRepository().listNormalizedTransactionsByExpectedDateRange("2020-01-01", "2030-01-01");
    for (const t of transactions) {
      expect(Number.isFinite(t.grossAmount)).toBe(true);
      expect(Math.round(t.grossAmount * 100)).toBe(t.grossAmount * 100);
    }
  });

  it("Missão V6.2 (Fase 6) — dia sem evento PrepaymentFee/PrepaymentDisbursement (amostra oficial só tem type=10 Charge) persiste null, nunca 0 fabricado", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));

    await syncStonePeriod({ fromDate: "2026-07-22", toDate: "2026-07-22", origin: "manual" });
    const run = await getStonePersistenceRepository().getImportRun("2026-07-22", "XML2_4");
    expect(run?.prepaymentFeeAmount).toBeNull();
    expect(run?.prepaymentDisbursementAmount).toBeNull();
  });
});

function financialEvent(overrides: Partial<StoneFinancialEvent> = {}): StoneFinancialEvent {
  return { eventId: "EVT-1", description: "Evento", type: 10, previsionPaymentDate: null, amount: 100, linkedMerchant: null, ...overrides };
}

describe("sumPrepaymentEvents — Missão V6.2 (Fase 6)", () => {
  it("soma eventos tipo 20 (PrepaymentFee) e tipo 17 (PrepaymentDisbursement) separadamente", () => {
    const events = [financialEvent({ type: 20, amount: 12.5 }), financialEvent({ type: 20, amount: 3.5 }), financialEvent({ type: 17, amount: 500 }), financialEvent({ type: 10, amount: 999 })];
    const result = sumPrepaymentEvents(events);
    expect(result.prepaymentFeeAmount).toBe(16);
    expect(result.prepaymentDisbursementAmount).toBe(500);
  });

  it("nenhum evento do tipo -> null, nunca 0 fabricado (ausência de dado ≠ zero)", () => {
    const result = sumPrepaymentEvents([financialEvent({ type: 10 })]);
    expect(result.prepaymentFeeAmount).toBeNull();
    expect(result.prepaymentDisbursementAmount).toBeNull();
  });

  it("lista vazia -> ambos null", () => {
    expect(sumPrepaymentEvents([])).toEqual({ prepaymentFeeAmount: null, prepaymentDisbursementAmount: null });
  });
});
