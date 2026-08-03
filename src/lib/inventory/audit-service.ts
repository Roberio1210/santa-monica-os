import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { listConsumptionConfirmations } from "@/lib/jumppark-orders/consumption-history";
import { auditDataQuality, type DataQualityAuditResult } from "@/lib/inventory/data-quality-audit";
import { findDuplicateSuspects, type DuplicateSuspect } from "@/lib/inventory/duplicate-detection";
import { computeHealthIndex, type HealthIndexResult } from "@/lib/inventory/health-index";
import { listResolvedDuplicatePairs } from "@/lib/inventory/duplicate-decisions";
import { buildAuditReportRows, auditReportRowsToCsv } from "@/lib/inventory/audit-report";
import { computePurchaseStatsForItems, type ItemPurchaseStats } from "@/lib/inventory/purchase-audit";
import type { InventoryItem, StockMovement } from "@/lib/inventory/types";

/**
 * Orquestrador de I/O da Auditoria (Missão 23) — busca tudo em paralelo e entrega para as
 * páginas em `/estoque/auditoria` já pronto para exibir. Nenhum cálculo de negócio mora aqui:
 * tudo isso vem das funções puras já testadas (`data-quality-audit.ts`, `duplicate-detection.ts`,
 * `health-index.ts`, `audit-report.ts`, `purchase-audit.ts`) — este arquivo só busca dados e
 * monta o pacote.
 */

export interface DuplicateSuspectWithStatus extends DuplicateSuspect {
  resolved: boolean;
}

export interface AuditSummary {
  items: InventoryItem[];
  movements: StockMovement[];
  dataQuality: DataQualityAuditResult;
  duplicates: DuplicateSuspectWithStatus[];
  unresolvedDuplicateCount: number;
  healthIndex: HealthIndexResult;
  itemById: Map<string, InventoryItem>;
}

export async function fetchAuditSummary(): Promise<AuditSummary> {
  const [items, movements, recipes, confirmations, resolvedPairs] = await Promise.all([
    getInventoryRepository().listItems(),
    getInventoryRepository().listMovements(),
    getRecipeRepository().listRecipes(),
    listConsumptionConfirmations(),
    listResolvedDuplicatePairs(),
  ]);

  const extraConsumptionItemIds = new Set<string>();
  for (const confirmation of confirmations) {
    for (const line of confirmation.lines) {
      if (line.isExtra) extraConsumptionItemIds.add(line.itemId);
    }
  }

  const dataQuality = auditDataQuality({
    items,
    movements,
    recipes: recipes.map((r) => ({ id: r.id, itemId: r.itemId, isActiveVersion: r.isActiveVersion })),
    extraConsumptionItemIds,
  });

  const rawDuplicates = findDuplicateSuspects(items);
  const duplicates: DuplicateSuspectWithStatus[] = rawDuplicates.map((suspect) => {
    const [a, b] = suspect.itemAId < suspect.itemBId ? [suspect.itemAId, suspect.itemBId] : [suspect.itemBId, suspect.itemAId];
    return { ...suspect, resolved: resolvedPairs.has(`${a}:${b}`) };
  });
  const unresolvedDuplicateCount = duplicates.filter((d) => !d.resolved).length;

  const movementsWithoutResponsible = movements.filter((m) => !m.responsible || !m.responsible.trim()).length;
  const healthIndex = computeHealthIndex({
    summary: dataQuality.summary,
    unresolvedDuplicateSuspectCount: unresolvedDuplicateCount,
    totalMovements: movements.length,
    movementsWithoutResponsible,
  });

  return { items, movements, dataQuality, duplicates, unresolvedDuplicateCount, healthIndex, itemById: new Map(items.map((i) => [i.id, i])) };
}

/** Seção 11 — exportação CSV. Recalcula o mesmo pacote da tela (sem cache) para nunca divergir do que o usuário viu. */
export async function exportAuditReportCsv(): Promise<string> {
  const summary = await fetchAuditSummary();
  const rows = buildAuditReportRows(summary.items, summary.dataQuality.issues, summary.duplicates);
  return auditReportRowsToCsv(rows);
}

/** Seção 10 — Auditoria de Compras por Produto, só para itens que já têm ao menos uma movimentação de compra. */
export async function fetchPurchaseAuditStats(): Promise<Map<string, ItemPurchaseStats>> {
  const [items, movements] = await Promise.all([getInventoryRepository().listItems(), getInventoryRepository().listMovements()]);
  const liveItemIds = items.filter((i) => i.canonicalItemId === null).map((i) => i.id);
  const all = computePurchaseStatsForItems(liveItemIds, movements);
  const withHistory = new Map<string, ItemPurchaseStats>();
  for (const [id, stats] of all) if (stats.purchaseCount > 0) withHistory.set(id, stats);
  return withHistory;
}
