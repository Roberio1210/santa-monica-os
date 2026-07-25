import type {
  FinishImportRunInput,
  StartImportRunInput,
  StoneDivergenceRecord,
  StoneDivergenceRow,
  StoneFileLayout,
  StoneImportRun,
  StoneNormalizedTransactionRecord,
  StoneReconciliationResultRecord,
  StoneReconciliationResultRow,
  StoneReviewStatus,
  UpdateDivergenceReviewInput,
} from "@/lib/integrations/stone/persistence/types";

/**
 * Interface da persistência Stone (Sprint 7.0, Z4) — mesmo padrão de `finance/repository.ts`:
 * uma interface, duas implementações (`memory-repository.ts` para desenvolvimento sem banco,
 * `postgres-repository.ts` para produção), escolhidas por `repository-factory.ts` via
 * `getStorageMode()`.
 */
export interface StonePersistenceRepository {
  /** Cria ou reabre (upsert por `referenceDate`+`layout`) uma execução de importação como `running`. */
  startImportRun(input: StartImportRunInput): Promise<StoneImportRun>;
  finishImportRun(input: FinishImportRunInput): Promise<StoneImportRun>;
  getImportRun(referenceDate: string, layout: StoneFileLayout): Promise<StoneImportRun | null>;
  /** Mais recentes primeiro — histórico de importações da tela/status. */
  listImportRuns(limit: number): Promise<StoneImportRun[]>;
  getLatestSucceededImportRun(): Promise<StoneImportRun | null>;

  /** Upsert em lote por `externalKey` — nunca duplica, sempre atualiza o estado mais recente da parcela. */
  upsertNormalizedTransactions(records: StoneNormalizedTransactionRecord[]): Promise<void>;
  listNormalizedTransactionsByExpectedDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]>;

  /** Upsert em lote por `naturalKey` — reprocessar o mesmo período nunca duplica um resultado. */
  upsertReconciliationResults(records: StoneReconciliationResultRecord[]): Promise<void>;
  listReconciliationResults(periodFrom: string, periodTo: string): Promise<StoneReconciliationResultRow[]>;
  updateReconciliationReviewStatus(id: string, status: StoneReviewStatus): Promise<StoneReconciliationResultRow>;

  /**
   * Upsert em lote por `naturalKey` — só atualiza os campos factuais (evidência, impacto,
   * recomendação); nunca sobrescreve `status`/`assignee`/`resolutionNote` de uma divergência já
   * revisada por um humano (preserva auditoria — reprocessar nunca apaga uma revisão).
   */
  upsertDivergences(records: StoneDivergenceRecord[]): Promise<void>;
  listDivergences(filter?: { status?: StoneReviewStatus }): Promise<StoneDivergenceRow[]>;
  updateDivergenceReview(input: UpdateDivergenceReviewInput): Promise<StoneDivergenceRow>;
}
