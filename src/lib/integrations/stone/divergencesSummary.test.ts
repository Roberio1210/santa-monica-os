import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDivergencesSummary } from "@/lib/integrations/stone/divergencesSummary";
import { getStonePersistenceRepository, resetStonePersistenceRepositoryForTests } from "@/lib/integrations/stone/persistence/repository-factory";
import type { StoneDivergenceRecord } from "@/lib/integrations/stone/persistence/types";

const ORIGINAL_ENV = { ...process.env };

function divergence(overrides: Partial<StoneDivergenceRecord> = {}): StoneDivergenceRecord {
  return {
    naturalKey: "diferenca_de_valor:NSU-1:ORDER-1",
    type: "diferenca_de_valor",
    priority: "alta",
    financialImpact: 10,
    evidence: ["valor divergente"],
    involvedStoneSaleExternalKey: "NSU-1",
    involvedJumpparkOrderExternalId: "ORDER-1",
    confidence: "medium",
    recommendation: "conferir",
    periodFrom: "2026-07-01",
    periodTo: "2026-07-24",
    ...overrides,
  };
}

describe("buildDivergencesSummary — Sprint 7.0, Z4", () => {
  beforeEach(() => {
    resetStonePersistenceRepositoryForTests();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("status not_configured quando a Stone não está configurada, nunca consulta o repositório", async () => {
    delete process.env.STONE_API_KEY;
    delete process.env.STONE_ACCOUNT_ID;
    const summary = await buildDivergencesSummary();
    expect(summary.status).toBe("not_configured");
    expect(summary.totalCount).toBe(0);
  });

  it("resumo vazio quando nenhuma sincronização com divergências rodou ainda", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    const summary = await buildDivergencesSummary();
    expect(summary.status).toBe("ok");
    expect(summary.totalCount).toBe(0);
    expect(summary.limitations.length).toBeGreaterThan(0);
  });

  it("conta divergências abertas e de alta prioridade corretamente", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    await getStonePersistenceRepository().upsertDivergences([
      divergence(),
      divergence({ naturalKey: "chargeback:NSU-2:none", type: "chargeback", priority: "media", involvedJumpparkOrderExternalId: null }),
    ]);

    const summary = await buildDivergencesSummary();
    expect(summary.totalCount).toBe(2);
    expect(summary.openCount).toBe(2);
    expect(summary.highPriorityOpenCount).toBe(1);
    expect(summary.byType.diferenca_de_valor).toBe(1);
    expect(summary.byPriority.alta).toBe(1);
  });

  it("divergência resolvida não conta como aberta", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    const repo = getStonePersistenceRepository();
    await repo.upsertDivergences([divergence()]);
    const [row] = await repo.listDivergences();
    await repo.updateDivergenceReview({ id: row.id, status: "resolved" });

    const summary = await buildDivergencesSummary();
    expect(summary.totalCount).toBe(1);
    expect(summary.openCount).toBe(0);
  });
});
