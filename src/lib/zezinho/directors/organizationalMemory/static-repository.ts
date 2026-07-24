import "server-only";
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

/**
 * Implementação em memória — usada automaticamente quando `DATABASE_URL` não está configurada
 * (ver `repository-factory.ts`). Começa vazia: nenhum aprendizado/crença é inventado como dado
 * inicial (mesmo princípio de `StaticRecipeRepository`). Sem persistência entre requisições em
 * ambiente serverless — mesma limitação já documentada nos demais repositórios em memória.
 */
export class StaticOrganizationalMemoryRepository implements OrganizationalMemoryRepository {
  private snapshots: DirectorDailySnapshot[] = [];
  private learnings: Learning[] = [];
  private strategicItems: StrategicMemoryItem[] = [];
  private beliefs: Belief[] = [];
  private nextId = 1;

  private id(): string {
    return String(this.nextId++);
  }

  async getRecentSnapshots(directorId: DirectorId, sinceDate: string): Promise<DirectorDailySnapshot[]> {
    return this.snapshots.filter((s) => s.directorId === directorId && s.snapshotDate >= sinceDate).map((s) => ({ ...s }));
  }

  async upsertSnapshot(input: NewSnapshotInput): Promise<DirectorDailySnapshot> {
    const existing = this.snapshots.find((s) => s.directorId === input.directorId && s.snapshotDate === input.snapshotDate);
    if (existing) {
      Object.assign(existing, { summary: input.summary, metricKey: input.metricKey, direction: input.direction, evidenceFactKeys: input.evidenceFactKeys });
      return { ...existing };
    }
    const snapshot: DirectorDailySnapshot = {
      id: this.id(),
      directorId: input.directorId,
      snapshotDate: input.snapshotDate,
      summary: input.summary,
      metricKey: input.metricKey,
      direction: input.direction,
      evidenceFactKeys: input.evidenceFactKeys,
      createdAt: new Date().toISOString(),
    };
    this.snapshots.push(snapshot);
    return { ...snapshot };
  }

  async pruneSnapshotsOlderThan(cutoffDate: string): Promise<number> {
    const before = this.snapshots.length;
    this.snapshots = this.snapshots.filter((s) => s.snapshotDate >= cutoffDate);
    return before - this.snapshots.length;
  }

  async findLearningBySignal(directorId: DirectorId, signalKey: string): Promise<Learning | null> {
    const learning = this.learnings.find((l) => l.directorId === directorId && l.signalKey === signalKey);
    return learning ? { ...learning } : null;
  }

  async createLearning(input: NewLearningInput): Promise<Learning> {
    const learning: Learning = {
      id: this.id(),
      directorId: input.directorId,
      signalKey: input.signalKey,
      description: input.description,
      evidenceFactKeys: input.evidenceFactKeys,
      status: "observacao",
      confidenceLevel: input.confidenceLevel,
      confirmationCount: 1,
      firstObservedAt: input.observedAt,
      lastConfirmedAt: input.observedAt,
      expiresAt: input.expiresAt,
      limitations: input.limitations,
    };
    this.learnings.push(learning);
    return { ...learning };
  }

  async reinforceLearning(id: string, input: ReinforceLearningInput): Promise<Learning> {
    const learning = this.learnings.find((l) => l.id === id);
    if (!learning) throw new Error(`Aprendizado não encontrado: ${id}`);
    learning.confirmationCount += 1;
    learning.lastConfirmedAt = input.confirmedAt;
    learning.status = input.status;
    learning.expiresAt = input.expiresAt;
    learning.confidenceLevel = input.confidenceLevel;
    learning.limitations = input.limitations;
    return { ...learning };
  }

  async listLearnings(statuses?: LearningStatus[]): Promise<Learning[]> {
    const filtered = statuses ? this.learnings.filter((l) => statuses.includes(l.status)) : this.learnings;
    return filtered.map((l) => ({ ...l }));
  }

  async listRecentLearnings(sinceDate: string): Promise<Learning[]> {
    return this.learnings.filter((l) => l.status !== "observacao" && l.status !== "descartado" && l.lastConfirmedAt >= sinceDate).map((l) => ({ ...l }));
  }

  async expireStaleObservations(now: string): Promise<number> {
    const before = this.learnings.length;
    this.learnings = this.learnings.filter((l) => !(l.status === "observacao" && l.expiresAt !== null && l.expiresAt < now));
    return before - this.learnings.length;
  }

  async findStrategicItem(kind: StrategicMemoryItemKind, title: string): Promise<StrategicMemoryItem | null> {
    const item = this.strategicItems.find((i) => i.kind === kind && i.title === title);
    return item ? { ...item } : null;
  }

  async upsertStrategicItem(input: NewStrategicItemInput): Promise<StrategicMemoryItem> {
    const existing = this.strategicItems.find((i) => i.kind === input.kind && i.title === input.title);
    if (existing) {
      existing.description = input.description;
      existing.evidenceFactKeys = input.evidenceFactKeys;
      existing.lastConfirmedAt = input.observedAt;
      return { ...existing };
    }
    const item: StrategicMemoryItem = {
      id: this.id(),
      kind: input.kind,
      title: input.title,
      description: input.description,
      evidenceFactKeys: input.evidenceFactKeys,
      firstObservedAt: input.observedAt,
      lastConfirmedAt: input.observedAt,
      active: true,
    };
    this.strategicItems.push(item);
    return { ...item };
  }

  async listActiveStrategicItems(): Promise<StrategicMemoryItem[]> {
    return this.strategicItems.filter((i) => i.active).map((i) => ({ ...i }));
  }

  async listActiveBeliefs(): Promise<Belief[]> {
    return this.beliefs.filter((b) => b.active).map((b) => ({ ...b }));
  }

  async createBeliefIfMissing(input: NewBeliefInput): Promise<Belief | null> {
    if (this.beliefs.some((b) => b.statement === input.statement)) return null;
    const belief: Belief = { id: this.id(), statement: input.statement, category: input.category, source: input.source, active: true };
    this.beliefs.push(belief);
    return { ...belief };
  }
}
