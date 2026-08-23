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
import { searchServiceCatalog } from "@/lib/services/catalog";
import { COMPANY_INFO } from "@/lib/company/info";
import { fetchCapacityForDate } from "@/lib/planning/service";
import { saoPauloDateISO, addDaysIso } from "@/lib/utils/timezone";

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

const serviceCatalogSearchInputSchema = z.object({
  busca: z.string().optional().describe("Nome do serviço ou palavra relacionada (ex.: 'polimento', 'gold', 'motor') — omitir para listar tudo."),
  porte: z.enum(["hatch", "sedan", "suv", "caminhonete"]).optional().describe("Porte do veículo, quando o serviço variar de preço por porte."),
  categoria: z.string().optional().describe("Categoria comercial (ex.: 'Pacote', 'Polimento', 'Vidros')."),
});

/** snake_case do banco -> texto legível, nunca uma tradução que invente conteúdo (ex.: "pre_lavagem" -> "pre lavagem"). */
function humanizeStep(step: string): string {
  return step.replace(/_/g, " ");
}

const agendaAvailabilityInputSchema = z.object({
  dia: z.enum(["hoje", "amanha"]).default("hoje").describe("Dia da consulta de disponibilidade."),
});

/**
 * Missão Z3 — categoria B (catálogo comercial), C (institucional) e a conexão real com a
 * agenda (`/planejamento`, nunca a agenda mock de `/agenda`). Todas seguras para os dois papéis:
 * preço comercial, endereço/horário e disponibilidade de agenda não são dado financeiro
 * gerencial — nenhuma redação por role necessária aqui.
 */
function buildKnowledgeTools(): ToolSet {
  return {
    service_catalog_search: tool({
      description:
        "Busca serviços/pacotes da Santa Mônica por nome, categoria ou porte do veículo — preço real, descrição e etapas incluídas quando cadastradas. Quando um campo vier null/[], significa que ainda não foi confirmado pelo gestor — nunca deduza o valor. Ao listar 'etapas_incluidas', reproduza os nomes EXATAMENTE como vieram — nunca acrescente produto, técnica ou qualificador que o resultado não trouxe (ex.: se veio 'shampoo', responda 'shampoo', nunca 'shampoo exterior' ou 'shampoo automotivo').",
      inputSchema: serviceCatalogSearchInputSchema,
      execute: async ({ busca, porte, categoria }) => {
        const results = await searchServiceCatalog({ query: busca, vehicleCategory: porte, category: categoria });
        return {
          servicos: results.map((s) => ({
            nome: s.name,
            categoria: s.category,
            preco_unico: s.defaultPrice,
            precos_por_variante: s.priceVariants.map((v) => ({ porte: v.vehicleCategory, variante: v.variantLabel, preco: v.price })),
            descricao_curta: s.shortDescription,
            descricao_detalhada: s.detailedDescription,
            tempo_estimado_minutos: s.estimatedDurationMinutes,
            beneficios: s.benefits,
            indicacoes: s.indications,
            restricoes: s.restrictions,
            depende_de_avaliacao_presencial: s.requiresInspection,
            etapas_incluidas: s.operationalSteps.length > 0 ? s.operationalSteps.map(humanizeStep) : null,
            // Instrução inline (ao lado do próprio dado, não só no system prompt) — modelos
            // pequenos tendem a "enfeitar" listas com qualificador plausível (ex.: "shampoo
            // exterior", "cera/moção") mesmo quando instruídos no prompt geral a não fazer isso.
            // Repetir a regra colada ao dado reduz esse vazamento (achado real da Missão Z3).
            aviso_etapas_incluidas: s.operationalSteps.length > 0 ? "Reproduza estes nomes EXATAMENTE como estão, palavra por palavra. Não acrescente produto, técnica, marca, duração ou qualquer outro qualificador — nenhum deles foi informado." : null,
          })),
        };
      },
    }),
    company_info: tool({
      description: "Informações institucionais da Santa Mônica: endereço, WhatsApp, Instagram, site e horário de funcionamento.",
      inputSchema: z.object({}),
      execute: async () => ({
        nome: COMPANY_INFO.name,
        endereco: COMPANY_INFO.address,
        whatsapp: COMPANY_INFO.whatsapp,
        instagram: COMPANY_INFO.instagram,
        site: COMPANY_INFO.website,
        horario_semana: COMPANY_INFO.businessHours.weekdays,
        horario_sabado: COMPANY_INFO.businessHours.saturday,
        horario_domingo: COMPANY_INFO.businessHours.sunday,
      }),
    }),
    agenda_availability: tool({
      description: "Consulta a disponibilidade real da agenda (boxes/capacidade) para hoje ou amanhã — nunca a agenda ilustrativa de /agenda.",
      inputSchema: agendaAvailabilityInputSchema,
      execute: async ({ dia }) => {
        const todayIso = saoPauloDateISO();
        const dateIso = dia === "amanha" ? addDaysIso(todayIso, 1) : todayIso;
        const prep = await fetchCapacityForDate(dateIso);
        if (!prep.capacity.configured) {
          return { configurado: false, mensagem: "A capacidade de boxes ainda não foi configurada neste ambiente." };
        }
        return {
          configurado: true,
          dia,
          boxes_disponiveis: prep.capacity.boxesCount,
          minutos_disponiveis: prep.capacity.availableMinutes,
          percentual_ocupado: prep.capacity.percentOccupied,
          veiculos_agendados: prep.vehicleCount,
          previsao_por_servico: prep.forecast.calculable ? prep.forecast.entries.map((e) => ({ servico: e.serviceName, cabem: e.canFit })) : null,
        };
      },
    }),
  };
}

/** Ponto único de montagem — tudo que o modelo generativo pode chamar para este papel, e nada além disso. */
export function buildZezinhoTools(role: UserRole): ToolSet {
  return { ...buildRegistryTools(role), ...buildLookupTools(role), ...buildKnowledgeTools() };
}
