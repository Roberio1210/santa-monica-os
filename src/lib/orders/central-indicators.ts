import "server-only";
import { fetchEligibleOrders } from "@/lib/orders/eligible-orders";
import { fetchOrderPreview } from "@/lib/orders/preview-service";
import { listConsumptionConfirmations } from "@/lib/orders/consumption-history";
import { isJumpParkConfigured } from "@/lib/config/env";

export interface OrdersConsumptionIndicators {
  totalOrders: number;
  awaitingAnalysis: number;
  blockedByCategory: number;
  unmappedService: number;
  withoutApprovedRecipe: number;
  previewsAwaitingConfirmation: number;
  divergentConfirmations: number;
  reversedConsumptions: number;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Indicadores reais para a Central de Operações (Fase D, seção 13) — recalculados a cada
 * acesso, nunca persistidos. Janela de 30 dias, igual ao padrão de /estoque/ordens.
 */
export async function fetchOrdersConsumptionIndicators(): Promise<OrdersConsumptionIndicators | null> {
  if (!isJumpParkConfigured()) return null;

  const startDate = isoDate(30);
  const endDate = isoDate(0);
  const result = await fetchEligibleOrders(startDate, endDate);

  let blockedByCategory = 0;
  let unmappedService = 0;
  let withoutApprovedRecipe = 0;
  let previewsAwaitingConfirmation = 0;
  let awaitingAnalysis = 0;

  for (const order of result.orders) {
    if (order.activeConfirmationId) continue;
    awaitingAnalysis += 1;

    const preview = await fetchOrderPreview(order);
    if (preview.vehicleCategory === "desconhecido") blockedByCategory += 1;
    if (preview.unmappedServices.length > 0) unmappedService += 1;
    if (preview.servicesWithoutApprovedRecipe.length > 0) withoutApprovedRecipe += 1;
    if (preview.state === "pronta" || preview.state === "parcial") previewsAwaitingConfirmation += 1;
  }

  const confirmations = await listConsumptionConfirmations();
  const divergentConfirmations = confirmations.filter(
    (c) => c.status !== "estornada" && c.lines.some((l) => l.difference !== null && Math.abs(l.difference) > 0.001),
  ).length;
  const reversedConsumptions = confirmations.filter((c) => c.status === "estornada").length;

  return {
    totalOrders: result.orders.length,
    awaitingAnalysis,
    blockedByCategory,
    unmappedService,
    withoutApprovedRecipe,
    previewsAwaitingConfirmation,
    divergentConfirmations,
    reversedConsumptions,
  };
}
