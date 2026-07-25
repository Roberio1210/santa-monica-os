import "server-only";
import { isStoneConfigured } from "@/lib/config/env";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import type { DivergenceType, DivergencePriority } from "@/lib/integrations/stone/divergences";
import type { StoneResultStatus } from "@/lib/integrations/stone/types";

/**
 * Resumo das divergências já persistidas (Sprint 7.0, Z4) — capacidade nova do Diretor Financeiro.
 * Lê `stone_divergences` (persistido pelo pipeline de importação, `persistence/importRun.ts`),
 * nunca recalcula nada — se nenhuma sincronização rodou ainda, o resumo é honestamente vazio.
 */
export interface StoneDivergencesSummary {
  status: StoneResultStatus;
  error: string | null;
  limitations: string[];
  totalCount: number;
  openCount: number;
  highPriorityOpenCount: number;
  byType: Partial<Record<DivergenceType, number>>;
  byPriority: Partial<Record<DivergencePriority, number>>;
}

export async function buildDivergencesSummary(): Promise<StoneDivergencesSummary> {
  if (!isStoneConfigured()) {
    return { status: "not_configured", error: "Integração Stone não configurada neste ambiente.", limitations: ["STONE_API_KEY/STONE_ACCOUNT_ID ausentes."], totalCount: 0, openCount: 0, highPriorityOpenCount: 0, byType: {}, byPriority: {} };
  }

  const divergences = await getStonePersistenceRepository().listDivergences();
  const open = divergences.filter((d) => d.status !== "resolved" && d.status !== "ignored");

  const byType: Partial<Record<DivergenceType, number>> = {};
  const byPriority: Partial<Record<DivergencePriority, number>> = {};
  for (const d of divergences) {
    byType[d.type] = (byType[d.type] ?? 0) + 1;
    byPriority[d.priority] = (byPriority[d.priority] ?? 0) + 1;
  }

  const limitations = divergences.length === 0 ? ["Nenhuma sincronização com divergências calculadas ainda — sincronize a Stone Conciliação para gerar este resumo."] : [];

  return {
    status: "ok",
    error: null,
    limitations,
    totalCount: divergences.length,
    openCount: open.length,
    highPriorityOpenCount: open.filter((d) => d.priority === "alta").length,
    byType,
    byPriority,
  };
}
