import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  stoneDivergences as stoneDivergencesTable,
  stoneImportRuns as stoneImportRunsTable,
  stoneNormalizedTransactions as stoneNormalizedTransactionsTable,
  stoneReconciliationResults as stoneReconciliationResultsTable,
} from "@/db/schema/stone";
import type { StonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository";
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

type ImportRunRow = typeof stoneImportRunsTable.$inferSelect;
type NormalizedTransactionRow = typeof stoneNormalizedTransactionsTable.$inferSelect;
type ReconciliationResultDbRow = typeof stoneReconciliationResultsTable.$inferSelect;
type DivergenceDbRow = typeof stoneDivergencesTable.$inferSelect;

function toImportRun(row: ImportRunRow): StoneImportRun {
  return {
    id: row.id,
    requestedPeriodFrom: row.requestedPeriodFrom,
    requestedPeriodTo: row.requestedPeriodTo,
    referenceDate: row.referenceDate,
    layout: row.layout,
    fileHash: row.fileHash,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    status: row.status,
    recordCount: row.recordCount,
    errorSanitized: row.errorSanitized,
    failureStatus: row.failureStatus,
    failureStage: row.failureStage,
    failureCategory: row.failureCategory,
    upstreamStatus: row.upstreamStatus,
    responseContentType: row.responseContentType,
    attemptCount: row.attemptCount,
    elapsedMs: row.elapsedMs,
    sanitizedHost: row.sanitizedHost,
    sanitizedPath: row.sanitizedPath,
    occurredAt: row.occurredAt ? row.occurredAt.toISOString() : null,
    origin: row.origin,
    prepaymentFeeAmount: row.prepaymentFeeAmount !== null ? Number(row.prepaymentFeeAmount) : null,
    prepaymentDisbursementAmount: row.prepaymentDisbursementAmount !== null ? Number(row.prepaymentDisbursementAmount) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toNormalizedTransaction(row: NormalizedTransactionRow): StoneNormalizedTransactionRecord {
  return {
    externalKey: row.externalKey,
    acquirerTransactionKey: row.acquirerTransactionKey,
    authorizationCode: row.authorizationCode,
    initiatorTransactionKey: row.initiatorTransactionKey,
    establishmentCode: row.establishmentCode,
    terminalSerialNumber: row.terminalSerialNumber,
    capturedAt: row.capturedAt.toISOString(),
    installmentNumber: row.installmentNumber,
    grossAmount: Number(row.grossAmount),
    feeAmount: Number(row.feeAmount),
    netAmount: Number(row.netAmount),
    paymentMethod: row.paymentMethod,
    brandId: row.brandId,
    eventType: row.eventType,
    receivableState: row.receivableState,
    expectedPaymentDate: row.expectedPaymentDate,
    settledPaymentDate: row.settledPaymentDate,
    settledAmount: row.settledAmount !== null ? Number(row.settledAmount) : null,
    mdrAmountStone: row.mdrAmountStone !== null ? Number(row.mdrAmountStone) : null,
    saleFeeCombined: row.saleFeeCombined !== null ? Number(row.saleFeeCombined) : null,
    advanceFeeAmountStone: row.advanceFeeAmountStone !== null ? Number(row.advanceFeeAmountStone) : null,
    sourceFile: row.sourceFile,
    importRunId: row.importRunId,
  };
}

function toReconciliationResultRow(row: ReconciliationResultDbRow): StoneReconciliationResultRow {
  return {
    id: row.id,
    naturalKey: row.naturalKey,
    stoneSaleExternalKey: row.stoneSaleExternalKey,
    jumpparkOrderExternalId: row.jumpparkOrderExternalId,
    matchType: row.matchType,
    confidence: row.confidence,
    heuristicScore: row.heuristicScore,
    favorableSignals: row.favorableSignals,
    contrarySignals: row.contrarySignals,
    ruleApplied: row.ruleApplied,
    reviewStatus: row.reviewStatus,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDivergenceRow(row: DivergenceDbRow): StoneDivergenceRow {
  return {
    id: row.id,
    naturalKey: row.naturalKey,
    type: row.type,
    priority: row.priority,
    financialImpact: Number(row.financialImpact),
    evidence: row.evidence,
    involvedStoneSaleExternalKey: row.involvedStoneSaleExternalKey,
    involvedJumpparkOrderExternalId: row.involvedJumpparkOrderExternalId,
    confidence: row.confidence,
    recommendation: row.recommendation,
    status: row.status,
    assignee: row.assignee,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Implementação Postgres da persistência Stone (Sprint 7.0, Z4) — usada quando `DATABASE_URL`
 * está configurada. Toda idempotência é garantida por `onConflictDoUpdate` sobre os índices únicos
 * de `src/db/schema/stone.ts` (nunca lê-antes-de-escrever para decidir insert vs. update — evita
 * condição de corrida em importação concorrente do mesmo dia).
 */
export class StonePostgresRepository implements StonePersistenceRepository {
  private db() {
    const db = getDb();
    if (!db) throw new Error("Banco de dados não configurado (DATABASE_URL ausente).");
    return db;
  }

  async startImportRun(input: StartImportRunInput): Promise<StoneImportRun> {
    const [row] = await this.db()
      .insert(stoneImportRunsTable)
      .values({
        requestedPeriodFrom: input.requestedPeriodFrom,
        requestedPeriodTo: input.requestedPeriodTo,
        referenceDate: input.referenceDate,
        layout: input.layout,
        origin: input.origin,
        status: "running",
        startedAt: new Date(),
        finishedAt: null,
        recordCount: null,
        errorSanitized: null,
        failureStatus: null,
        failureStage: null,
        failureCategory: null,
        upstreamStatus: null,
        responseContentType: null,
        attemptCount: null,
        elapsedMs: null,
        sanitizedHost: null,
        sanitizedPath: null,
        occurredAt: null,
      })
      .onConflictDoUpdate({
        target: [stoneImportRunsTable.referenceDate, stoneImportRunsTable.layout],
        set: {
          requestedPeriodFrom: input.requestedPeriodFrom,
          requestedPeriodTo: input.requestedPeriodTo,
          origin: input.origin,
          status: "running",
          startedAt: new Date(),
          finishedAt: null,
          errorSanitized: null,
          failureStatus: null,
          failureStage: null,
          failureCategory: null,
          upstreamStatus: null,
          responseContentType: null,
          attemptCount: null,
          elapsedMs: null,
          sanitizedHost: null,
          sanitizedPath: null,
          occurredAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return toImportRun(row);
  }

  async finishImportRun(input: FinishImportRunInput): Promise<StoneImportRun> {
    const [row] = await this.db()
      .update(stoneImportRunsTable)
      .set({
        status: input.status,
        recordCount: input.recordCount,
        errorSanitized: input.errorSanitized,
        failureStatus: input.failureStatus,
        failureStage: input.failureDiagnostics?.stage ?? null,
        failureCategory: input.failureDiagnostics?.category ?? null,
        upstreamStatus: input.failureDiagnostics?.upstreamStatus ?? null,
        responseContentType: input.failureDiagnostics?.responseContentType ?? null,
        attemptCount: input.failureDiagnostics?.attemptCount ?? null,
        elapsedMs: input.failureDiagnostics?.elapsedMs ?? null,
        sanitizedHost: input.failureDiagnostics?.sanitizedHost ?? null,
        sanitizedPath: input.failureDiagnostics?.sanitizedPath ?? null,
        occurredAt: input.failureDiagnostics ? new Date() : null,
        ...(input.fileHash !== null ? { fileHash: input.fileHash } : {}),
        ...(input.prepaymentFeeAmount !== undefined ? { prepaymentFeeAmount: input.prepaymentFeeAmount !== null ? String(input.prepaymentFeeAmount) : null } : {}),
        ...(input.prepaymentDisbursementAmount !== undefined ? { prepaymentDisbursementAmount: input.prepaymentDisbursementAmount !== null ? String(input.prepaymentDisbursementAmount) : null } : {}),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stoneImportRunsTable.id, input.id))
      .returning();
    if (!row) throw new Error(`Import run não encontrada: ${input.id}`);
    return toImportRun(row);
  }

  async getImportRun(referenceDate: string, layout: StoneFileLayout): Promise<StoneImportRun | null> {
    const rows = await this.db()
      .select()
      .from(stoneImportRunsTable)
      .where(and(eq(stoneImportRunsTable.referenceDate, referenceDate), eq(stoneImportRunsTable.layout, layout)))
      .limit(1);
    return rows[0] ? toImportRun(rows[0]) : null;
  }

  async listImportRuns(limit: number): Promise<StoneImportRun[]> {
    const rows = await this.db().select().from(stoneImportRunsTable).orderBy(desc(stoneImportRunsTable.startedAt)).limit(limit);
    return rows.map(toImportRun);
  }

  async getLatestSucceededImportRun(): Promise<StoneImportRun | null> {
    const rows = await this.db()
      .select()
      .from(stoneImportRunsTable)
      .where(eq(stoneImportRunsTable.status, "succeeded"))
      .orderBy(desc(stoneImportRunsTable.finishedAt))
      .limit(1);
    return rows[0] ? toImportRun(rows[0]) : null;
  }

  async upsertNormalizedTransactions(records: StoneNormalizedTransactionRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = this.db();
    await db.transaction(async (tx) => {
      for (const record of records) {
        await tx
          .insert(stoneNormalizedTransactionsTable)
          .values({
            externalKey: record.externalKey,
            acquirerTransactionKey: record.acquirerTransactionKey,
            authorizationCode: record.authorizationCode,
            initiatorTransactionKey: record.initiatorTransactionKey,
            establishmentCode: record.establishmentCode,
            terminalSerialNumber: record.terminalSerialNumber,
            capturedAt: new Date(record.capturedAt),
            installmentNumber: record.installmentNumber,
            grossAmount: String(record.grossAmount),
            feeAmount: String(record.feeAmount),
            netAmount: String(record.netAmount),
            paymentMethod: record.paymentMethod,
            brandId: record.brandId,
            eventType: record.eventType,
            receivableState: record.receivableState,
            expectedPaymentDate: record.expectedPaymentDate,
            settledPaymentDate: record.settledPaymentDate,
            settledAmount: record.settledAmount !== null ? String(record.settledAmount) : null,
            mdrAmountStone: record.mdrAmountStone !== null ? String(record.mdrAmountStone) : null,
            saleFeeCombined: record.saleFeeCombined !== null ? String(record.saleFeeCombined) : null,
            advanceFeeAmountStone: record.advanceFeeAmountStone !== null ? String(record.advanceFeeAmountStone) : null,
            sourceFile: record.sourceFile,
            importRunId: record.importRunId,
          })
          .onConflictDoUpdate({
            target: stoneNormalizedTransactionsTable.externalKey,
            set: {
              eventType: record.eventType,
              receivableState: record.receivableState,
              settledPaymentDate: record.settledPaymentDate,
              settledAmount: record.settledAmount !== null ? String(record.settledAmount) : null,
              mdrAmountStone: record.mdrAmountStone !== null ? String(record.mdrAmountStone) : null,
              saleFeeCombined: record.saleFeeCombined !== null ? String(record.saleFeeCombined) : null,
              advanceFeeAmountStone: record.advanceFeeAmountStone !== null ? String(record.advanceFeeAmountStone) : null,
              sourceFile: record.sourceFile,
              importRunId: record.importRunId,
              updatedAt: new Date(),
            },
          });
      }
    });
  }

  async listNormalizedTransactionsByExpectedDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]> {
    const rows = await this.db()
      .select()
      .from(stoneNormalizedTransactionsTable)
      .where(and(gte(stoneNormalizedTransactionsTable.expectedPaymentDate, fromDate), lte(stoneNormalizedTransactionsTable.expectedPaymentDate, toDate)));
    return rows.map(toNormalizedTransaction);
  }

  async listNormalizedTransactionsBySettledDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]> {
    const rows = await this.db()
      .select()
      .from(stoneNormalizedTransactionsTable)
      .where(and(gte(stoneNormalizedTransactionsTable.settledPaymentDate, fromDate), lte(stoneNormalizedTransactionsTable.settledPaymentDate, toDate)));
    return rows.map(toNormalizedTransaction);
  }

  async listNormalizedTransactionsByCapturedDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]> {
    const rows = await this.db()
      .select()
      .from(stoneNormalizedTransactionsTable)
      .where(and(gte(stoneNormalizedTransactionsTable.capturedAt, new Date(`${fromDate}T00:00:00.000Z`)), lte(stoneNormalizedTransactionsTable.capturedAt, new Date(`${toDate}T23:59:59.999Z`))));
    return rows.map(toNormalizedTransaction);
  }

  async getNormalizedTransactionByExternalKey(externalKey: string): Promise<StoneNormalizedTransactionRecord | null> {
    const rows = await this.db().select().from(stoneNormalizedTransactionsTable).where(eq(stoneNormalizedTransactionsTable.externalKey, externalKey)).limit(1);
    return rows[0] ? toNormalizedTransaction(rows[0]) : null;
  }

  async upsertReconciliationResults(records: StoneReconciliationResultRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = this.db();
    await db.transaction(async (tx) => {
      for (const record of records) {
        await tx
          .insert(stoneReconciliationResultsTable)
          .values({
            naturalKey: record.naturalKey,
            stoneSaleExternalKey: record.stoneSaleExternalKey,
            jumpparkOrderExternalId: record.jumpparkOrderExternalId,
            matchType: record.matchType,
            confidence: record.confidence,
            heuristicScore: record.heuristicScore,
            favorableSignals: record.favorableSignals,
            contrarySignals: record.contrarySignals,
            ruleApplied: record.ruleApplied,
            periodFrom: record.periodFrom,
            periodTo: record.periodTo,
          })
          .onConflictDoUpdate({
            target: stoneReconciliationResultsTable.naturalKey,
            set: {
              confidence: record.confidence,
              heuristicScore: record.heuristicScore,
              favorableSignals: record.favorableSignals,
              contrarySignals: record.contrarySignals,
              ruleApplied: record.ruleApplied,
              periodFrom: record.periodFrom,
              periodTo: record.periodTo,
              updatedAt: new Date(),
            },
          });
      }
    });
  }

  async listReconciliationResults(periodFrom: string, periodTo: string): Promise<StoneReconciliationResultRow[]> {
    const rows = await this.db()
      .select()
      .from(stoneReconciliationResultsTable)
      .where(and(lte(stoneReconciliationResultsTable.periodFrom, periodTo), gte(stoneReconciliationResultsTable.periodTo, periodFrom)));
    return rows.map(toReconciliationResultRow);
  }

  async updateReconciliationReviewStatus(id: string, status: StoneReviewStatus): Promise<StoneReconciliationResultRow> {
    const [row] = await this.db()
      .update(stoneReconciliationResultsTable)
      .set({ reviewStatus: status, updatedAt: new Date() })
      .where(eq(stoneReconciliationResultsTable.id, id))
      .returning();
    if (!row) throw new Error(`Resultado de conciliação não encontrado: ${id}`);
    return toReconciliationResultRow(row);
  }

  async getReconciliationResultById(id: string): Promise<StoneReconciliationResultRow | null> {
    const rows = await this.db().select().from(stoneReconciliationResultsTable).where(eq(stoneReconciliationResultsTable.id, id)).limit(1);
    return rows[0] ? toReconciliationResultRow(rows[0]) : null;
  }

  async upsertDivergences(records: StoneDivergenceRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = this.db();
    await db.transaction(async (tx) => {
      for (const record of records) {
        // Nunca sobrescreve status/assignee/resolutionNote de uma divergência já revisada por um humano.
        await tx
          .insert(stoneDivergencesTable)
          .values({
            naturalKey: record.naturalKey,
            type: record.type,
            priority: record.priority,
            financialImpact: String(record.financialImpact),
            evidence: record.evidence,
            involvedStoneSaleExternalKey: record.involvedStoneSaleExternalKey,
            involvedJumpparkOrderExternalId: record.involvedJumpparkOrderExternalId,
            confidence: record.confidence,
            recommendation: record.recommendation,
            periodFrom: record.periodFrom,
            periodTo: record.periodTo,
          })
          .onConflictDoUpdate({
            target: stoneDivergencesTable.naturalKey,
            set: {
              priority: record.priority,
              financialImpact: String(record.financialImpact),
              evidence: record.evidence,
              confidence: record.confidence,
              recommendation: record.recommendation,
              periodFrom: record.periodFrom,
              periodTo: record.periodTo,
              updatedAt: new Date(),
            },
          });
      }
    });
  }

  async listDivergences(filter?: { status?: StoneReviewStatus }): Promise<StoneDivergenceRow[]> {
    const query = this.db().select().from(stoneDivergencesTable);
    const rows = filter?.status ? await query.where(eq(stoneDivergencesTable.status, filter.status)) : await query;
    return rows.map(toDivergenceRow);
  }

  async updateDivergenceReview(input: UpdateDivergenceReviewInput): Promise<StoneDivergenceRow> {
    const [row] = await this.db()
      .update(stoneDivergencesTable)
      .set({
        status: input.status,
        ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
        ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote } : {}),
        resolvedAt: input.status === "resolved" ? new Date() : sql`${stoneDivergencesTable.resolvedAt}`,
        updatedAt: new Date(),
      })
      .where(eq(stoneDivergencesTable.id, input.id))
      .returning();
    if (!row) throw new Error(`Divergência não encontrada: ${input.id}`);
    return toDivergenceRow(row);
  }
}
