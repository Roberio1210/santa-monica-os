import type {
  AssignPaymentGroupResult,
  FinishImportRunInput,
  StartImportRunInput,
  StoneDivergenceRecord,
  StoneDivergenceRow,
  StoneFileLayout,
  StoneImportRun,
  StoneNormalizedTransactionRecord,
  StonePaymentGroupRecord,
  StoneReconciliationResultRecord,
  StoneReconciliationResultRow,
  StoneReviewStatus,
  UpdateDivergenceReviewInput,
  UpsertPaymentGroupsResult,
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
  /** Missão Financeiro V2.1 — data real de liquidação (nunca a esperada), usada para conciliar o extrato bancário Stone. */
  listNormalizedTransactionsBySettledDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]>;
  /** Missão Financeiro V6 — data da VENDA (nunca a esperada/liquidada), usada pela análise de custo real Stone (MDR/antecipação) por dia/modalidade. Todas as parcelas de uma mesma venda compartilham o mesmo `capturedAt`. */
  listNormalizedTransactionsByCapturedDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]>;
  /** Missão Financeiro V2 — busca pontual pela chave determinística da parcela (Z2, `identity.ts`), usada ao confirmar uma conciliação como recebível. */
  getNormalizedTransactionByExternalKey(externalKey: string): Promise<StoneNormalizedTransactionRecord | null>;
  /**
   * Missão 69 — candidatos para correlação de liquidação entre dias diferentes, pela identidade
   * real da parcela (`acquirerTransactionKey`+`installmentNumber` — nunca a chave externa
   * completa, que exige dados que só a própria venda já persistida tem). Pode devolver mais de um
   * resultado; decidir se isso é conflito é responsabilidade de quem chama
   * (`crossDaySettlement.ts`), nunca deste método.
   */
  findNormalizedTransactionsByAcquirerKeyAndInstallment(acquirerTransactionKey: string, installmentNumber: number): Promise<StoneNormalizedTransactionRecord[]>;
  /**
   * Missão 69 — grava a liquidação encontrada por correlação cross-day, só nos dois campos de
   * liquidação (`settledPaymentDate`/`settledAmount`), e só quando a linha ainda não tinha
   * nenhuma — nunca sobrescreve uma liquidação já registrada. Devolve `false` (sem lançar) quando
   * a guarda impediu a escrita (linha não encontrada, ou já tinha liquidação).
   */
  updateSettlementInfo(externalKey: string, settledPaymentDate: string, settledAmount: number): Promise<boolean>;

  /**
   * Missão 81 — upsert de grupos de repasse Stone por `paymentId` (identidade real, Missão 77).
   * Nunca sobrescreve `paymentDate`/`totalAmount` incompatíveis com o que já existe para o mesmo
   * `paymentId` (vira conflito, reportado, nunca escolhido arbitrariamente); `walletTypeId` só é
   * preenchido de forma aditiva quando o existente é `null`. `sourceFile`/`importRunId` nunca são
   * atualizados num grupo já existente — preservam a origem real de quando o grupo nasceu.
   */
  upsertPaymentGroups(groups: StonePaymentGroupRecord[]): Promise<UpsertPaymentGroupsResult>;
  /**
   * Missão 81 — associa uma venda já persistida (`externalKey`) a um grupo de repasse, só quando
   * `paymentGroupId` ainda está `null`. Devolve `"assigned"` (associação nova), `"same_group"`
   * (idempotente — já era esse grupo) ou `"conflict"` (já pertencia a outro grupo — nunca
   * reatribuído).
   */
  assignPaymentGroup(externalKey: string, paymentGroupId: string): Promise<AssignPaymentGroupResult>;

  /** Upsert em lote por `naturalKey` — reprocessar o mesmo período nunca duplica um resultado. */
  upsertReconciliationResults(records: StoneReconciliationResultRecord[]): Promise<void>;
  listReconciliationResults(periodFrom: string, periodTo: string): Promise<StoneReconciliationResultRow[]>;
  updateReconciliationReviewStatus(id: string, status: StoneReviewStatus): Promise<StoneReconciliationResultRow>;
  /** Missão Financeiro V2 — busca pontual por id, usada ao confirmar manualmente uma conciliação como recebível (nunca em lote/automático). */
  getReconciliationResultById(id: string): Promise<StoneReconciliationResultRow | null>;

  /**
   * Upsert em lote por `naturalKey` — só atualiza os campos factuais (evidência, impacto,
   * recomendação); nunca sobrescreve `status`/`assignee`/`resolutionNote` de uma divergência já
   * revisada por um humano (preserva auditoria — reprocessar nunca apaga uma revisão).
   */
  upsertDivergences(records: StoneDivergenceRecord[]): Promise<void>;
  listDivergences(filter?: { status?: StoneReviewStatus }): Promise<StoneDivergenceRow[]>;
  updateDivergenceReview(input: UpdateDivergenceReviewInput): Promise<StoneDivergenceRow>;
}
