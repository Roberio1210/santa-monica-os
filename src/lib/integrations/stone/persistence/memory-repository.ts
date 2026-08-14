import "server-only";
import { randomUUID } from "node:crypto";
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

/**
 * Implementação em memória (não persistente entre reinícios do processo) — usada quando
 * `DATABASE_URL` não está configurada, mesmo padrão de `finance/static-repository.ts`. Reproduz
 * fielmente a semântica de idempotência da versão Postgres (upsert por chave, nunca duplica,
 * nunca sobrescreve revisão humana) para que os mesmos testes validem os dois caminhos.
 */
export class StoneMemoryRepository implements StonePersistenceRepository {
  private importRuns = new Map<string, StoneImportRun>();
  private normalizedTransactions = new Map<string, StoneNormalizedTransactionRecord>();
  private reconciliationResults = new Map<string, StoneReconciliationResultRow>();
  private divergences = new Map<string, StoneDivergenceRow>();

  private importRunKey(referenceDate: string, layout: StoneFileLayout): string {
    return `${referenceDate}|${layout}`;
  }

  async startImportRun(input: StartImportRunInput): Promise<StoneImportRun> {
    const key = this.importRunKey(input.referenceDate, input.layout);
    const now = new Date().toISOString();
    const existing = this.importRuns.get(key);
    const run: StoneImportRun = {
      id: existing?.id ?? randomUUID(),
      requestedPeriodFrom: input.requestedPeriodFrom,
      requestedPeriodTo: input.requestedPeriodTo,
      referenceDate: input.referenceDate,
      layout: input.layout,
      fileHash: existing?.fileHash ?? null,
      startedAt: now,
      finishedAt: null,
      status: "running",
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
      origin: input.origin,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.importRuns.set(key, run);
    return run;
  }

  async finishImportRun(input: FinishImportRunInput): Promise<StoneImportRun> {
    const existing = [...this.importRuns.values()].find((r) => r.id === input.id);
    if (!existing) throw new Error(`Import run não encontrada: ${input.id}`);
    const updated: StoneImportRun = {
      ...existing,
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
      occurredAt: input.failureDiagnostics ? new Date().toISOString() : null,
      fileHash: input.fileHash ?? existing.fileHash,
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.importRuns.set(this.importRunKey(existing.referenceDate, existing.layout), updated);
    return updated;
  }

  async getImportRun(referenceDate: string, layout: StoneFileLayout): Promise<StoneImportRun | null> {
    return this.importRuns.get(this.importRunKey(referenceDate, layout)) ?? null;
  }

  async listImportRuns(limit: number): Promise<StoneImportRun[]> {
    return [...this.importRuns.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }

  async getLatestSucceededImportRun(): Promise<StoneImportRun | null> {
    const succeeded = [...this.importRuns.values()].filter((r) => r.status === "succeeded");
    if (succeeded.length === 0) return null;
    return succeeded.sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0];
  }

  async upsertNormalizedTransactions(records: StoneNormalizedTransactionRecord[]): Promise<void> {
    for (const record of records) this.normalizedTransactions.set(record.externalKey, record);
  }

  async listNormalizedTransactionsByExpectedDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]> {
    return [...this.normalizedTransactions.values()].filter((r) => r.expectedPaymentDate !== null && r.expectedPaymentDate >= fromDate && r.expectedPaymentDate <= toDate);
  }

  async listNormalizedTransactionsBySettledDateRange(fromDate: string, toDate: string): Promise<StoneNormalizedTransactionRecord[]> {
    return [...this.normalizedTransactions.values()].filter((r) => r.settledPaymentDate !== null && r.settledPaymentDate >= fromDate && r.settledPaymentDate <= toDate);
  }

  async getNormalizedTransactionByExternalKey(externalKey: string): Promise<StoneNormalizedTransactionRecord | null> {
    return this.normalizedTransactions.get(externalKey) ?? null;
  }

  async upsertReconciliationResults(records: StoneReconciliationResultRecord[]): Promise<void> {
    const now = new Date().toISOString();
    for (const record of records) {
      const existing = this.reconciliationResults.get(record.naturalKey);
      this.reconciliationResults.set(record.naturalKey, {
        ...record,
        id: existing?.id ?? randomUUID(),
        reviewStatus: existing?.reviewStatus ?? "open",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    }
  }

  async listReconciliationResults(periodFrom: string, periodTo: string): Promise<StoneReconciliationResultRow[]> {
    return [...this.reconciliationResults.values()].filter((r) => r.periodFrom <= periodTo && r.periodTo >= periodFrom);
  }

  async updateReconciliationReviewStatus(id: string, status: StoneReviewStatus): Promise<StoneReconciliationResultRow> {
    const entry = [...this.reconciliationResults.entries()].find(([, r]) => r.id === id);
    if (!entry) throw new Error(`Resultado de conciliação não encontrado: ${id}`);
    const [key, row] = entry;
    const updated: StoneReconciliationResultRow = { ...row, reviewStatus: status, updatedAt: new Date().toISOString() };
    this.reconciliationResults.set(key, updated);
    return updated;
  }

  async getReconciliationResultById(id: string): Promise<StoneReconciliationResultRow | null> {
    return [...this.reconciliationResults.values()].find((r) => r.id === id) ?? null;
  }

  async upsertDivergences(records: StoneDivergenceRecord[]): Promise<void> {
    const now = new Date().toISOString();
    for (const record of records) {
      const existing = this.divergences.get(record.naturalKey);
      // Nunca sobrescreve status/assignee/resolutionNote de uma divergência já revisada — só os campos factuais.
      this.divergences.set(record.naturalKey, {
        ...record,
        id: existing?.id ?? randomUUID(),
        status: existing?.status ?? "open",
        assignee: existing?.assignee ?? null,
        resolutionNote: existing?.resolutionNote ?? null,
        resolvedAt: existing?.resolvedAt ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    }
  }

  async listDivergences(filter?: { status?: StoneReviewStatus }): Promise<StoneDivergenceRow[]> {
    const all = [...this.divergences.values()];
    if (!filter?.status) return all;
    return all.filter((d) => d.status === filter.status);
  }

  async updateDivergenceReview(input: UpdateDivergenceReviewInput): Promise<StoneDivergenceRow> {
    const entry = [...this.divergences.entries()].find(([, d]) => d.id === input.id);
    if (!entry) throw new Error(`Divergência não encontrada: ${input.id}`);
    const [key, row] = entry;
    const updated: StoneDivergenceRow = {
      ...row,
      status: input.status,
      assignee: input.assignee !== undefined ? input.assignee : row.assignee,
      resolutionNote: input.resolutionNote !== undefined ? input.resolutionNote : row.resolutionNote,
      resolvedAt: input.status === "resolved" ? new Date().toISOString() : row.resolvedAt,
      updatedAt: new Date().toISOString(),
    };
    this.divergences.set(key, updated);
    return updated;
  }
}
