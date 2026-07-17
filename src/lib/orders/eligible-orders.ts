import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryConsumptionConfirmations } from "@/db/schema";
import { isJumpParkConfigured } from "@/lib/config/env";
import { fetchServiceOrders, JumpParkNotConfiguredError } from "@/lib/integrations/jumppark";
import { maskPlate } from "@/lib/utils/mask";
import { normalizePlate } from "@/lib/orders/plate";
import { registerSeenServiceNames } from "@/lib/orders/service-mapping";
import type { ConsumptionConfirmationStatus, EligibleOrder } from "@/lib/orders/types";

function timeOnly(dateTime?: string): string | null {
  if (!dateTime) return null;
  const time = dateTime.split(" ")[1];
  return time ? time.slice(0, 5) : null;
}

function dateOnly(dateTime?: string): string | null {
  if (!dateTime) return null;
  return dateTime.slice(0, 10);
}

interface ConfirmationSummary {
  activeConfirmationId: string | null;
  latestConfirmationStatus: ConsumptionConfirmationStatus | null;
}

/** Uma ordem tem no máximo uma confirmação "ativa" (confirmada/parcial) por vez — a mais recente não estornada. */
async function fetchConfirmationSummaries(): Promise<Map<string, ConfirmationSummary>> {
  const db = getDb();
  const map = new Map<string, ConfirmationSummary>();
  if (!db) return map;

  const rows = await db.select().from(inventoryConsumptionConfirmations).where(eq(inventoryConsumptionConfirmations.active, true)).orderBy(desc(inventoryConsumptionConfirmations.version));

  for (const row of rows) {
    const existing = map.get(row.jumpparkOrderExternalId);
    if (!existing) {
      map.set(row.jumpparkOrderExternalId, {
        activeConfirmationId: row.status === "estornada" ? null : row.id,
        latestConfirmationStatus: row.status as ConsumptionConfirmationStatus,
      });
    }
  }
  return map;
}

export interface EligibleOrdersResult {
  orders: EligibleOrder[];
  jumpparkConfigured: boolean;
  error: string | null;
}

/**
 * Ordens reais finalizadas do JumpPark num período (Fase D, seção 3) — nunca inventa ordem.
 * Registra automaticamente (sem mapear) qualquer texto de serviço nunca antes visto, para que
 * fique visível em /estoque/mapeamentos.
 */
export async function fetchEligibleOrders(startDate: string, endDate: string): Promise<EligibleOrdersResult> {
  const jumpparkConfigured = isJumpParkConfigured();
  if (!jumpparkConfigured) {
    return { orders: [], jumpparkConfigured: false, error: "JumpPark não configurado neste ambiente." };
  }

  try {
    const [rawOrders, confirmationSummaries] = await Promise.all([fetchServiceOrders(startDate, endDate), fetchConfirmationSummaries()]);

    const finalized = rawOrders.filter((o) => !!o.exitDateTime && !!o.serviceOrderId);
    const allServiceNames = finalized.flatMap((o) => (o.services ?? []).map((s) => s.description ?? s.name ?? "").filter(Boolean));
    await registerSeenServiceNames(allServiceNames);

    const orders: EligibleOrder[] = finalized.map((order) => {
      const externalId = order.serviceOrderId as string;
      const confirmation = confirmationSummaries.get(externalId) ?? { activeConfirmationId: null, latestConfirmationStatus: null };
      return {
        externalId,
        date: dateOnly(order.exitDateTime) ?? dateOnly(order.entryDateTime) ?? startDate,
        time: timeOnly(order.exitDateTime),
        clientName: order.clientName ?? null,
        vehicleModel: order.vehicleModel ?? "Não informado",
        plateMasked: maskPlate(order.plate),
        plateNormalized: normalizePlate(order.plate),
        services: (order.services ?? []).map((s) => ({ description: s.description ?? s.name ?? "Serviço", amount: Number(s.amount ?? 0) })),
        totalAmount: Number(order.totalAmount ?? Number(order.amount ?? 0) + Number(order.amountServices ?? 0)),
        situation: order.financialSituationName ?? order.operationSituationName ?? "Não informado",
        activeConfirmationId: confirmation.activeConfirmationId,
        latestConfirmationStatus: confirmation.latestConfirmationStatus,
      };
    });

    orders.sort((a, b) => `${b.date}${b.time ?? ""}`.localeCompare(`${a.date}${a.time ?? ""}`));
    return { orders, jumpparkConfigured: true, error: null };
  } catch (err) {
    const message = err instanceof JumpParkNotConfiguredError ? err.message : err instanceof Error ? err.message : "Falha ao carregar ordens do JumpPark.";
    return { orders: [], jumpparkConfigured, error: message };
  }
}

export async function fetchEligibleOrderByExternalId(startDate: string, endDate: string, externalId: string): Promise<EligibleOrder | null> {
  const result = await fetchEligibleOrders(startDate, endDate);
  return result.orders.find((o) => o.externalId === externalId) ?? null;
}
