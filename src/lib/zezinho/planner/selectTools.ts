import type { PeriodRange } from "@/lib/utils/timezone";
import type { ExtractedEntities, ZezinhoIntent } from "@/lib/zezinho/intent/types";
import type { BusinessObjective } from "@/lib/zezinho/objective/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";
import { TOOL_REGISTRY } from "@/lib/zezinho/tools/registry";
import type { ToolCall, ToolId } from "@/lib/zezinho/tools/types";

/**
 * Planejador (Etapa 3 — ver docs/zezinho-3.0-architecture.md, seção 6). Pura, sem I/O: dado o
 * objetivo (Etapa 2) e as entidades (Etapa 1), devolve a lista MÍNIMA de ferramentas a chamar —
 * nunca "busca tudo por garantia". `inform`/`clarify_needed` não usam o pipeline novo (continuam
 * no roteador determinístico existente); `compare` sempre usa a comparação completa, porque é
 * literalmente o que foi pedido — os outros objetivos usam só o necessário.
 */

export interface PlannerResult {
  toolCalls: ToolCall[];
  /** `false` quando não havia período nem por entidade nem por memória — nenhuma ferramenta que dependa de período pôde ser chamada. */
  periodResolved: boolean;
}

interface ResolvedPeriods {
  periodA: PeriodRange;
  periodB: PeriodRange | null;
}

/** Resolve os períodos a usar: entidade nova da mensagem atual > memória da sessão > nenhum (honesto, nunca um padrão inventado). */
function resolvePeriods(entities: ExtractedEntities, memory: ReasoningSession): ResolvedPeriods | null {
  if (entities.comparison) return { periodA: entities.comparison.periodA, periodB: entities.comparison.periodB };
  if (entities.singlePeriod) return { periodA: entities.singlePeriod, periodB: null };
  if (memory.activePeriodA) return { periodA: memory.activePeriodA, periodB: memory.activePeriodB };
  return null;
}

/**
 * Tabela objetivo -> ferramentas mínimas (versionada em código — decisão do usuário, item 2).
 * `client_retention` não busca JumpPark nem caixa: só CRM. `staffing_capacity` usa só o resumo
 * operacional como proxy (marcado `proxy_only` em objective/types.ts) — nenhum dado de equipe
 * real existe para buscar. `business_health` é o único objetivo genuinamente amplo.
 */
const OBJECTIVE_TOOLS: Record<BusinessObjective, ToolId[]> = {
  increase_ticket: ["jumppark_period_summary"],
  improve_service_mix: ["jumppark_period_summary", "jumppark_wash_packages"],
  increase_revenue: ["jumppark_period_summary"],
  reduce_costs: ["cash_ledger_totals"],
  improve_cash_flow: ["cash_ledger_totals", "jumppark_period_summary"],
  evaluate_pricing: ["jumppark_period_summary"],
  staffing_capacity: ["jumppark_period_summary"],
  client_retention: ["crm_customers"],
  business_health: ["jumppark_period_summary", "cash_ledger_totals", "central_alerts"],
};

function buildCall(id: ToolId, periods: ResolvedPeriods | null, filterKind: ExtractedEntities["areaFilter"]): ToolCall {
  return { id, periodA: periods?.periodA ?? null, periodB: periods?.periodB ?? null, filterKind };
}

export function selectTools(intent: ZezinhoIntent, objective: BusinessObjective | null, entities: ExtractedEntities, memory: ReasoningSession): PlannerResult {
  if (intent === "inform" || intent === "clarify_needed") return { toolCalls: [], periodResolved: false };

  const periods = resolvePeriods(entities, memory);

  if (intent === "compare") {
    if (!periods) return { toolCalls: [], periodResolved: false };
    return { toolCalls: [buildCall("full_period_comparison", periods, entities.areaFilter)], periodResolved: true };
  }

  if (!objective) return { toolCalls: [], periodResolved: periods !== null };

  const toolCalls = OBJECTIVE_TOOLS[objective]
    .filter((id) => !TOOL_REGISTRY[id].requiresPeriod || periods !== null)
    .map((id) => buildCall(id, periods, entities.areaFilter));

  return { toolCalls, periodResolved: periods !== null };
}
