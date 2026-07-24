import { describe, expect, it } from "vitest";
import { StaticOrganizationalMemoryRepository } from "@/lib/zezinho/directors/organizationalMemory/static-repository";

describe("StaticOrganizationalMemoryRepository — implementação em memória, usada quando DATABASE_URL não está configurada", () => {
  it("upsertSnapshot nunca duplica — mesma (directorId, snapshotDate) atualiza em vez de criar", async () => {
    const repo = new StaticOrganizationalMemoryRepository();
    await repo.upsertSnapshot({ directorId: "financeiro", snapshotDate: "2026-07-24", summary: "a", metricKey: "x", direction: "queda", evidenceFactKeys: [] });
    await repo.upsertSnapshot({ directorId: "financeiro", snapshotDate: "2026-07-24", summary: "b", metricKey: "x", direction: "queda", evidenceFactKeys: [] });
    const snapshots = await repo.getRecentSnapshots("financeiro", "2026-07-01");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].summary).toBe("b");
  });

  it("getRecentSnapshots respeita a data de corte e o diretor", async () => {
    const repo = new StaticOrganizationalMemoryRepository();
    await repo.upsertSnapshot({ directorId: "financeiro", snapshotDate: "2026-06-01", summary: "antigo", metricKey: null, direction: "indisponivel", evidenceFactKeys: [] });
    await repo.upsertSnapshot({ directorId: "financeiro", snapshotDate: "2026-07-24", summary: "recente", metricKey: null, direction: "indisponivel", evidenceFactKeys: [] });
    await repo.upsertSnapshot({ directorId: "operacoes", snapshotDate: "2026-07-24", summary: "outro diretor", metricKey: null, direction: "indisponivel", evidenceFactKeys: [] });
    const snapshots = await repo.getRecentSnapshots("financeiro", "2026-07-01");
    expect(snapshots.map((s) => s.summary)).toEqual(["recente"]);
  });

  it("pruneSnapshotsOlderThan remove só o que é anterior ao corte e devolve a contagem", async () => {
    const repo = new StaticOrganizationalMemoryRepository();
    await repo.upsertSnapshot({ directorId: "financeiro", snapshotDate: "2026-05-01", summary: "a", metricKey: null, direction: "indisponivel", evidenceFactKeys: [] });
    await repo.upsertSnapshot({ directorId: "financeiro", snapshotDate: "2026-07-24", summary: "b", metricKey: null, direction: "indisponivel", evidenceFactKeys: [] });
    const removed = await repo.pruneSnapshotsOlderThan("2026-07-01");
    expect(removed).toBe(1);
    expect(await repo.getRecentSnapshots("financeiro", "2026-01-01")).toHaveLength(1);
  });

  it("createLearning cria com status observacao e confirmationCount 1", async () => {
    const repo = new StaticOrganizationalMemoryRepository();
    const created = await repo.createLearning({ directorId: "financeiro", signalKey: "k1", description: "d", evidenceFactKeys: [], confidenceLevel: "media", limitations: [], observedAt: "2026-07-24T00:00:00.000Z", expiresAt: "2026-08-07T00:00:00.000Z" });
    expect(created.status).toBe("observacao");
    expect(created.confirmationCount).toBe(1);
    expect(await repo.findLearningBySignal("financeiro", "k1")).toEqual(created);
  });

  it("reinforceLearning incrementa confirmationCount e aplica o novo status/expiração", async () => {
    const repo = new StaticOrganizationalMemoryRepository();
    const created = await repo.createLearning({ directorId: "financeiro", signalKey: "k1", description: "d", evidenceFactKeys: [], confidenceLevel: "media", limitations: [], observedAt: "2026-07-01T00:00:00.000Z", expiresAt: "2026-07-15T00:00:00.000Z" });
    const reinforced = await repo.reinforceLearning(created.id, { confirmedAt: "2026-07-10T00:00:00.000Z", status: "aprendizado", expiresAt: null, confidenceLevel: "alta", limitations: [] });
    expect(reinforced.confirmationCount).toBe(2);
    expect(reinforced.status).toBe("aprendizado");
    expect(reinforced.expiresAt).toBeNull();
    expect(reinforced.confidenceLevel).toBe("alta");
  });

  it("expireStaleObservations remove só observacao expiradas, nunca aprendizado/conhecimento", async () => {
    const repo = new StaticOrganizationalMemoryRepository();
    await repo.createLearning({ directorId: "financeiro", signalKey: "expira", description: "d1", evidenceFactKeys: [], confidenceLevel: "media", limitations: [], observedAt: "2026-06-01T00:00:00.000Z", expiresAt: "2026-06-15T00:00:00.000Z" });
    const confirmado = await repo.createLearning({ directorId: "financeiro", signalKey: "confirmado", description: "d2", evidenceFactKeys: [], confidenceLevel: "alta", limitations: [], observedAt: "2026-06-01T00:00:00.000Z", expiresAt: null });
    await repo.reinforceLearning(confirmado.id, { confirmedAt: "2026-07-01T00:00:00.000Z", status: "aprendizado", expiresAt: null, confidenceLevel: "alta", limitations: [] });

    const removed = await repo.expireStaleObservations("2026-07-24T00:00:00.000Z");
    expect(removed).toBe(1);
    expect(await repo.findLearningBySignal("financeiro", "expira")).toBeNull();
    expect(await repo.findLearningBySignal("financeiro", "confirmado")).not.toBeNull();
  });

  it("listLearnings filtra por status quando informado", async () => {
    const repo = new StaticOrganizationalMemoryRepository();
    await repo.createLearning({ directorId: "financeiro", signalKey: "k1", description: "d1", evidenceFactKeys: [], confidenceLevel: "media", limitations: [], observedAt: "2026-07-01T00:00:00.000Z", expiresAt: null });
    const confirmado = await repo.createLearning({ directorId: "financeiro", signalKey: "k2", description: "d2", evidenceFactKeys: [], confidenceLevel: "media", limitations: [], observedAt: "2026-07-01T00:00:00.000Z", expiresAt: null });
    await repo.reinforceLearning(confirmado.id, { confirmedAt: "2026-07-10T00:00:00.000Z", status: "aprendizado", expiresAt: null, confidenceLevel: "alta", limitations: [] });

    expect(await repo.listLearnings(["aprendizado"])).toHaveLength(1);
    expect(await repo.listLearnings()).toHaveLength(2);
  });

  it("upsertStrategicItem nunca duplica — mesma (kind, title) atualiza em vez de criar", async () => {
    const repo = new StaticOrganizationalMemoryRepository();
    await repo.upsertStrategicItem({ kind: "meta", title: "Lavação Julho", description: "v1", evidenceFactKeys: ["goal_progress"], observedAt: "2026-07-01T00:00:00.000Z" });
    await repo.upsertStrategicItem({ kind: "meta", title: "Lavação Julho", description: "v2", evidenceFactKeys: ["goal_progress"], observedAt: "2026-07-24T00:00:00.000Z" });
    const items = await repo.listActiveStrategicItems();
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("v2");
    expect(items[0].lastConfirmedAt).toBe("2026-07-24T00:00:00.000Z");
  });

  it("createBeliefIfMissing é idempotente por statement — devolve null na segunda vez", async () => {
    const repo = new StaticOrganizationalMemoryRepository();
    const first = await repo.createBeliefIfMissing({ statement: "Qualidade acima da velocidade.", category: "qualidade", source: "teste" });
    const second = await repo.createBeliefIfMissing({ statement: "Qualidade acima da velocidade.", category: "qualidade", source: "teste" });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await repo.listActiveBeliefs()).toHaveLength(1);
  });
});
