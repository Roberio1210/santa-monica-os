import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoneCache } from "@/lib/integrations/stone/cache";
import { OFFICIAL_SAMPLE_XML } from "@/lib/integrations/stone/__fixtures__/official-sample";

const ORIGINAL_ENV = { ...process.env };

function gzipResponse(status: number, xml: string) {
  const gzipped = gzipSync(Buffer.from(xml, "utf-8"));
  return { ok: status >= 200 && status < 300, status, statusText: String(status), arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) };
}

describe("lookbackDates — pura", () => {
  it("gera N datas crescentes terminando em referenceDate", async () => {
    const { lookbackDates } = await import("@/lib/integrations/stone/multiDay");
    const dates = lookbackDates("2026-07-24", 3);
    expect(dates).toEqual(["2026-07-22", "2026-07-23", "2026-07-24"]);
  });
});

describe("fetchNormalizedConciliations — Sprint 7.0, Z3", () => {
  beforeEach(() => {
    vi.resetModules();
    clearStoneCache();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.STONE_API_KEY;
    delete process.env.STONE_ACCOUNT_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("sem credenciais, cada data devolve not_configured honestamente, nunca lança", async () => {
    const { fetchNormalizedConciliations } = await import("@/lib/integrations/stone/multiDay");
    const results = await fetchNormalizedConciliations(["2026-07-22", "2026-07-23"]);
    expect(results.every((r) => r.status === "not_configured" && r.normalized === null)).toBe(true);
  });

  it("com credenciais, dias com arquivo real são normalizados e dataAvailableThroughDate reflete o mais recente com sucesso", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));
    const { fetchNormalizedConciliations, successfulNormalizedConciliations, dataAvailableThroughDate } = await import("@/lib/integrations/stone/multiDay");

    const results = await fetchNormalizedConciliations(["2026-07-20", "2026-07-21"]);
    expect(results.every((r) => r.status === "ok")).toBe(true);
    expect(successfulNormalizedConciliations(results)).toHaveLength(2);
    expect(dataAvailableThroughDate(results)).toBe("2026-07-21");
  });

  it("dataAvailableThroughDate é null quando nenhuma data teve sucesso — nunca assume 'hoje'", async () => {
    const { fetchNormalizedConciliations, dataAvailableThroughDate } = await import("@/lib/integrations/stone/multiDay");
    const results = await fetchNormalizedConciliations(["2026-07-22"]);
    expect(dataAvailableThroughDate(results)).toBeNull();
  });
});
