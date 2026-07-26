import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoneCache } from "@/lib/integrations/stone/cache";
import { OFFICIAL_SAMPLE_XML } from "@/lib/integrations/stone/__fixtures__/official-sample";

const ORIGINAL_ENV = { ...process.env };

function gzipResponse(status: number, xml: string) {
  const gzipped = gzipSync(Buffer.from(xml, "utf-8"));
  return { ok: status >= 200 && status < 300, status, statusText: String(status), url: "https://conciliation.stone.com.br/mock", redirected: false, headers: { get: () => "application/gzip" }, arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) };
}

function notFoundResponse() {
  return { ok: false, status: 404, statusText: "404", url: "https://conciliation.stone.com.br/mock", redirected: false, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
}

describe("runFinancialDirector — Sprint 8, Diretor Financeiro Inteligente", () => {
  beforeEach(() => {
    clearStoneCache();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.STONE_API_KEY;
    delete process.env.STONE_ACCOUNT_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("sem credenciais Stone, devolve not_configured honestamente, nunca lança", async () => {
    const { runFinancialDirector } = await import("@/lib/finance/intelligence/director/service");
    const report = await runFinancialDirector("2026-07-22");
    expect(report.status).toBe("not_configured");
    expect(report.primaryMetrics).toBeNull();
    expect(report.executiveSummary).toBeNull();
  });

  it("nenhum arquivo disponível na janela → no_data, nunca lança, nunca inventa dado", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notFoundResponse()));

    const { runFinancialDirector } = await import("@/lib/finance/intelligence/director/service");
    const report = await runFinancialDirector("2026-07-22");
    expect(report.status).toBe("no_data");
    expect(report.primaryMetrics).toBeNull();
    expect(report.comparisons).toEqual([]);
    expect(report.diagnostics).toEqual([]);
  });

  it("caminho feliz: relatório estruturado completo — métricas, 5 comparações, diagnósticos, recomendações e resumo executivo", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));

    const { runFinancialDirector } = await import("@/lib/finance/intelligence/director/service");
    const report = await runFinancialDirector("2026-07-22");

    expect(report.status).toBe("ok");
    expect(report.error).toBeNull();
    expect(report.dataAvailableThroughDate).toBe("2026-07-22");
    expect(report.primaryMetrics).not.toBeNull();
    expect(report.primaryMetrics!.transactionCount).toBeGreaterThan(0);
    expect(report.comparisons).toHaveLength(5);
    expect(report.comparisons.map((c) => c.label)).toEqual(["Hoje x ontem", "Mesmo dia da semana anterior", "Últimos 7 dias x 7 dias anteriores", "Últimos 30 dias x 30 dias anteriores", "Mês atual x mês anterior"]);
    expect(Array.isArray(report.diagnostics)).toBe(true);
    expect(Array.isArray(report.recommendations)).toBe(true);
    expect(report.executiveSummary).not.toBeNull();
    expect(report.executiveSummary!.netRevenueLabel).toContain("R$");
    expect(report.executiveSummary!.situation).toBeTruthy();
    expect(report.executiveSummary!.mainRecommendation).toBeTruthy();
  });

  it("cada comparação traz currentMetrics/previousMetrics/trends coerentes com as métricas do módulo", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));

    const { runFinancialDirector } = await import("@/lib/finance/intelligence/director/service");
    const report = await runFinancialDirector("2026-07-22");

    for (const comparison of report.comparisons) {
      expect(comparison.trends.length).toBeGreaterThan(0);
      expect(comparison.currentMetrics.periodFrom).toBe(comparison.currentPeriod.from);
      expect(comparison.previousMetrics.periodFrom).toBe(comparison.previousPeriod.from);
    }
  });

  it("chamada repetida na mesma janela reaproveita o relatório em cache — nunca busca de novo (PERFORMANCE)", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    const fetchMock = vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML));
    vi.stubGlobal("fetch", fetchMock);

    const { runFinancialDirector } = await import("@/lib/finance/intelligence/director/service");
    await runFinancialDirector("2026-07-22");
    const callsAfterFirst = fetchMock.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await runFinancialDirector("2026-07-22");
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // segunda chamada não gerou nenhuma requisição nova
  });

  it("nunca lança mesmo quando a Stone falha de forma inesperada durante a janela", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { runFinancialDirector } = await import("@/lib/finance/intelligence/director/service");
    await expect(runFinancialDirector("2026-07-22")).resolves.toBeDefined();
  });
});
