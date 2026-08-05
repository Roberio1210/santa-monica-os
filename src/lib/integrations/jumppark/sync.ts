import "server-only";
import { count, desc, eq, inArray } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { jumpParkServiceOrders, jumpParkSyncLogs } from "@/db/schema/jumppark";
import { fetchServiceOrders, mapOperationOrders, JumpParkNotConfiguredError, JumpParkRequestError } from "./service";
import { jumpParkLogger } from "./logger";

export type JumpParkSyncLogRow = typeof jumpParkSyncLogs.$inferSelect;

export interface JumpParkSyncStatus {
  databaseConfigured: boolean;
  lastLog: JumpParkSyncLogRow | null;
  currentOrderCount: number;
}

/** Estado atual para a tela `/admin/jumppark-sync` — última execução + contagem real na tabela. */
export async function fetchJumpParkSyncStatus(): Promise<JumpParkSyncStatus> {
  if (!isDatabaseConfigured()) return { databaseConfigured: false, lastLog: null, currentOrderCount: 0 };
  const db = getDb();
  if (!db) return { databaseConfigured: false, lastLog: null, currentOrderCount: 0 };

  const [lastLogRows, countRows] = await Promise.all([
    db.select().from(jumpParkSyncLogs).orderBy(desc(jumpParkSyncLogs.startedAt)).limit(1),
    db.select({ value: count() }).from(jumpParkServiceOrders),
  ]);

  return {
    databaseConfigured: true,
    lastLog: lastLogRows[0] ?? null,
    currentOrderCount: countRows[0]?.value ?? 0,
  };
}

/**
 * Sincronização JumpPark → Neon (Missão 26, Fase 1 — primeira entrega: só Service Orders).
 * Implementa exatamente o que `docs/jumppark-sync-strategy.md` já documentava e nunca tinha sido
 * escrito: upsert idempotente por `external_id`, um `jumppark_sync_logs` por execução,
 * `errorMessage` sempre sanitizado. Não persiste `rawPayloadSanitized` nesta primeira entrega —
 * campo opcional no schema, fica para quando algum consumidor real precisar dele.
 *
 * Deliberadamente sem repositório memory/postgres (padrão do resto do projeto): uma sincronização
 * para o Neon não tem nenhum sentido em modo memória (o resultado desapareceria no próximo cold
 * start) — construir esse modo aqui seria a otimização/abstração prematura que a missão pediu
 * para evitar.
 *
 * Upsert é feito linha a linha (não em lote com `excluded.*`) para seguir o mesmo padrão já usado
 * em todo o resto do projeto (`attendance/postgres-repository.ts`, `stone/persistence/*`) — nenhum
 * outro upsert deste código usa `sql`excluded.x``, e o volume esperado por sincronização (dezenas
 * a poucas centenas de ordens) não justifica a complexidade extra.
 */

export type SyncStatus = "success" | "error";

export interface SyncServiceOrdersResult {
  status: SyncStatus | "not_configured";
  dateRangeStart: string;
  dateRangeEnd: string;
  ordersFetched: number;
  ordersInserted: number;
  ordersUpdated: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errorMessage: string | null;
}

export function sanitizeError(error: unknown): string {
  if (error instanceof JumpParkNotConfiguredError) return "JumpPark não configurado neste ambiente.";
  if (error instanceof JumpParkRequestError) return `Falha na requisição à API do JumpPark (HTTP ${error.status}).`;
  if (error instanceof Error) {
    if (error.name === "AbortError") return "A API do JumpPark não respondeu a tempo (timeout).";
    return "Falha ao sincronizar com o JumpPark.";
  }
  return "Falha desconhecida ao sincronizar com o JumpPark.";
}

/**
 * Busca ordens finalizadas no intervalo, faz upsert idempotente em `jumppark_service_orders` e
 * registra o resultado em `jumppark_sync_logs`. Nunca lança — toda falha vira `status: "error"`
 * com `errorMessage` sanitizado.
 */
export async function syncJumpParkServiceOrders(dateRangeStart: string, dateRangeEnd: string): Promise<SyncServiceOrdersResult> {
  const startedAt = new Date();

  if (!isDatabaseConfigured()) {
    return {
      status: "not_configured",
      dateRangeStart,
      dateRangeEnd,
      ordersFetched: 0,
      ordersInserted: 0,
      ordersUpdated: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      errorMessage: "Banco de dados (Neon) não configurado neste ambiente.",
    };
  }

  const db = getDb();
  if (!db) throw new Error("isDatabaseConfigured() retornou true mas getDb() retornou null — invariante quebrado.");

  const [logRow] = await db
    .insert(jumpParkSyncLogs)
    .values({ startedAt, status: "running", dateRangeStart, dateRangeEnd, source: "jumppark" })
    .returning({ id: jumpParkSyncLogs.id });

  try {
    jumpParkLogger.info("Iniciando sincronização de Service Orders.", { dateRangeStart, dateRangeEnd });
    const rawOrders = await fetchServiceOrders(dateRangeStart, dateRangeEnd);
    const orders = mapOperationOrders(rawOrders);

    let ordersInserted = 0;
    let ordersUpdated = 0;

    if (orders.length > 0) {
      const externalIds = orders.map((o) => o.id);
      const existingRows = await db.select({ externalId: jumpParkServiceOrders.externalId }).from(jumpParkServiceOrders).where(inArray(jumpParkServiceOrders.externalId, externalIds));
      const existingIds = new Set(existingRows.map((r) => r.externalId));

      for (const order of orders) {
        const values = {
          externalId: order.id,
          code: order.code,
          entryTime: order.entryTime,
          exitTime: order.exitTime,
          orderDate: order.date ?? dateRangeEnd,
          plateMasked: order.plateMasked,
          vehicleModel: order.vehicleModel,
          clientName: order.clientName,
          clientPhoneMasked: order.clientPhoneMasked,
          parkingAmount: String(order.parkingAmount),
          servicesAmount: String(order.servicesAmount),
          totalAmount: String(order.totalAmount),
          paymentMethod: order.paymentMethod,
          situation: order.situation,
          source: "jumppark" as const,
        };

        await db
          .insert(jumpParkServiceOrders)
          .values(values)
          .onConflictDoUpdate({ target: jumpParkServiceOrders.externalId, set: { ...values, updatedAt: new Date() } });

        if (existingIds.has(order.id)) ordersUpdated += 1;
        else ordersInserted += 1;
      }
    }

    const finishedAt = new Date();
    await db
      .update(jumpParkSyncLogs)
      .set({ finishedAt, status: "success", ordersFetched: orders.length, ordersInserted, ordersUpdated, updatedAt: new Date() })
      .where(eq(jumpParkSyncLogs.id, logRow.id));

    jumpParkLogger.info("Sincronização concluída.", { dateRangeStart, dateRangeEnd, ordersFetched: orders.length, ordersInserted, ordersUpdated });

    return {
      status: "success",
      dateRangeStart,
      dateRangeEnd,
      ordersFetched: orders.length,
      ordersInserted,
      ordersUpdated,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorMessage: null,
    };
  } catch (error) {
    const finishedAt = new Date();
    const errorMessage = sanitizeError(error);
    jumpParkLogger.error("Falha na sincronização.", { dateRangeStart, dateRangeEnd, errorMessage });

    await db
      .update(jumpParkSyncLogs)
      .set({ finishedAt, status: "error", errorMessage, updatedAt: new Date() })
      .where(eq(jumpParkSyncLogs.id, logRow.id));

    return {
      status: "error",
      dateRangeStart,
      dateRangeEnd,
      ordersFetched: 0,
      ordersInserted: 0,
      ordersUpdated: 0,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorMessage,
    };
  }
}
