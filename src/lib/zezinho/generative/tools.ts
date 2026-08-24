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
import { fetchCommercialPolicy, fetchComplimentaryOptions } from "@/lib/services/commercialPolicy";
import { fetchDailyClosing } from "@/lib/management/dailyClosing";
import { fetchPostSaleCandidates, POST_SALE_CATEGORY_LABEL } from "@/lib/management/postSale";
import { fetchInactiveCustomers, DEFAULT_INACTIVE_MIN_DAYS } from "@/lib/management/inactiveCustomers";

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
      description:
        "Consulta produtos do estoque por nome — saldo atual, unidade, status, classificação e (quando catalogado) função técnica. Nunca inclui custo unitário para o papel operacional. IMPORTANTE — leia 'classificacao' antes de responder sobre disponibilidade: 'quimico_volume'/'solido_peso'/'consumivel_unidade' são PRODUTOS CONSUMÍVEIS (saldo é insumo que se esgota, pode virar 'X serviços restantes' quando houver receita técnica associada); 'ferramenta'/'equipamento' são reutilizáveis (quantidade = disponibilidade do item físico, ex. '1 escova disponível' — NUNCA interprete essa quantidade como 'quantos serviços restam', ferramenta não se consome por serviço); 'patrimonio' é mobiliário/estrutura (mesma lógica de disponibilidade, nunca consumível).",
      inputSchema: inventoryLookupInputSchema,
      execute: async ({ nome_produto }) => {
        const items = await lookupInventoryItems(nome_produto);
        return {
          matches: items.map((item) => ({
            nome: item.name,
            marca: item.brand,
            quantidade_atual: item.currentQuantity,
            unidade: item.unit,
            status: item.status,
            classificacao: item.classification ?? null,
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
const dailyClosingInputSchema = z.object({
  dia: z.enum(["hoje", "ontem"]).default("hoje").describe("Dia do fechamento gerencial — o foco principal é sempre 'hoje'."),
});

const inactiveCustomersInputSchema = z.object({
  dias_minimo: z.number().int().min(1).max(365).optional().describe("Quantidade mínima de dias sem retorno para considerar o cliente inativo — padrão 30."),
});

function buildKnowledgeTools(role: UserRole): ToolSet {
  return {
    service_catalog_search: tool({
      description:
        "Busca serviços/pacotes da Santa Mônica por nome, categoria ou porte do veículo — preço-base, condição comercial atual (quando diferente), produtos homologados (com estoque real quando cadastrado) e etapas incluídas quando cadastrados. Quando um campo vier null/[], significa que ainda não foi confirmado pelo gestor — nunca deduza o valor. Ao listar 'etapas_incluidas', reproduza os nomes EXATAMENTE como vieram — nunca acrescente produto, técnica ou qualificador que o resultado não trouxe (ex.: se veio 'shampoo', responda 'shampoo', nunca 'shampoo exterior' ou 'shampoo automotivo'). Para perguntas do tipo 'qual produto vamos usar/temos disponível', use o campo 'produtos': cada item já traz se está disponível em estoque agora ('disponivel_em_estoque') — quando 'nunca_cadastrado_no_estoque' vier true, esse produto homologado nunca foi comprado/contado, então NUNCA é disponível, mesmo que pareça o mais adequado — responda que precisa de reposição. Nunca troque silenciosamente por um produto de outra variante/durabilidade só porque o homologado da variante pedida está indisponível.",
      inputSchema: serviceCatalogSearchInputSchema,
      execute: async ({ busca, porte, categoria }) => {
        const results = await searchServiceCatalog({ query: busca, vehicleCategory: porte, category: categoria });
        return {
          servicos: results.map((s) => ({
            nome: s.name,
            categoria: s.category,
            preco_base: s.defaultPrice,
            // Missão Z3.2 — preço-base ≠ preço comercial atual ≠ preço negociado (esse último só existe na venda, nunca aqui).
            // Quando preco_comercial_atual vier null, o preço vigente é o próprio preco_base.
            preco_comercial_atual: s.currentPrice,
            precos_por_variante: s.priceVariants.map((v) => ({ porte: v.vehicleCategory, variante: v.variantLabel, preco_base: v.price, preco_comercial_atual: v.currentPrice })),
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
            // Missão Z3.2/Z3.3 — produtos homologados pelo gestor (nunca inferidos pela mera existência no estoque),
            // já cruzados com o estoque real quando o produto está cadastrado.
            produtos:
              s.products.length > 0
                ? s.products.map((p) => ({
                    produto: p.productName,
                    marca: p.brand,
                    papel: p.role,
                    alternativa: p.isAlternative,
                    variante: p.variantLabel,
                    durabilidade_aproximada: p.durabilityLabel,
                    nunca_cadastrado_no_estoque: p.estoque === null,
                    disponivel_em_estoque: p.estoque?.disponivel ?? false,
                    quantidade_atual: p.estoque?.quantidadeAtual ?? null,
                    unidade: p.estoque?.unidade ?? null,
                    status_estoque: p.estoque?.status ?? null,
                  }))
                : null,
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
    commercial_policy: tool({
      description:
        "Regras reais de negociação da Santa Mônica: limite máximo de desconto financeiro, progressão sugerida, valor mínimo e parcelas para parcelamento no cartão, e quais serviços já têm autorização do gestor para ser oferecidos como cortesia estratégica. SEMPRE consulte esta ferramenta antes de mencionar desconto, parcelamento ou cortesia — nunca use um número de memória.",
      inputSchema: z.object({}),
      execute: async () => {
        const [policy, complimentary] = await Promise.all([fetchCommercialPolicy(), fetchComplimentaryOptions()]);
        return {
          politica_configurada: policy !== null,
          desconto_maximo_percentual: policy?.maxDiscountPercent ?? null,
          progressao_desconto_sugerida: policy?.discountProgressionSteps ?? null,
          valor_minimo_para_parcelamento: policy?.installmentThresholdAmount ?? null,
          parcelas_maximas: policy?.maxInstallments ?? null,
          cortesias_autorizadas: complimentary.length > 0 ? complimentary.map((c) => ({ servico: c.serviceName, contexto: c.context })) : null,
          aviso: "O desconto financeiro é SEMPRE o último recurso, depois de cortesia e parcelamento. Nunca ofereça o percentual máximo de imediato — comece pelo primeiro passo da progressão sugerida.",
        };
      },
    }),
    // Missão Z4 — fechamento gerencial do dia: operação + serviços + (só ADMIN) financeiro +
    // estoque que merece atenção + amanhã (agenda + produto homologado x estoque real) +
    // recomendações. Nunca escreve nada — leitura pura sobre fontes já auditadas na missão.
    daily_management_summary: tool({
      description:
        "Fechamento gerencial do dia (ou de ontem): quantidade de ordens/veículos/clientes, lavação x estacionamento, mix de pacotes Bronze/Silver/Gold, principais serviços, comparação com o período anterior, estoque que precisa de atenção, agenda de amanhã (com verificação de produto homologado disponível para os serviços agendados) e recomendações priorizadas. Para o papel operacional, o campo 'financeiro' sempre vem null — nunca peça faturamento/caixa/Stone a este papel, a resposta certa é dizer que essa informação é restrita à administração. Quando 'principais_servicos' vier vazio ([]), significa que não houve ordem registrada nesse período — NUNCA invente um nome de serviço, produto ou tabela 'serviço x produto' nesse caso; diga honestamente que não houve movimento. IMPORTANTE: quando 'jumppark_configurado' vier true, a ferramenta SEMPRE conseguiu consultar os dados — mesmo que 'operacao.ordens' venha 0, isso é um FATO REAL (nenhum atendimento registrado ainda no período), nunca uma falha de consulta. Nesse caso é ERRADO dizer 'não consegui obter os dados' ou qualquer frase parecida — a resposta certa é reportar o dia como tendo movimento zero até agora, exatamente como o campo 'aviso_geral' explica.",
      inputSchema: dailyClosingInputSchema,
      execute: async ({ dia }) => {
        const result = await fetchDailyClosing({ periodo: dia === "ontem" ? "yesterday" : "today" }, role);
        const zeroMovement = result.jumpparkConfigured && result.operational.ordersCount === 0;
        return {
          periodo: result.period.label,
          periodo_comparacao: result.comparisonPeriod.label,
          periodo_ainda_em_andamento: result.partialPeriod,
          jumppark_configurado: result.jumpparkConfigured,
          // Achado real (Missão Z4, confirmação com chamada real autenticada como admin): mesmo
          // com jumppark_configurado=true e groundedInRealSource=true, o modelo às vezes
          // interpretou "tudo zero" como "não consegui obter os dados" — um erro de síntese, não
          // de busca. Este campo desambigua explicitamente os dois casos, colado ao dado (mesmo
          // padrão já eficaz de aviso_etapas_incluidas/aviso_principais_servicos).
          aviso_geral: zeroMovement
            ? "jumppark_configurado é true: a consulta funcionou normalmente. O valor 0 em 'ordens' é um dado REAL — não houve nenhum atendimento registrado neste período até agora. NUNCA diga 'não consegui obter os dados' aqui; reporte honestamente um dia (ou período) sem movimento."
            : null,
          operacao: {
            ordens: result.operational.ordersCount,
            veiculos_atendidos: result.operational.vehiclesCount,
            clientes: result.operational.customersCount,
            lavacoes: result.operational.washCount,
            estacionamentos: result.operational.parkingCount,
            pacotes: result.operational.packageCounts,
            principais_servicos: result.operational.topServices.map((s) => ({ servico: s.description, valor: s.amount })),
            aviso_principais_servicos: result.operational.topServices.length === 0 ? "Nenhuma ordem registrada neste período — não existe 'serviço mais vendido' para reportar. Nunca invente um nome de serviço nem monte uma tabela serviço x produto aqui." : null,
          },
          financeiro: result.financial
            ? {
                faturamento_bruto: result.financial.grossRevenue,
                faturamento_lavacao: result.financial.washRevenue,
                faturamento_estacionamento: result.financial.parkingRevenue,
                ticket_medio: result.financial.averageTicket,
                caixa_entradas: result.financial.cashEntradas,
                caixa_saidas: result.financial.cashSaidas,
                caixa_resultado: result.financial.cashResultado,
                resultado_dre: result.financial.dreResultado,
                stone_configurado: result.financial.stoneConfigured,
                stone_liquidado_hoje: result.financial.stoneSettledToday,
                stone_a_receber_hoje: result.financial.stonePendingToday,
              }
            : null,
          estoque_atencao: result.inventoryAttention.map((i) => ({ produto: i.name, marca: i.brand, quantidade_atual: i.currentQuantity, unidade: i.unit, status: i.status })),
          amanha: {
            veiculos_agendados: result.tomorrow.vehicleCount,
            capacidade_configurada: result.tomorrow.capacityConfigured,
            minutos_disponiveis: result.tomorrow.availableMinutes,
            percentual_ocupado: result.tomorrow.percentOccupied,
            principais_servicos: result.tomorrow.mainServices,
            riscos_de_produto: result.tomorrow.productRisks.map((r) => ({ servico: r.serviceName, agendamentos: r.scheduledCount, status: r.status, detalhe: r.detail })),
          },
          pontos_de_atencao: result.insights.map((i) => ({ titulo: i.title, evidencia: i.evidence, gravidade: i.severity })),
          recomendacoes_prioritarias: result.recommendations,
          aviso: "Todo número aqui vem de fonte real (JumpPark/Neon/estoque/planejamento/Stone) — se algo não aparecer, é porque a fonte não tinha esse dado, nunca complete por conta própria.",
        };
      },
    }),
    // Missão Z4 — candidatos a pós-venda do dia (nunca envia nada, só sugere e prepara rascunho).
    post_sale_candidates: tool({
      description:
        "Clientes atendidos HOJE que merecem alguma ação de pós-venda, já classificados (A: pedir avaliação Google; B: verificar satisfação antes; C: não abordar agora; D: precisa de atenção humana — nunca detectado automaticamente, só se você mesmo perceber isso na conversa) com uma mensagem-rascunho personalizada por cliente (nome, veículo e serviço reais, nunca a mesma frase para todos). NUNCA envia nada — só prepara o texto para revisão humana.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await fetchPostSaleCandidates();
        return {
          jumppark_configurado: result.jumpparkConfigured,
          erro: result.error,
          candidatos: result.candidates.map((c) => ({
            cliente: c.customerName,
            veiculo: c.vehicleModel,
            servicos: c.serviceNames,
            telefone_mascarado: c.phoneMasked,
            categoria: c.category,
            categoria_label: POST_SALE_CATEGORY_LABEL[c.category],
            motivo: c.categoryReason,
            mensagem_sugerida: c.messageDraft,
          })),
          aviso: "Nenhuma mensagem foi enviada — são apenas rascunhos para você revisar e enviar manualmente.",
        };
      },
    }),
    // Missão Z4 — clientes sem retorno há mais de N dias, priorizados de forma transparente.
    inactive_customers: tool({
      description:
        "Clientes que já usaram a Santa Mônica e não retornam há mais de N dias (padrão 30) — priorizados por critérios explícitos (recorrência, tempo sem retorno, ticket histórico, todos exibidos por cliente) e com mensagem-rascunho de reativação (nunca menciona promoção, pois nenhuma promoção ativa está cadastrada no sistema hoje). Lista sempre limitada aos melhores candidatos, nunca uma lista gigante sem critério. NUNCA envia nada — só prepara o texto para revisão humana. Este sistema ainda não registra se o cliente já foi abordado recentemente nem sinaliza reclamação/pedido de não-contato — sempre avise isso e recomende checagem manual antes de contatar.",
      inputSchema: inactiveCustomersInputSchema,
      execute: async ({ dias_minimo }) => {
        const result = await fetchInactiveCustomers(dias_minimo ?? DEFAULT_INACTIVE_MIN_DAYS);
        return {
          dias_minimo_considerado: result.minDays,
          total_encontrado_antes_do_corte: result.totalCandidatesBeforeCap,
          candidatos: result.candidates.map((c) => ({
            cliente: c.customerName,
            veiculo: c.vehicleModel,
            placa_mascarada: c.plateMasked,
            telefone_mascarado: c.phoneMasked,
            dias_sem_retorno: c.daysSinceLastVisit,
            visitas_historicas: c.visitCount,
            gasto_historico_total: role === "admin" ? c.totalSpent : null,
            cliente_recorrente: c.isRecurring,
            prioridade_pontuacao: c.priorityScore,
            prioridade_motivos: c.priorityReasons,
            mensagem_sugerida: c.messageDraft,
          })),
          avisos: result.caveats,
        };
      },
    }),
  };
}

/** Ponto único de montagem — tudo que o modelo generativo pode chamar para este papel, e nada além disso. */
export function buildZezinhoTools(role: UserRole): ToolSet {
  return { ...buildRegistryTools(role), ...buildLookupTools(role), ...buildKnowledgeTools(role) };
}
