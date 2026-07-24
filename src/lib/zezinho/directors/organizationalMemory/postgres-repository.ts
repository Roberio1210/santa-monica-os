import "server-only";
import { and, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { directorDailySnapshots, directorLearnings, organizationalBeliefs, strategicMemoryItems } from "@/db/schema";
import type {
  NewBeliefInput,
  NewLearningInput,
  NewSnapshotInput,
  NewStrategicItemInput,
  OrganizationalMemoryRepository,
  ReinforceLearningInput,
} from "@/lib/zezinho/directors/organizationalMemory/repository";
import type { Belief, DirectorDailySnapshot, Learning, LearningStatus, StrategicMemoryItem, StrategicMemoryItemKind } from "@/lib/zezinho/directors/organizationalMemory/types";
import type { DirectorId } from "@/lib/zezinho/directors/types";

function toSnapshot(row: typeof directorDailySnapshots.$inferSelect): DirectorDailySnapshot {
  return {
    id: row.id,
    directorId: row.directorId,
    snapshotDate: row.snapshotDate,
    summary: row.summary,
    metricKey: row.metricKey,
    direction: row.direction,
    evidenceFactKeys: row.evidenceFactKeys,
    createdAt: row.createdAt.toISOString(),
  };
}

function toLearning(row: typeof directorLearnings.$inferSelect): Learning {
  return {
    id: row.id,
    directorId: row.directorId,
    signalKey: row.signalKey,
    description: row.description,
    evidenceFactKeys: row.evidenceFactKeys,
    status: row.status,
    confidenceLevel: row.confidenceLevel,
    confirmationCount: row.confirmationCount,
    firstObservedAt: row.firstObservedAt.toISOString(),
    lastConfirmedAt: row.lastConfirmedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    limitations: row.limitations,
  };
}

function toStrategicItem(row: typeof strategicMemoryItems.$inferSelect): StrategicMemoryItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    evidenceFactKeys: row.evidenceFactKeys,
    firstObservedAt: row.firstObservedAt.toISOString(),
    lastConfirmedAt: row.lastConfirmedAt.toISOString(),
    active: row.active,
  };
}

function toBelief(row: typeof organizationalBeliefs.$inferSelect): Belief {
  return { id: row.id, statement: row.statement, category: row.category, source: row.source, active: row.active };
}

/** Implementação real, ativada automaticamente quando `DATABASE_URL` está configurada. */
export class PostgresOrganizationalMemoryRepository implements OrganizationalMemoryRepository {
  private db() {
    const db = getDb();
    if (!db) throw new Error("PostgresOrganizationalMemoryRepository foi instanciado sem DATABASE_URL configurada.");
    return db;
  }

  async getRecentSnapshots(directorId: DirectorId, sinceDate: string): Promise<DirectorDailySnapshot[]> {
    const rows = await this.db()
      .select()
      .from(directorDailySnapshots)
      .where(and(eq(directorDailySnapshots.directorId, directorId), gte(directorDailySnapshots.snapshotDate, sinceDate)));
    return rows.map(toSnapshot).sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  }

  async upsertSnapshot(input: NewSnapshotInput): Promise<DirectorDailySnapshot> {
    const [row] = await this.db()
      .insert(directorDailySnapshots)
      .values({ directorId: input.directorId, snapshotDate: input.snapshotDate, summary: input.summary, metricKey: input.metricKey, direction: input.direction, evidenceFactKeys: input.evidenceFactKeys })
      .onConflictDoUpdate({
        target: [directorDailySnapshots.directorId, directorDailySnapshots.snapshotDate],
        set: { summary: input.summary, metricKey: input.metricKey, direction: input.direction, evidenceFactKeys: input.evidenceFactKeys, updatedAt: new Date() },
      })
      .returning();
    return toSnapshot(row);
  }

  async pruneSnapshotsOlderThan(cutoffDate: string): Promise<number> {
    const deleted = await this.db().delete(directorDailySnapshots).where(lt(directorDailySnapshots.snapshotDate, cutoffDate)).returning({ id: directorDailySnapshots.id });
    return deleted.length;
  }

  async findLearningBySignal(directorId: DirectorId, signalKey: string): Promise<Learning | null> {
    const rows = await this.db().select().from(directorLearnings).where(and(eq(directorLearnings.directorId, directorId), eq(directorLearnings.signalKey, signalKey))).limit(1);
    return rows[0] ? toLearning(rows[0]) : null;
  }

  async createLearning(input: NewLearningInput): Promise<Learning> {
    const [row] = await this.db()
      .insert(directorLearnings)
      .values({
        directorId: input.directorId,
        signalKey: input.signalKey,
        description: input.description,
        evidenceFactKeys: input.evidenceFactKeys,
        status: "observacao",
        confidenceLevel: input.confidenceLevel,
        confirmationCount: 1,
        firstObservedAt: new Date(input.observedAt),
        lastConfirmedAt: new Date(input.observedAt),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        limitations: input.limitations,
      })
      .returning();
    return toLearning(row);
  }

  async reinforceLearning(id: string, input: ReinforceLearningInput): Promise<Learning> {
    const [row] = await this.db()
      .update(directorLearnings)
      .set({
        confirmationCount: sql`${directorLearnings.confirmationCount} + 1`,
        lastConfirmedAt: new Date(input.confirmedAt),
        status: input.status,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        confidenceLevel: input.confidenceLevel,
        limitations: input.limitations,
        updatedAt: new Date(),
      })
      .where(eq(directorLearnings.id, id))
      .returning();
    if (!row) throw new Error(`Aprendizado não encontrado: ${id}`);
    return toLearning(row);
  }

  async listLearnings(statuses?: LearningStatus[]): Promise<Learning[]> {
    const rows = statuses ? await this.db().select().from(directorLearnings).where(inArray(directorLearnings.status, statuses)) : await this.db().select().from(directorLearnings);
    return rows.map(toLearning);
  }

  async listRecentLearnings(sinceDate: string): Promise<Learning[]> {
    const rows = await this.db()
      .select()
      .from(directorLearnings)
      .where(and(notInArray(directorLearnings.status, ["observacao", "descartado"]), gte(directorLearnings.lastConfirmedAt, new Date(sinceDate))));
    return rows.map(toLearning);
  }

  async expireStaleObservations(now: string): Promise<number> {
    const deleted = await this.db()
      .delete(directorLearnings)
      .where(and(eq(directorLearnings.status, "observacao"), lt(directorLearnings.expiresAt, new Date(now))))
      .returning({ id: directorLearnings.id });
    return deleted.length;
  }

  async findStrategicItem(kind: StrategicMemoryItemKind, title: string): Promise<StrategicMemoryItem | null> {
    const rows = await this.db().select().from(strategicMemoryItems).where(and(eq(strategicMemoryItems.kind, kind), eq(strategicMemoryItems.title, title))).limit(1);
    return rows[0] ? toStrategicItem(rows[0]) : null;
  }

  async upsertStrategicItem(input: NewStrategicItemInput): Promise<StrategicMemoryItem> {
    const [row] = await this.db()
      .insert(strategicMemoryItems)
      .values({ kind: input.kind, title: input.title, description: input.description, evidenceFactKeys: input.evidenceFactKeys, firstObservedAt: new Date(input.observedAt), lastConfirmedAt: new Date(input.observedAt) })
      .onConflictDoUpdate({
        target: [strategicMemoryItems.kind, strategicMemoryItems.title],
        set: { description: input.description, evidenceFactKeys: input.evidenceFactKeys, lastConfirmedAt: new Date(input.observedAt), updatedAt: new Date() },
      })
      .returning();
    return toStrategicItem(row);
  }

  async listActiveStrategicItems(): Promise<StrategicMemoryItem[]> {
    const rows = await this.db().select().from(strategicMemoryItems).where(eq(strategicMemoryItems.active, true));
    return rows.map(toStrategicItem);
  }

  async listActiveBeliefs(): Promise<Belief[]> {
    const rows = await this.db().select().from(organizationalBeliefs).where(eq(organizationalBeliefs.active, true));
    return rows.map(toBelief);
  }

  async createBeliefIfMissing(input: NewBeliefInput): Promise<Belief | null> {
    const rows = await this.db()
      .insert(organizationalBeliefs)
      .values({ statement: input.statement, category: input.category, source: input.source })
      .onConflictDoNothing({ target: organizationalBeliefs.statement })
      .returning();
    return rows[0] ? toBelief(rows[0]) : null;
  }
}
