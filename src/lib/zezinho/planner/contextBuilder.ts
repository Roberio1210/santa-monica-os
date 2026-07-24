import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";
import { resolvePeriods, type ResolvedPeriods } from "@/lib/zezinho/planner/selectTools";
import { CAPABILITY_TOOL, type Capability } from "@/lib/zezinho/planner/capabilities";
import { executeToolsWithTrace } from "@/lib/zezinho/tools/executor";
import { TOOL_REGISTRY } from "@/lib/zezinho/tools/registry";
import type { ToolCall, ToolId, ToolResult } from "@/lib/zezinho/tools/types";
import type { ToolTraceEntry } from "@/lib/zezinho/reasoning/types";

/**
 * OperationalContextBuilder (Sprint 4.0, Z3, seção 3) — monta o contexto operacional a partir de
 * uma lista de capacidades já decidida pelo planner (nunca consulta tudo por conta própria).
 * Deduplica por `ToolId` real (seção 5): se duas capacidades apontam para a mesma ferramenta
 * (`staffing_capacity` e `jumppark_period_summary`, por exemplo), ela só é chamada uma vez, e
 * ambas as entradas de `byCapability` apontam para o mesmo `ToolResult`.
 */
export interface OperationalContext {
  capabilities: Capability[];
  byCapability: Partial<Record<Capability, ToolResult>>;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  toolTrace: ToolTraceEntry[];
  periodResolved: boolean;
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function buildCall(id: ToolId, periods: ResolvedPeriods | null, filterKind: ExtractedEntities["areaFilter"]): ToolCall {
  return { id, periodA: periods?.periodA ?? null, periodB: periods?.periodB ?? null, filterKind };
}

/**
 * `capabilities` já deve vir filtrada pelo planner (matriz intenção -> capacidades, ver
 * `capabilities.ts`) — este builder só executa, nunca decide o que é relevante para a pergunta.
 * Ferramentas que exigem período e não têm nenhum resolvido são silenciosamente omitidas (mesma
 * regra já usada em `selectTools.ts`) — a ausência de UMA fonte nunca derruba as demais.
 */
export async function buildOperationalContext(capabilities: Capability[], entities: ExtractedEntities, memory: ReasoningSession): Promise<OperationalContext> {
  const uniqueCapabilities = dedupe(capabilities);
  const periods = resolvePeriods(entities, memory);

  const toolIdByCapability = new Map<Capability, ToolId>();
  for (const cap of uniqueCapabilities) toolIdByCapability.set(cap, CAPABILITY_TOOL[cap]);

  const toolIds = dedupe(Array.from(toolIdByCapability.values())).filter((id) => !TOOL_REGISTRY[id].requiresPeriod || periods !== null);
  const toolCalls = toolIds.map((id) => buildCall(id, periods, entities.areaFilter));

  const { results, trace } = await executeToolsWithTrace(toolCalls);
  const resultById = new Map(results.map((r) => [r.id, r]));

  const byCapability: Partial<Record<Capability, ToolResult>> = {};
  for (const cap of uniqueCapabilities) {
    const toolId = toolIdByCapability.get(cap);
    const result = toolId ? resultById.get(toolId) : undefined;
    if (result) byCapability[cap] = result;
  }

  return { capabilities: uniqueCapabilities, byCapability, toolCalls, toolResults: results, toolTrace: trace, periodResolved: periods !== null };
}
