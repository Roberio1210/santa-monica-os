import "server-only";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { jumpParkSyncLogs } from "@/db/schema/jumppark";
import { syncJumpParkServiceOrders } from "./sync";
import { addDaysIso, isValidIsoDate } from "@/lib/utils/timezone";
import { jumpParkLogger } from "./logger";

/**
 * Backfill histórico JumpPark → Neon (Missão 27) — reaproveita 100% `syncJumpParkServiceOrders`
 * (idempotente, um `jumppark_sync_logs` por lote) já entregue na Missão 26: um "lote" de backfill
 * é simplesmente uma chamada dessa função com um intervalo de datas menor. Resumível "de graça":
 * um lote com log de sucesso (`status = 'success'`, mesmo `date_range_start`/`date_range_end`)
 * nunca é reprocessado; um lote que falhou nunca fica marcado como concluído, então a próxima
 * execução tenta de novo automaticamente — sem precisar de nenhuma tabela nova de controle.
 *
 * Limite conhecido: os limites de cada lote são recalculados a partir de `overallStart`/`batchDays`
 * a cada chamada — se esses parâmetros mudarem entre execuções, os lotes não vão bater exatamente
 * com os já registrados e alguns intervalos podem ser reprocessados. Não há problema de correção
 * (upsert por `external_id` continua idempotente), só desperdício de chamadas à API.
 */

export interface BackfillDateRange {
  start: string;
  end: string;
}

/** Pura — divide [overallStart, overallEnd] em lotes de até `batchDays` dias, sem sobreposição. */
export function splitDateRangeIntoBatches(overallStart: string, overallEnd: string, batchDays: number): BackfillDateRange[] {
  if (!isValidIsoDate(overallStart) || !isValidIsoDate(overallEnd)) return [];
  if (overallStart > overallEnd) return [];
  if (!Number.isInteger(batchDays) || batchDays < 1) return [];

  const batches: BackfillDateRange[] = [];
  let cursor = overallStart;
  while (cursor <= overallEnd) {
    const tentativeEnd = addDaysIso(cursor, batchDays - 1);
    const end = tentativeEnd > overallEnd ? overallEnd : tentativeEnd;
    batches.push({ start: cursor, end });
    cursor = addDaysIso(end, 1);
  }
  return batches;
}

export interface BackfillBatchResult extends BackfillDateRange {
  status: "success" | "error";
  ordersFetched: number;
  ordersInserted: number;
  ordersUpdated: number;
  serviceItemsPersisted: number;
  errorMessage: string | null;
}

export interface RunHistoricalBackfillOptions {
  overallStart: string;
  overallEnd: string;
  /** Tamanho de cada lote em dias — padrão 14 (equilíbrio entre poucas chamadas e resposta rápida por lote). */
  batchDays?: number;
  /** Teto de lotes processados nesta chamada — padrão sem teto (só o orçamento de tempo decide). */
  maxBatchesPerRun?: number;
  /** Orçamento de tempo desta chamada em ms — evita estourar timeout de função serverless. Padrão 50s. */
  maxDurationMs?: number;
}

export interface BackfillRunResult {
  overallStart: string;
  overallEnd: string;
  batchDays: number;
  totalBatches: number;
  batchesAlreadyDone: number;
  batchesProcessedThisRun: number;
  batchesRemaining: number;
  ordersFetched: number;
  ordersInserted: number;
  ordersUpdated: number;
  serviceItemsPersisted: number;
  /** Só os lotes que falharam NESTA execução — lotes já com erro de execuções anteriores são automaticamente tentados de novo (não ficam "presos"). */
  batchesWithError: BackfillBatchResult[];
  /** true quando não sobrou nenhum lote pendente após esta execução. */
  finished: boolean;
  databaseConfigured: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

function zeroTotals() {
  return { ordersFetched: 0, ordersInserted: 0, ordersUpdated: 0, serviceItemsPersisted: 0 };
}

/**
 * Executa o backfill histórico em lotes, pulando os já concluídos com sucesso, dentro de um
 * orçamento de tempo (para nunca estourar timeout de função serverless). Chamar de novo com os
 * mesmos `overallStart`/`overallEnd`/`batchDays` continua exatamente de onde parou — não duplica,
 * não apaga nada, nunca lança (cada lote trata seu próprio erro, como `syncJumpParkServiceOrders`
 * já faz).
 */
export async function runHistoricalBackfill(options: RunHistoricalBackfillOptions): Promise<BackfillRunResult> {
  const startedAt = new Date();
  const batchDays = options.batchDays ?? 14;
  const maxDurationMs = options.maxDurationMs ?? 50_000;
  const maxBatchesPerRun = options.maxBatchesPerRun ?? Number.POSITIVE_INFINITY;

  const allBatches = splitDateRangeIntoBatches(options.overallStart, options.overallEnd, batchDays);

  if (!isDatabaseConfigured() || allBatches.length === 0) {
    const finishedAt = new Date();
    return {
      overallStart: options.overallStart,
      overallEnd: options.overallEnd,
      batchDays,
      totalBatches: allBatches.length,
      batchesAlreadyDone: 0,
      batchesProcessedThisRun: 0,
      batchesRemaining: allBatches.length,
      ...zeroTotals(),
      batchesWithError: [],
      finished: allBatches.length === 0,
      databaseConfigured: isDatabaseConfigured(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
  }

  const db = getDb();
  if (!db) throw new Error("isDatabaseConfigured() retornou true mas getDb() retornou null — invariante quebrado.");

  const doneRows = await db
    .select({ dateRangeStart: jumpParkSyncLogs.dateRangeStart, dateRangeEnd: jumpParkSyncLogs.dateRangeEnd })
    .from(jumpParkSyncLogs)
    .where(eq(jumpParkSyncLogs.status, "success"));
  const doneKeys = new Set(doneRows.map((r) => `${r.dateRangeStart}|${r.dateRangeEnd}`));

  const pendingBatches = allBatches.filter((b) => !doneKeys.has(`${b.start}|${b.end}`));
  const batchesAlreadyDone = allBatches.length - pendingBatches.length;

  jumpParkLogger.info("Iniciando lote de backfill histórico.", {
    overallStart: options.overallStart,
    overallEnd: options.overallEnd,
    batchDays,
    totalBatches: allBatches.length,
    batchesAlreadyDone,
    batchesPending: pendingBatches.length,
  });

  const batchResults: BackfillBatchResult[] = [];
  let processed = 0;

  for (const batch of pendingBatches) {
    if (processed >= maxBatchesPerRun) break;
    if (Date.now() - startedAt.getTime() > maxDurationMs) break;

    const result = await syncJumpParkServiceOrders(batch.start, batch.end);
    batchResults.push({
      ...batch,
      status: result.status === "success" ? "success" : "error",
      ordersFetched: result.ordersFetched,
      ordersInserted: result.ordersInserted,
      ordersUpdated: result.ordersUpdated,
      serviceItemsPersisted: result.serviceItemsPersisted,
      errorMessage: result.errorMessage,
    });
    processed += 1;
  }

  const totals = batchResults.reduce(
    (acc, r) => ({
      ordersFetched: acc.ordersFetched + r.ordersFetched,
      ordersInserted: acc.ordersInserted + r.ordersInserted,
      ordersUpdated: acc.ordersUpdated + r.ordersUpdated,
      serviceItemsPersisted: acc.serviceItemsPersisted + r.serviceItemsPersisted,
    }),
    zeroTotals(),
  );

  const batchesWithError = batchResults.filter((r) => r.status === "error");
  const batchesRemaining = pendingBatches.length - processed;
  const finishedAt = new Date();

  jumpParkLogger.info("Lote de backfill histórico concluído.", {
    batchesProcessedThisRun: processed,
    batchesRemaining,
    batchesWithError: batchesWithError.length,
    ...totals,
  });

  return {
    overallStart: options.overallStart,
    overallEnd: options.overallEnd,
    batchDays,
    totalBatches: allBatches.length,
    batchesAlreadyDone,
    batchesProcessedThisRun: processed,
    batchesRemaining,
    ...totals,
    batchesWithError,
    finished: batchesRemaining === 0,
    databaseConfigured: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}
