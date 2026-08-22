import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { UserRole } from "@/lib/auth/roles";
import { executeTool as executeZezinhoTool } from "@/lib/zezinho/tools/executor";
import { isToolBlockedForRole } from "@/lib/zezinho/auth/access";
import { TOOL_REGISTRY } from "@/lib/zezinho/tools/registry";
import type { ToolCall, ToolId } from "@/lib/zezinho/tools/types";
import { periodInputSchema, resolvePeriodInput, type PeriodInput } from "@/lib/zezinho/generative/periodInput";
import { lookupInventoryItems, lookupCrmCustomers } from "@/lib/zezinho/generative/lookups";

/**
 * Missão Z2 — schemas de tool-calling para o modelo generativo. Ponte fina sobre o mesmo
 * catálogo/dispatcher da Z1 (`tools/registry.ts` + `tools/executor.ts`) — nenhum service novo é
 * chamado aqui, nenhum dado novo é calculado. A única lógica nova é traduzir o "período em
 * linguagem natural" que o modelo pede em `PeriodRange` (via `periodInput.ts`) e (para
 * `inventory_lookup`/`crm_lookup`) uma busca por nome que o catálogo antigo não tinha.
 *
 * RBAC (soberania da Z1, nunca enfraquecida aqui): `buildZezinhoTools(role)` remove do array
 * de tools EXPOSTAS AO MODELO qualquer ferramenta que `isToolBlockedForRole` classifique como
 * bloqueada para o papel — o modelo generativo nem chega a saber que a ferramenta existe.
 * `executeZezinhoTool` (o dispatcher da Z1) continua sendo chamado com `role` em toda execução,
 * então mesmo se algo escapasse dessa filtragem (bug futuro), o bloqueio de dentro do
 * dispatcher ainda se aplica — a mesma defesa em profundidade da Z1, agora com uma camada a mais
 * (omissão de schema) por cima.
 */

const REGISTRY_TOOL_IDS = Object.keys(TOOL_REGISTRY) as ToolId[];

/** Só os tools do catálogo que fazem sentido pedir "período" via linguagem natural (os demais ignoram o campo). */
const PERIOD_AWARE_TOOLS = new Set<ToolId>([
  "jumppark_period_summary",
  "jumppark_wash_packages",
  "cash_ledger_totals",
  "dre_result",
  "goal_progress",
  "historical_pattern",
  "stone_reconciliation_summary",
  "stone_financial_schedule",
  "stone_jumppark_reconciliation",
  "financial_intelligence",
]);

function registryToolInputSchema(id: ToolId) {
  const shape: Record<string, z.ZodTypeAny> = {};
  if (PERIOD_AWARE_TOOLS.has(id)) shape.periodo = periodInputSchema.optional();
  if (id === "jumppark_period_summary" || id === "full_period_comparison") {
    shape.area = z
      .enum(["lavacao", "estacionamento"])
      .nullable()
      .optional()
      .describe("Filtra por área operacional — omitir para consolidado (lavação + estacionamento).");
  }
  if (id === "goal_progress") {
    shape.area_meta = z.enum(["lavacao", "estacionamento", "consolidado"]).optional().describe("Área da meta — omitir para a meta consolidada.");
  }
  if (id === "full_period_comparison") {
    shape.periodo_comparacao = periodInputSchema.optional().describe("Segundo período, para comparar com o primeiro (ex.: mês passado vs. este mês).");
  }
  return z.object(shape);
}

function resolveGoalArea(areaMeta: "lavacao" | "estacionamento" | "consolidado" | undefined): "lavacao" | "estacionamento" | null | undefined {
  if (areaMeta === undefined) return undefined;
  return areaMeta === "consolidado" ? null : areaMeta;
}

function buildToolCall(id: ToolId, rawInput: Record<string, unknown>): ToolCall {
  const input = rawInput as { periodo?: PeriodInput; periodo_comparacao?: PeriodInput; area?: "lavacao" | "estacionamento" | null; area_meta?: "lavacao" | "estacionamento" | "consolidado" };
  const periodA = PERIOD_AWARE_TOOLS.has(id) || id === "full_period_comparison" ? resolvePeriodInput(input.periodo) : null;
  const periodB = id === "full_period_comparison" && input.periodo_comparacao ? resolvePeriodInput(input.periodo_comparacao) : null;
  return {
    id,
    periodA,
    periodB,
    filterKind: input.area ?? null,
    goalArea: resolveGoalArea(input.area_meta),
  };
}

/** Descrição enviada ao modelo — reaproveita o `label` já curado do registro (fonte única), nunca reescreve o que a ferramenta faz. */
function describeRegistryTool(id: ToolId): string {
  const def = TOOL_REGISTRY[id];
  return `${def.label}. Fonte: ${def.source}.`;
}

function buildRegistryTools(role: UserRole): ToolSet {
  const entries: ToolSet = {};
  for (const id of REGISTRY_TOOL_IDS) {
    if (isToolBlockedForRole(id, role)) continue; // RBAC: o modelo nem vê esta ferramenta existir.
    entries[id] = tool({
      description: describeRegistryTool(id),
      inputSchema: registryToolInputSchema(id),
      execute: async (rawInput) => {
        const call = buildToolCall(id, rawInput as Record<string, unknown>);
        return executeZezinhoTool(call, role);
      },
    });
  }
  return entries;
}

const inventoryLookupInputSchema = z.object({
  nome_produto: z.string().min(1).describe("Nome (ou parte do nome) do produto a procurar — ex.: 'V-Floc', 'shampoo', 'removex'."),
});

const crmLookupInputSchema = z.object({
  busca: z.string().min(1).describe("Nome, telefone ou placa para localizar o cliente."),
});

/**
 * `inventory_lookup`/`crm_lookup`: buscas por nome que o catálogo antigo (só agregados) não
 * cobria — exatamente o gap que o exemplo "quanto temos de V-Floc" da missão expôs. Sempre
 * seguras para operacional: nunca incluem custo unitário nem gasto total do cliente.
 */
function buildLookupTools(role: UserRole): ToolSet {
  return {
    inventory_lookup: tool({
      description: "Consulta produtos do estoque por nome — saldo atual, unidade, status e (quando catalogado) função técnica. Nunca inclui custo unitário para o papel operacional.",
      inputSchema: inventoryLookupInputSchema,
      execute: async ({ nome_produto }) => {
        const items = await lookupInventoryItems(nome_produto);
        return {
          matches: items.map((item) => ({
            nome: item.name,
            quantidade_atual: item.currentQuantity,
            unidade: item.unit,
            status: item.status,
            estoque_minimo: item.minimumStock,
            funcao_tecnica: item.technicalFunction ?? null,
            tipo_de_uso: item.usageType ?? null,
            custo_unitario: role === "admin" ? item.unitCost : null,
          })),
        };
      },
    }),
    crm_lookup: tool({
      description: "Consulta clientes por nome, telefone ou placa — status, veículos, últimos serviços. Nunca inclui valor total gasto/ticket médio para o papel operacional.",
      inputSchema: crmLookupInputSchema,
      execute: async ({ busca }) => {
        const matches = await lookupCrmCustomers(busca);
        return {
          matches: matches.map((m) => ({
            nome: m.customer.name,
            veiculos: m.vehicles.map((v) => `${v.brand ?? ""} ${v.model ?? ""} ${v.plate ?? ""}`.trim()),
            visitas: m.profile.visitCount,
            ultima_visita: m.profile.lastVisitAt,
            cliente_recorrente: m.profile.isRecurring,
            gasto_total: role === "admin" ? m.profile.totalSpent : null,
            ticket_medio: role === "admin" ? m.profile.averageTicket : null,
          })),
        };
      },
    }),
  };
}

/** Ponto único de montagem — tudo que o modelo generativo pode chamar para este papel, e nada além disso. */
export function buildZezinhoTools(role: UserRole): ToolSet {
  return { ...buildRegistryTools(role), ...buildLookupTools(role) };
}
