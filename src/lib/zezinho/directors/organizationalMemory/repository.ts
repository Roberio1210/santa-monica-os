import type { Belief, DirectorDailySnapshot, Learning, LearningStatus, StrategicMemoryItem, StrategicMemoryItemKind } from "@/lib/zezinho/directors/organizationalMemory/types";
import type { ConfidenceLevel, FactDirection } from "@/lib/zezinho/reasoning/types";
import type { DirectorId } from "@/lib/zezinho/directors/types";

/**
 * Contrato de acesso à Memória Organizacional, desacoplado da implementação — mesma forma usada
 * em `src/lib/recipes/repository.ts` e no restante do projeto. As 4 tabelas (`director_daily_
 * snapshots`, `director_learnings`, `strategic_memory_items`, `organizational_beliefs`) vivem sob
 * um único repositório porque são sempre lidas/escritas juntas pelo mesmo `service.ts` a cada
 * execução da Diretoria — um único bounded context, não 4 domínios independentes.
 */

export interface NewSnapshotInput {
  directorId: DirectorId;
  snapshotDate: string;
  summary: string;
  metricKey: string | null;
  direction: FactDirection;
  evidenceFactKeys: string[];
}

export interface NewLearningInput {
  directorId: DirectorId;
  signalKey: string;
  description: string;
  evidenceFactKeys: string[];
  confidenceLevel: ConfidenceLevel;
  limitations: string[];
  observedAt: string;
  expiresAt: string | null;
}

export interface ReinforceLearningInput {
  confirmedAt: string;
  status: LearningStatus;
  expiresAt: string | null;
  confidenceLevel: ConfidenceLevel;
  limitations: string[];
}

export interface NewStrategicItemInput {
  kind: StrategicMemoryItemKind;
  title: string;
  description: string;
  evidenceFactKeys: string[];
  observedAt: string;
}

export interface NewBeliefInput {
  statement: string;
  category: string | null;
  source: string;
}

export interface OrganizationalMemoryRepository {
  // --- Memória Operacional ---
  getRecentSnapshots(directorId: DirectorId, sinceDate: string): Promise<DirectorDailySnapshot[]>;
  /** Cria ou atualiza a leitura do dia (`directorId` + `snapshotDate` únicos) — nunca duplica. */
  upsertSnapshot(input: NewSnapshotInput): Promise<DirectorDailySnapshot>;
  /** Remove leituras mais antigas que a data informada — retenção curta, nunca acumula indefinidamente. */
  pruneSnapshotsOlderThan(cutoffDate: string): Promise<number>;

  // --- Memória Organizacional (pipeline de aprendizado) ---
  findLearningBySignal(directorId: DirectorId, signalKey: string): Promise<Learning | null>;
  createLearning(input: NewLearningInput): Promise<Learning>;
  reinforceLearning(id: string, input: ReinforceLearningInput): Promise<Learning>;
  listLearnings(statuses?: LearningStatus[]): Promise<Learning[]>;
  /** Aprendizados/conhecimentos (nunca `"observacao"`) confirmados desde a data informada — base de "o que aprendemos recentemente". */
  listRecentLearnings(sinceDate: string): Promise<Learning[]>;
  /** Apaga `"observacao"` expiradas e nunca confirmadas — o mecanismo de esquecimento explícito. Devolve quantas foram removidas. */
  expireStaleObservations(now: string): Promise<number>;

  // --- Memória Estratégica ---
  findStrategicItem(kind: StrategicMemoryItemKind, title: string): Promise<StrategicMemoryItem | null>;
  upsertStrategicItem(input: NewStrategicItemInput): Promise<StrategicMemoryItem>;
  listActiveStrategicItems(): Promise<StrategicMemoryItem[]>;

  // --- Crenças ---
  listActiveBeliefs(): Promise<Belief[]>;
  /** Idempotente por `statement` único — usado pelo seed, nunca duplica uma crença já cadastrada. */
  createBeliefIfMissing(input: NewBeliefInput): Promise<Belief | null>;
}
