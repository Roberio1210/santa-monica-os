import "server-only";
import { computeConsolidatedAlerts, fetchCentralOverview, findFirstNegativeProjection, sumOutstandingDueWithin } from "@/lib/operations/central";
import { fetchDreReport } from "@/lib/finance/service";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getRecipeRepository } from "@/lib/recipes/repository-factory";
import { MIN_SAMPLES_FOR_PROVISIONAL } from "@/lib/recipes/types";
import { fetchEligibleOrders } from "@/lib/orders/eligible-orders";
import { fetchOrderPreview } from "@/lib/orders/preview-service";
import { listServiceMappings } from "@/lib/orders/service-mapping";
import { getVehicleCategory } from "@/lib/orders/vehicle-category";
import { listConsumptionConfirmations } from "@/lib/orders/consumption-history";
import { isJumpParkConfigured } from "@/lib/config/env";
import { addDaysIso, resolvePeriod, saoPauloDateISO, SAO_PAULO_TZ } from "@/lib/utils/timezone";
import { fetchOperationalOrders, computeOperationalSummary, comparePeriods } from "@/lib/integrations/jumppark/operations-summary";
import { computeWashCategoryGroups } from "@/lib/integrations/jumppark/wash-grouping";
import { normalize, parseComparisonExpression } from "@/lib/zezinho/date-parser";
import { buildComparisonReport } from "@/lib/zezinho/comparison-engine";
import { buildComparisonNarrative, buildRecommendationNarrative } from "@/lib/zezinho/response-builder";
import { EMPTY_ZEZINHO_CONTEXT } from "@/lib/zezinho/types";
import type { ZezinhoAnswer, ZezinhoContext, ZezinhoQuestion } from "@/lib/zezinho/types";
import type { EligibleOrder } from "@/lib/orders/types";
import type { ConsumptionPreview } from "@/lib/orders/preview";

/**
 * "Zézinho — Resumo Gerencial": funções determinísticas sobre dados reais do sistema, sem
 * nenhuma API externa de IA. Somente leitura — nunca cria, altera, paga ou exclui nada.
 */

export type { ZezinhoAnswer, ZezinhoLink, ZezinhoContext, ZezinhoQuestion } from "@/lib/zezinho/types";
export { EMPTY_ZEZINHO_CONTEXT };

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", hour12: false }).format(now));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function todayIso(): string {
  return saoPauloDateISO();
}

/**
 * Resumo automático do dia — cada frase só aparece quando há dado real por trás. Nunca inventa
 * fatos quando a fonte não está disponível.
 */
export async function generateDailySummary(): Promise<string> {
  const asOfDate = todayIso();
  const overview = await fetchCentralOverview(asOfDate);
  const now = new Date();
  const lines: string[] = [`${greeting(now)}, Robério.`];

  if (overview.jumppark.data) {
    lines.push(`Hoje a empresa faturou ${formatCurrency(overview.jumppark.data.dailyRevenue)} em serviços (${overview.jumppark.data.vehicles} veículo(s)).`);
  } else {
    lines.push("Ainda não tenho dados suficientes sobre o faturamento operacional de hoje.");
  }

  if (overview.cashFlow.data) {
    const { entradasHoje, saidasHoje } = overview.cashFlow.data.dashboard;
    lines.push(`Entraram ${formatCurrency(entradasHoje)} no caixa e saíram ${formatCurrency(saidasHoje)}.`);
  }

  if (overview.accountsPayable.data) {
    const overdue = overview.accountsPayable.data.items.filter((i) => i.computedStatus === "vencida");
    if (overdue.length > 0) {
      const total = Math.round(overdue.reduce((sum, i) => sum + i.outstandingAmount, 0) * 100) / 100;
      lines.push(`Há ${overdue.length} conta(s) vencida(s), totalizando ${formatCurrency(total)}.`);
    } else {
      lines.push("Não há contas a pagar vencidas.");
    }

    const in7Days = sumOutstandingDueWithin(overview.accountsPayable.data.items, asOfDate, addDaysIso(asOfDate, 7));
    if (in7Days > 0) lines.push(`Nos próximos 7 dias vencem ${formatCurrency(in7Days)} em contas a pagar.`);
  }

  if (overview.cashFlow.data) {
    const negative = findFirstNegativeProjection(overview.cashFlow.data.projection, asOfDate);
    if (negative) {
      lines.push(`O saldo projetado ficará negativo a partir de ${formatDateBR(negative.date)} (${formatCurrency(negative.point.saldoProjetado)}), caso isso realmente ocorra.`);
    }
  }

  if (!overview.jumpparkConfigured) {
    lines.push("A agenda real ainda não está integrada — não é possível informar compromissos hoje.");
  }

  const alertCount =
    (overview.accountsPayable.data?.alerts.length ?? 0) +
    (overview.accountsReceivable.data?.alerts.length ?? 0) +
    (overview.cashFlow.data?.alerts.length ?? 0) +
    (overview.classificationPendingCount.data ?? 0);
  lines.push(alertCount > 0 ? `Existem ${alertCount} alerta(s) que exigem atenção.` : "Não há alertas ativos no momento.");

  return lines.join(" ");
}

/**
 * Roteador simples e explícito para texto livre — casa palavras-chave com uma das intenções
 * pré-definidas. Nunca interpreta linguagem natural livremente; quando nada combina, cai no
 * resumo do dia como resposta padrão mais útil.
 */
const KEYWORD_INTENTS: { keywords: string[]; questionId: string }[] = [
  { keywords: ["vencid"], questionId: "contas_vencidas" },
  { keywords: ["semana", "proxim", "próxim"], questionId: "contas_semana" },
  { keywords: ["negativ"], questionId: "caixa_negativo" },
  { keywords: ["receber"], questionId: "a_receber" },
  { keywords: ["entrou", "entrada"], questionId: "entrou_caixa_hoje" },
  { keywords: ["saiu", "saída", "saida"], questionId: "saiu_caixa_hoje" },
  { keywords: ["fatur"], questionId: "faturamento_hoje" },
  { keywords: ["estetica", "estética"], questionId: "estetica_mes" },
  { keywords: ["estacionamento"], questionId: "estacionamento_mes" },
  { keywords: ["classifica"], questionId: "sem_classificacao" },
  { keywords: ["resultado", "dre", "lucro"], questionId: "resultado_mes" },
  { keywords: ["alerta", "precisando da minha atenção", "precisando de atenção", "o que está precisando", "alguma coisa preocupante", "algo preocupante"], questionId: "alertas_importantes" },
  { keywords: ["medição pendente", "medicao pendente"], questionId: "estoque_medicao_pendente" },
  { keywords: ["receita", "amostra"], questionId: "estoque_receitas_sem_amostras" },
  { keywords: ["aprovada", "aprovar receita"], questionId: "estoque_receitas_aprovaveis" },
  { keywords: ["produto sem custo", "sem custo"], questionId: "estoque_sem_custo" },
  { keywords: ["estoque mínimo", "estoque minimo"], questionId: "estoque_sem_minimo" },
  { keywords: ["mais entraram", "mais entrada"], questionId: "estoque_mais_entradas" },
  { keywords: ["ajuste"], questionId: "estoque_com_ajustes" },
  { keywords: ["estoque negativo", "saldo negativo"], questionId: "estoque_negativo" },
  { keywords: ["serviço sem receita", "servico sem receita"], questionId: "estoque_servicos_sem_receita" },
  { keywords: ["mapeamento"], questionId: "estoque_mapeamentos_pendentes" },
  { keywords: ["não analisad", "nao analisad", "consumo analisado"], questionId: "ordens_sem_analise" },
  { keywords: ["ordens bloqueada", "ordem bloqueada", "ordens estão bloqueada"], questionId: "ordens_bloqueadas" },
  { keywords: ["serviço não está mapeado", "servico não mapeado", "serviços não mapeados", "servicos nao mapeados"], questionId: "ordens_servicos_nao_mapeados" },
  { keywords: ["veículo sem categoria", "veiculos sem categoria", "veículos estão sem categoria"], questionId: "ordens_veiculos_sem_categoria" },
  { keywords: ["usadas para calibração", "usar para calibração", "ordens para calibracao"], questionId: "ordens_para_calibracao" },
  { keywords: ["prévias aguardam", "previas aguardam", "prévia aguardando confirmação"], questionId: "ordens_previas_aguardando_confirmacao" },
  { keywords: ["consumo teve divergência", "consumos tiveram divergência", "consumos com divergencia"], questionId: "ordens_consumos_com_divergencia" },
  { keywords: ["consumo duplicado", "duplicidade de consumo"], questionId: "ordens_consumo_duplicado" },
  { keywords: ["consumos foram estornados", "consumo estornado"], questionId: "ordens_consumos_estornados" },
  { keywords: ["produto foi confirmado hoje", "quanto produto foi confirmado"], questionId: "ordens_consumo_confirmado_hoje" },
  { keywords: ["quantos carros atendemos hoje", "quantos carros hoje"], questionId: "carros_hoje_quantidade" },
  { keywords: ["quais carros atendemos hoje", "quais carros hoje"], questionId: "carros_hoje_lista" },
  { keywords: ["quais carros atendemos ontem", "carros ontem"], questionId: "carros_ontem_lista" },
  { keywords: ["lavações fizemos na semana", "lavacoes na semana", "quantas lavações"], questionId: "lavacoes_semana" },
  { keywords: ["faturamos no mês", "faturamento no mes", "quanto faturamos no mês"], questionId: "faturamento_mes_operacional" },
  { keywords: ["serviços vendemos hoje", "servicos vendemos hoje"], questionId: "servicos_vendidos_hoje" },
  { keywords: ["serviços mais vendidos no mês", "servicos mais vendidos"], questionId: "servicos_mais_vendidos_mes" },
  { keywords: ["clientes vieram hoje", "quais clientes hoje"], questionId: "clientes_hoje" },
  { keywords: ["formas de pagamento foram usadas hoje", "pagamento usado hoje"], questionId: "pagamentos_hoje" },
  { keywords: ["ticket médio da semana", "ticket medio da semana"], questionId: "ticket_medio_semana" },
  { keywords: ["bronze, silver e gold", "bronze silver gold", "quantos carros fizeram bronze"], questionId: "carros_por_pacote" },
  { keywords: ["veículos ainda estão em atendimento", "veiculos em atendimento", "carros ainda no pátio"], questionId: "veiculos_em_atendimento" },
  { keywords: ["horários de maior movimento", "horarios de maior movimento", "horário de pico"], questionId: "horarios_pico" },
  { keywords: ["compare hoje com ontem"], questionId: "comparar_hoje_ontem" },
  { keywords: ["compare este mês com o mês passado", "compare o mês com o mês passado"], questionId: "comparar_mes_anterior" },
];

export function matchIntent(freeText: string): string {
  const normalized = freeText.toLowerCase();
  for (const entry of KEYWORD_INTENTS) {
    if (entry.keywords.some((k) => normalized.includes(k))) return entry.questionId;
  }
  return "como_esta_o_dia";
}

export const ZEZINHO_QUESTIONS: ZezinhoQuestion[] = [
  { id: "como_esta_o_dia", label: "Como está o dia hoje?" },
  { id: "faturamento_hoje", label: "Quanto faturamos hoje?" },
  { id: "entrou_caixa_hoje", label: "Quanto entrou no caixa hoje?" },
  { id: "saiu_caixa_hoje", label: "Quanto saiu do caixa hoje?" },
  { id: "contas_semana", label: "Quais contas vencem esta semana?" },
  { id: "contas_vencidas", label: "Temos contas vencidas?" },
  { id: "a_receber", label: "Quanto temos a receber?" },
  { id: "caixa_negativo", label: "O caixa ficará negativo?" },
  { id: "estetica_mes", label: "Como está a Estética neste mês?" },
  { id: "estacionamento_mes", label: "Como está o Estacionamento neste mês?" },
  { id: "alertas_importantes", label: "Quais são os alertas mais importantes?" },
  { id: "sem_classificacao", label: "Quais lançamentos estão sem classificação?" },
  { id: "resultado_mes", label: "Qual foi o resultado gerencial do mês?" },
  { id: "estoque_medicao_pendente", label: "Quais produtos estão com medição pendente?" },
  { id: "estoque_receitas_sem_amostras", label: "Quais receitas ainda não têm amostras?" },
  { id: "estoque_receitas_aprovaveis", label: "Quais receitas podem ser aprovadas?" },
  { id: "estoque_sem_custo", label: "Quais produtos não têm custo?" },
  { id: "estoque_sem_minimo", label: "Quais produtos não têm estoque mínimo?" },
  { id: "estoque_mais_entradas", label: "Quais produtos mais entraram no estoque?" },
  { id: "estoque_com_ajustes", label: "Quais produtos tiveram ajustes?" },
  { id: "estoque_negativo", label: "Existe estoque negativo?" },
  { id: "estoque_servicos_sem_receita", label: "Quais serviços ainda não têm receita?" },
  { id: "estoque_mapeamentos_pendentes", label: "Quais mapeamentos estão pendentes?" },
  { id: "ordens_sem_analise", label: "Quais ordens ainda não tiveram o consumo analisado?" },
  { id: "ordens_bloqueadas", label: "Quais ordens estão bloqueadas?" },
  { id: "ordens_servicos_nao_mapeados", label: "Quais serviços do JumpPark não estão mapeados?" },
  { id: "ordens_veiculos_sem_categoria", label: "Quais veículos estão sem categoria?" },
  { id: "ordens_para_calibracao", label: "Quais ordens podem ser usadas para calibração?" },
  { id: "ordens_previas_aguardando_confirmacao", label: "Quais prévias aguardam confirmação?" },
  { id: "ordens_consumos_com_divergencia", label: "Quais consumos tiveram divergência?" },
  { id: "ordens_consumo_duplicado", label: "Houve consumo duplicado?" },
  { id: "ordens_consumos_estornados", label: "Quais consumos foram estornados?" },
  { id: "ordens_consumo_confirmado_hoje", label: "Quanto produto foi confirmado hoje?" },
  { id: "carros_hoje_quantidade", label: "Quantos carros atendemos hoje?" },
  { id: "carros_hoje_lista", label: "Quais carros atendemos hoje?" },
  { id: "carros_ontem_lista", label: "Quais carros atendemos ontem?" },
  { id: "lavacoes_semana", label: "Quantas lavações fizemos na semana?" },
  { id: "faturamento_mes_operacional", label: "Quanto faturamos no mês?" },
  { id: "servicos_vendidos_hoje", label: "Quais serviços vendemos hoje?" },
  { id: "servicos_mais_vendidos_mes", label: "Quais foram os serviços mais vendidos no mês?" },
  { id: "clientes_hoje", label: "Quais clientes vieram hoje?" },
  { id: "pagamentos_hoje", label: "Quais formas de pagamento foram usadas hoje?" },
  { id: "ticket_medio_semana", label: "Qual foi o ticket médio da semana?" },
  { id: "carros_por_pacote", label: "Quantos carros fizeram Bronze, Silver e Gold?" },
  { id: "veiculos_em_atendimento", label: "Quais veículos ainda estão em atendimento?" },
  { id: "horarios_pico", label: "Quais foram os horários de maior movimento?" },
  { id: "comparar_hoje_ontem", label: "Compare hoje com ontem." },
  { id: "comparar_mes_anterior", label: "Compare este mês com o mês passado." },
];

function currentMonthRange(): { from: string; to: string; label: string } {
  const today = saoPauloDateISO();
  const from = `${today.slice(0, 7)}-01`;
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to, label: from.slice(0, 7) };
}

const UNKNOWN_ANSWER: ZezinhoAnswer = { text: "Ainda não tenho dados suficientes para responder isso.", links: [] };

function daysAgoIso(days: number): string {
  return addDaysIso(saoPauloDateISO(), -days);
}

function trendLabel(trend: "aumento" | "queda" | "estavel" | "indisponivel", deltaPercent: number | null): string {
  if (trend === "indisponivel") return "sem base de comparação";
  if (trend === "estavel") return "estável";
  if (deltaPercent === null) return trend === "aumento" ? "aumento" : "queda";
  return `${trend} de ${Math.abs(deltaPercent)}%`;
}

/**
 * Ordens elegíveis dos últimos 30 dias sem confirmação ativa, com a prévia de consumo já
 * calculada — mesma janela usada em /estoque/ordens. Retorna null quando o JumpPark não está
 * configurado, nunca inventa ordem.
 */
async function fetchOpenOrdersWithPreviews(): Promise<{ order: EligibleOrder; preview: ConsumptionPreview }[] | null> {
  if (!isJumpParkConfigured()) return null;
  const result = await fetchEligibleOrders(daysAgoIso(30), daysAgoIso(0));
  if (!result.jumpparkConfigured) return null;
  const open = result.orders.filter((o) => !o.activeConfirmationId);
  return Promise.all(open.map(async (order) => ({ order, preview: await fetchOrderPreview(order) })));
}

/**
 * Roteador de intenções explícito — cada pergunta pré-definida mapeia para uma função
 * determinística sobre services reais. Nunca executa escrita: só leitura.
 */
export async function answerQuestion(questionId: string): Promise<ZezinhoAnswer> {
  const asOfDate = todayIso();
  const overview = await fetchCentralOverview(asOfDate);

  switch (questionId) {
    case "como_esta_o_dia":
      return { text: await generateDailySummary(), links: [{ label: "Ver Central de Operações", href: "/dashboard" }] };

    case "faturamento_hoje":
      if (!overview.jumppark.data) return { text: "Ainda não tenho dados suficientes sobre o faturamento de hoje — o JumpPark não está conectado ou a consulta falhou.", links: [] };
      return {
        text: `Hoje (${formatDateBR(asOfDate)}) o faturamento operacional foi ${formatCurrency(overview.jumppark.data.dailyRevenue)}, com ${overview.jumppark.data.vehicles} veículo(s) atendido(s).`,
        links: [{ label: "Ver movimentações", href: "/movimentacoes?period=today" }],
      };

    case "entrou_caixa_hoje":
      if (!overview.cashFlow.data) return UNKNOWN_ANSWER;
      return {
        text: `Entraram ${formatCurrency(overview.cashFlow.data.dashboard.entradasHoje)} no caixa hoje (${formatDateBR(asOfDate)}).`,
        links: [{ label: "Ver Fluxo de Caixa", href: `/financeiro/fluxo-de-caixa?tipo=entrada&data=${asOfDate}` }],
      };

    case "saiu_caixa_hoje":
      if (!overview.cashFlow.data) return UNKNOWN_ANSWER;
      return {
        text: `Saíram ${formatCurrency(overview.cashFlow.data.dashboard.saidasHoje)} do caixa hoje (${formatDateBR(asOfDate)}).`,
        links: [{ label: "Ver Fluxo de Caixa", href: `/financeiro/fluxo-de-caixa?tipo=saida&data=${asOfDate}` }],
      };

    case "contas_semana": {
      if (!overview.accountsPayable.data) return UNKNOWN_ANSWER;
      const in7Days = sumOutstandingDueWithin(overview.accountsPayable.data.items, asOfDate, addDaysIso(asOfDate, 7));
      return {
        text: in7Days > 0 ? `Nos próximos 7 dias vencem ${formatCurrency(in7Days)} em contas a pagar (a partir de ${formatDateBR(asOfDate)}).` : "Não há contas a pagar vencendo nos próximos 7 dias.",
        links: [{ label: "Ver Contas a Pagar", href: "/financeiro/contas-a-pagar" }],
      };
    }

    case "contas_vencidas": {
      if (!overview.accountsPayable.data) return UNKNOWN_ANSWER;
      const overdue = overview.accountsPayable.data.items.filter((i) => i.computedStatus === "vencida");
      const total = Math.round(overdue.reduce((sum, i) => sum + i.outstandingAmount, 0) * 100) / 100;
      return {
        text: overdue.length > 0 ? `Sim, há ${overdue.length} conta(s) a pagar vencida(s), totalizando ${formatCurrency(total)}.` : "Não há contas a pagar vencidas no momento.",
        links: [{ label: "Ver Contas a Pagar", href: "/financeiro/contas-a-pagar" }],
      };
    }

    case "a_receber": {
      if (!overview.accountsReceivable.data) return UNKNOWN_ANSWER;
      const open = overview.accountsReceivable.data.summary.totalOpen;
      return {
        text: `O total em aberto em Contas a Receber é ${formatCurrency(open)}.`,
        links: [{ label: "Ver Contas a Receber", href: "/financeiro/contas-a-receber" }],
      };
    }

    case "caixa_negativo": {
      if (!overview.cashFlow.data) return UNKNOWN_ANSWER;
      const negative = findFirstNegativeProjection(overview.cashFlow.data.projection, asOfDate);
      return {
        text: negative
          ? `Sim, na projeção atual o saldo fica negativo a partir de ${formatDateBR(negative.date)} (${formatCurrency(negative.point.saldoProjetado)}), caso isso realmente ocorra.`
          : "Na projeção atual, o caixa não fica negativo em nenhuma das janelas calculadas (hoje até 90 dias).",
        links: [{ label: "Ver Fluxo de Caixa", href: "/financeiro/fluxo-de-caixa" }],
      };
    }

    case "estetica_mes":
    case "estacionamento_mes": {
      const { from, to, label } = currentMonthRange();
      const group = questionId === "estetica_mes" ? "estetica_automotiva" : "estacionamento";
      try {
        const report = await fetchDreReport("competencia", from, to, group);
        return {
          text: `Em ${label}, ${group === "estetica_automotiva" ? "Estética Automotiva" : "Estacionamento"} teve receita bruta de ${formatCurrency(report.receitaBruta)} e resultado operacional de ${formatCurrency(report.resultadoOperacional)} (regime de competência).`,
          links: [{ label: "Ver DRE Gerencial", href: `/financeiro/dre?from=${from}&to=${to}&costCenterGroup=${group}` }],
        };
      } catch {
        return UNKNOWN_ANSWER;
      }
    }

    case "alertas_importantes": {
      const alerts = computeConsolidatedAlerts(overview).slice(0, 5);
      if (alerts.length === 0) return { text: "Não há alertas ativos no momento.", links: [{ label: "Ver Central de Alertas", href: "/alertas" }] };
      return {
        text: `Os alertas mais importantes agora: ${alerts.map((a) => `${a.title} (${a.module})`).join("; ")}.`,
        links: [{ label: "Ver Central de Alertas", href: "/alertas" }],
      };
    }

    case "sem_classificacao": {
      const count = overview.classificationPendingCount.data;
      if (count === null) return UNKNOWN_ANSWER;
      return {
        text: count > 0 ? `Há ${count} lançamento(s) sem classificação gerencial.` : "Não há lançamentos pendentes de classificação.",
        links: [{ label: "Ver Classificação Financeira", href: "/financeiro/classificacao" }],
      };
    }

    case "resultado_mes": {
      const { from, to, label } = currentMonthRange();
      try {
        const report = await fetchDreReport("competencia", from, to, "consolidado");
        return {
          text: `O resultado líquido gerencial de ${label} (regime de competência) é ${formatCurrency(report.resultadoLiquido)}.`,
          links: [{ label: "Ver DRE Gerencial", href: `/financeiro/dre?from=${from}&to=${to}` }],
        };
      } catch {
        return UNKNOWN_ANSWER;
      }
    }

    case "estoque_medicao_pendente": {
      const items = overview.inventoryQuality.data?.measurementPending ?? null;
      if (items === null) return UNKNOWN_ANSWER;
      return {
        text:
          items.length > 0
            ? `${items.length} produto(s) com medição pendente: ${items.slice(0, 5).map((i) => i.name).join(", ")}${items.length > 5 ? "..." : ""}.`
            : "Nenhum produto está com medição pendente.",
        links: [{ label: "Ver produtos", href: "/estoque/produtos?quantityStatus=measurement_pending" }],
      };
    }

    case "estoque_receitas_sem_amostras": {
      const recipes = overview.inventoryQuality.data?.recipesWithoutSamples ?? null;
      if (recipes === null) return UNKNOWN_ANSWER;
      return {
        text: recipes.length > 0 ? `${recipes.length} receita(s) ainda sem nenhuma amostra de calibração.` : "Todas as receitas já têm ao menos uma amostra.",
        links: [{ label: "Ver receitas", href: "/estoque/receitas" }],
      };
    }

    case "estoque_receitas_aprovaveis": {
      const recipes = await getRecipeRepository().listRecipes();
      const eligible = recipes.filter((r) => r.isActiveVersion && r.status !== "aprovada" && r.status !== "suspensa" && r.sampleCount >= MIN_SAMPLES_FOR_PROVISIONAL);
      return {
        text: eligible.length > 0 ? `${eligible.length} receita(s) já têm amostras suficientes e podem ser aprovadas manualmente.` : "Nenhuma receita atingiu o mínimo de amostras para aprovação ainda.",
        links: [{ label: "Ver receitas", href: "/estoque/receitas" }],
      };
    }

    case "estoque_sem_custo": {
      const items = overview.inventoryQuality.data?.withoutCost ?? null;
      if (items === null) return UNKNOWN_ANSWER;
      return {
        text: items.length > 0 ? `${items.length} produto(s) sem custo cadastrado.` : "Todos os produtos têm custo cadastrado.",
        links: [{ label: "Ver produtos", href: "/estoque/produtos" }],
      };
    }

    case "estoque_sem_minimo": {
      const items = overview.inventoryQuality.data?.withoutMinimum ?? null;
      if (items === null) return UNKNOWN_ANSWER;
      return {
        text: items.length > 0 ? `${items.length} produto(s) sem estoque mínimo configurado.` : "Todos os produtos têm estoque mínimo configurado.",
        links: [{ label: "Ver produtos", href: "/estoque/produtos" }],
      };
    }

    case "estoque_mais_entradas": {
      const [movements, items] = await Promise.all([getInventoryRepository().listMovements(), getInventoryRepository().listItems()]);
      const itemMap = new Map(items.map((i) => [i.id, i.name]));
      const entryCounts = new Map<string, number>();
      for (const m of movements) {
        if (m.type === "entrada" || m.type === "compra") entryCounts.set(m.itemId, (entryCounts.get(m.itemId) ?? 0) + 1);
      }
      const top = Array.from(entryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => `${itemMap.get(id) ?? "produto removido"} (${count}x)`);
      return {
        text: top.length > 0 ? `Produtos com mais entradas registradas: ${top.join(", ")}.` : "Nenhuma entrada registrada ainda.",
        links: [{ label: "Ver movimentações", href: "/estoque/movimentacoes?type=compra" }],
      };
    }

    case "estoque_com_ajustes": {
      const [movements, items] = await Promise.all([getInventoryRepository().listMovements(), getInventoryRepository().listItems()]);
      const itemMap = new Map(items.map((i) => [i.id, i.name]));
      const adjustTypes = new Set(["ajuste_positivo", "ajuste_negativo", "correcao_inventario"]);
      const adjustedIds = new Set(movements.filter((m) => adjustTypes.has(m.type)).map((m) => m.itemId));
      const names = Array.from(adjustedIds)
        .slice(0, 5)
        .map((id) => itemMap.get(id) ?? "produto removido");
      return {
        text: adjustedIds.size > 0 ? `${adjustedIds.size} produto(s) tiveram ajuste registrado: ${names.join(", ")}${adjustedIds.size > 5 ? "..." : ""}.` : "Nenhum produto teve ajuste registrado.",
        links: [{ label: "Ver movimentações", href: "/estoque/movimentacoes" }],
      };
    }

    case "estoque_negativo": {
      const count = overview.negativeStockCount.data;
      if (count === null) return UNKNOWN_ANSWER;
      return {
        text: count > 0 ? `Sim, ${count} item(ns) estão com saldo negativo.` : "Não, nenhum item está com saldo negativo.",
        links: [{ label: "Ver movimentações", href: "/estoque/movimentacoes" }],
      };
    }

    case "estoque_servicos_sem_receita": {
      const services = overview.inventoryQuality.data?.servicesWithoutRecipe ?? null;
      if (services === null) return UNKNOWN_ANSWER;
      return {
        text: services.length > 0 ? `${services.length} serviço(s) sem nenhuma receita: ${services.slice(0, 5).map((s) => s.name).join(", ")}.` : "Todos os serviços já têm ao menos uma receita.",
        links: [{ label: "Ver pendências do estoque", href: "/estoque/pendencias" }],
      };
    }

    case "estoque_mapeamentos_pendentes": {
      const pending = overview.inventoryQuality.data?.pendingMappings ?? null;
      if (pending === null) return UNKNOWN_ANSWER;
      return {
        text: pending.length > 0 ? `${pending.length} mapeamento(s) ainda pendente(s) de confirmação.` : "Não há mapeamentos pendentes.",
        links: [{ label: "Ver mapeamentos", href: "/estoque/mapeamentos" }],
      };
    }

    case "ordens_sem_analise": {
      if (!isJumpParkConfigured()) return { text: "O JumpPark não está configurado neste ambiente — não há ordens para analisar.", links: [] };
      const result = await fetchEligibleOrders(daysAgoIso(30), daysAgoIso(0));
      if (!result.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente — não há ordens para analisar.", links: [] };
      const open = result.orders.filter((o) => !o.activeConfirmationId);
      const names = open.slice(0, 5).map((o) => `${o.externalId} (${o.vehicleModel})`);
      return {
        text: open.length > 0 ? `${open.length} ordem(ns) dos últimos 30 dias ainda sem consumo confirmado: ${names.join(", ")}${open.length > 5 ? "..." : ""}.` : "Não há ordens pendentes de análise nos últimos 30 dias.",
        links: [{ label: "Ver ordens", href: "/estoque/ordens" }],
      };
    }

    case "ordens_bloqueadas": {
      const withPreviews = await fetchOpenOrdersWithPreviews();
      if (withPreviews === null) return { text: "O JumpPark não está configurado neste ambiente — não há ordens para avaliar.", links: [] };
      const blocked = withPreviews.filter(({ preview }) => preview.state === "bloqueada");
      const names = blocked.slice(0, 5).map(({ order }) => order.externalId);
      return {
        text: blocked.length > 0 ? `${blocked.length} ordem(ns) bloqueada(s): ${names.join(", ")}${blocked.length > 5 ? "..." : ""}. Motivos variam entre categoria de veículo não confirmada, serviço não mapeado ou inconsistência de unidade.` : "Não há ordens bloqueadas no momento.",
        links: [{ label: "Ver ordens", href: "/estoque/ordens" }],
      };
    }

    case "ordens_servicos_nao_mapeados": {
      const mappings = await listServiceMappings();
      const unmapped = mappings.filter((m) => m.status === "nao_mapeado");
      const names = unmapped.slice(0, 5).map((m) => m.jumpparkServiceName);
      return {
        text: unmapped.length > 0 ? `${unmapped.length} serviço(s) do JumpPark ainda sem mapeamento: ${names.join(", ")}${unmapped.length > 5 ? "..." : ""}.` : "Todos os serviços do JumpPark já vistos estão mapeados.",
        links: [{ label: "Ver mapeamentos de serviço", href: "/estoque/mapeamentos" }],
      };
    }

    case "ordens_veiculos_sem_categoria": {
      const withPreviews = await fetchOpenOrdersWithPreviews();
      if (withPreviews === null) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      const plates = new Set<string>();
      for (const { order } of withPreviews) {
        if (!order.plateNormalized) continue;
        if ((await getVehicleCategory(order.plateNormalized)) === "desconhecido") plates.add(order.plateMasked);
      }
      const names = Array.from(plates).slice(0, 5);
      return {
        text: plates.size > 0 ? `${plates.size} veículo(s) com ordem pendente ainda sem categoria confirmada: ${names.join(", ")}${plates.size > 5 ? "..." : ""}.` : "Todos os veículos com ordem pendente já têm categoria confirmada.",
        links: [{ label: "Ver ordens", href: "/estoque/ordens" }],
      };
    }

    case "ordens_para_calibracao": {
      const withPreviews = await fetchOpenOrdersWithPreviews();
      if (withPreviews === null) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      const candidates = withPreviews.filter(({ preview }) => preview.servicesWithoutApprovedRecipe.length > 0);
      const names = candidates.slice(0, 5).map(({ order }) => order.externalId);
      return {
        text:
          candidates.length > 0
            ? `${candidates.length} ordem(ns) têm serviço sem receita aprovada e podem ser usadas para calibração: ${names.join(", ")}${candidates.length > 5 ? "..." : ""}.`
            : "Não há ordens pendentes com serviço sem receita aprovada no momento.",
        links: [{ label: "Ver calibração", href: "/estoque/calibracao" }],
      };
    }

    case "ordens_previas_aguardando_confirmacao": {
      const withPreviews = await fetchOpenOrdersWithPreviews();
      if (withPreviews === null) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      const awaiting = withPreviews.filter(({ preview }) => preview.state === "pronta" || preview.state === "parcial");
      const names = awaiting.slice(0, 5).map(({ order }) => order.externalId);
      return {
        text: awaiting.length > 0 ? `${awaiting.length} prévia(s) prontas ou parciais aguardando confirmação humana: ${names.join(", ")}${awaiting.length > 5 ? "..." : ""}.` : "Não há prévias aguardando confirmação no momento.",
        links: [{ label: "Ver ordens", href: "/estoque/ordens" }],
      };
    }

    case "ordens_consumos_com_divergencia": {
      const confirmations = await listConsumptionConfirmations();
      const divergent = confirmations.filter((c) => c.status !== "estornada" && c.lines.some((l) => l.difference !== null && Math.abs(l.difference) > 0.001));
      const names = divergent.slice(0, 5).map((c) => c.jumpparkOrderExternalId);
      return {
        text: divergent.length > 0 ? `${divergent.length} confirmação(ões) com quantidade ajustada em relação ao esperado pela receita: ${names.join(", ")}${divergent.length > 5 ? "..." : ""}.` : "Nenhuma confirmação de consumo teve divergência em relação ao esperado.",
        links: [{ label: "Ver consumos", href: "/estoque/consumos" }],
      };
    }

    case "ordens_consumo_duplicado": {
      const confirmations = await listConsumptionConfirmations();
      const activeByOrder = new Map<string, number>();
      for (const c of confirmations) {
        if (c.status === "estornada") continue;
        activeByOrder.set(c.jumpparkOrderExternalId, (activeByOrder.get(c.jumpparkOrderExternalId) ?? 0) + 1);
      }
      const duplicated = Array.from(activeByOrder.entries()).filter(([, count]) => count > 1);
      return {
        text:
          duplicated.length > 0
            ? `Sim — ${duplicated.length} ordem(ns) com mais de uma confirmação ativa simultânea, o que não deveria acontecer: ${duplicated.map(([id]) => id).join(", ")}. Verifique com prioridade.`
            : "Não. Cada ordem tem no máximo uma confirmação ativa por vez — a idempotência do sistema impede duplicidade de baixa.",
        links: [{ label: "Ver consumos", href: "/estoque/consumos" }],
      };
    }

    case "ordens_consumos_estornados": {
      const confirmations = await listConsumptionConfirmations();
      const reversed = confirmations.filter((c) => c.status === "estornada");
      const names = reversed.slice(0, 5).map((c) => c.jumpparkOrderExternalId);
      return {
        text: reversed.length > 0 ? `${reversed.length} confirmação(ões) de consumo foram estornadas: ${names.join(", ")}${reversed.length > 5 ? "..." : ""}.` : "Nenhuma confirmação de consumo foi estornada.",
        links: [{ label: "Ver consumos", href: "/estoque/consumos" }],
      };
    }

    case "ordens_consumo_confirmado_hoje": {
      const confirmations = await listConsumptionConfirmations();
      const today = asOfDate;
      const totals = new Map<string, { quantity: number; unit: string }>();
      for (const c of confirmations) {
        if (c.status === "estornada" || c.confirmedAt.slice(0, 10) !== today) continue;
        for (const line of c.lines) {
          const entry = totals.get(line.itemName) ?? { quantity: 0, unit: line.unit };
          entry.quantity = Math.round((entry.quantity + line.confirmedQuantity) * 1000) / 1000;
          totals.set(line.itemName, entry);
        }
      }
      const parts = Array.from(totals.entries())
        .slice(0, 5)
        .map(([name, { quantity, unit }]) => `${name}: ${quantity} ${unit}`);
      return {
        text: parts.length > 0 ? `Produtos confirmados hoje (${formatDateBR(today)}): ${parts.join(", ")}.` : `Nenhum consumo foi confirmado hoje (${formatDateBR(today)}).`,
        links: [{ label: "Ver consumos", href: "/estoque/consumos" }],
      };
    }

    case "carros_hoje_quantidade": {
      const p = resolvePeriod("today");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const summary = computeOperationalSummary(r.orders);
      return {
        text: summary.vehiclesServed > 0 ? `Atendemos ${summary.vehiclesServed} veículo(s) hoje, em ${summary.ordersCount} ordem(ns) finalizada(s).` : "Nenhum atendimento finalizado hoje até o momento.",
        links: [{ label: "Ver movimentações de hoje", href: "/movimentacoes?period=today" }],
      };
    }

    case "carros_hoje_lista":
    case "carros_ontem_lista": {
      const key = questionId === "carros_hoje_lista" ? "today" : "yesterday";
      const p = resolvePeriod(key);
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const names = r.orders.slice(0, 8).map((o) => `${o.vehicleModel} (${o.plateMasked})`);
      return {
        text: names.length > 0 ? `${r.orders.length} carro(s) ${key === "today" ? "hoje" : "ontem"}: ${names.join(", ")}${r.orders.length > 8 ? "..." : ""}.` : `Nenhum carro atendido ${key === "today" ? "hoje" : "ontem"}.`,
        links: [{ label: `Ver movimentações de ${key === "today" ? "hoje" : "ontem"}`, href: `/movimentacoes?period=${key}` }],
      };
    }

    case "lavacoes_semana": {
      const p = resolvePeriod("week");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const summary = computeOperationalSummary(r.orders);
      return {
        text: `${summary.washCount} lavação(ões) na semana atual, com faturamento de ${formatCurrency(summary.washRevenue)}.`,
        links: [{ label: "Ver Lavação", href: "/lavacao?period=week" }],
      };
    }

    case "faturamento_mes_operacional": {
      const p = resolvePeriod("month");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const summary = computeOperationalSummary(r.orders);
      return {
        text: `Faturamento operacional de ${p.label.toLowerCase()} (${formatDateBR(p.from)} a ${formatDateBR(p.to)}): ${formatCurrency(summary.revenue)}.`,
        links: [{ label: "Ver movimentações do mês", href: "/movimentacoes?period=month" }],
      };
    }

    case "servicos_vendidos_hoje": {
      const p = resolvePeriod("today");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const descriptions = Array.from(new Set(r.orders.flatMap((o) => o.services.map((s) => s.description))));
      return {
        text: descriptions.length > 0 ? `Serviços vendidos hoje: ${descriptions.slice(0, 8).join(", ")}${descriptions.length > 8 ? "..." : ""}.` : "Nenhum serviço vendido hoje até o momento.",
        links: [{ label: "Ver Lavação", href: "/lavacao?period=today" }],
      };
    }

    case "servicos_mais_vendidos_mes": {
      const p = resolvePeriod("month");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const totals = new Map<string, number>();
      for (const o of r.orders) for (const s of o.services) totals.set(s.description, (totals.get(s.description) ?? 0) + s.amount);
      const top = Array.from(totals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([desc, amount]) => `${desc} (${formatCurrency(amount)})`);
      return {
        text: top.length > 0 ? `Serviços mais vendidos no mês: ${top.join(", ")}.` : "Nenhum serviço vendido neste mês até o momento.",
        links: [{ label: "Ver Lavação", href: "/lavacao?period=month" }],
      };
    }

    case "clientes_hoje": {
      const p = resolvePeriod("today");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const names = Array.from(new Set(r.orders.filter((o) => o.clientName).map((o) => o.clientName as string)));
      return {
        text: names.length > 0 ? `Clientes identificados hoje: ${names.slice(0, 8).join(", ")}${names.length > 8 ? "..." : ""}.` : "Nenhum cliente identificado hoje — o JumpPark frequentemente não vincula um cliente cadastrado à ordem de walk-in.",
        links: [{ label: "Ver movimentações de hoje", href: "/movimentacoes?period=today" }],
      };
    }

    case "pagamentos_hoje": {
      const p = resolvePeriod("today");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const summary = computeOperationalSummary(r.orders);
      const parts = summary.paymentBreakdown.map((p2) => `${p2.label}: ${formatCurrency(p2.amount)} (${p2.count}x)`);
      return {
        text: parts.length > 0 ? `Formas de pagamento hoje: ${parts.join(", ")}.` : "Nenhum pagamento registrado hoje até o momento.",
        links: [{ label: "Ver movimentações de hoje", href: "/movimentacoes?period=today" }],
      };
    }

    case "ticket_medio_semana": {
      const p = resolvePeriod("week");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const summary = computeOperationalSummary(r.orders);
      return {
        text: summary.averageTicket !== null ? `O ticket médio da semana atual é ${formatCurrency(summary.averageTicket)}, sobre ${summary.ordersCount} ordem(ns).` : "Ainda não há ordens finalizadas na semana atual para calcular o ticket médio.",
        links: [{ label: "Ver Movimentações", href: "/movimentacoes?period=week" }],
      };
    }

    case "carros_por_pacote": {
      const p = resolvePeriod("month");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const washOrders = r.orders.filter((o) => o.kind === "lavacao");
      const groups = await computeWashCategoryGroups(washOrders);
      const packages = ["Bronze", "Silver", "Gold"].map((label) => `${label}: ${groups.find((g) => g.label === label)?.count ?? 0}`);
      return {
        text: `No mês atual — ${packages.join(", ")}.`,
        links: [{ label: "Ver Lavação por categoria", href: "/lavacao?period=month" }],
      };
    }

    case "veiculos_em_atendimento":
      return {
        text: "Não há um endpoint confiável do JumpPark para veículos ainda em atendimento — a exportação de ordens não retorna ordens em aberto (ver docs/jumppark-open-orders-investigation.md). Nenhum número foi inventado.",
        links: [],
      };

    case "horarios_pico": {
      const p = resolvePeriod("today");
      const r = await fetchOperationalOrders(p.from, p.to);
      if (!r.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (r.error) return { text: r.error, links: [] };
      const hourCounts = new Map<string, number>();
      for (const o of r.orders) {
        if (!o.exitTime) continue;
        const hour = `${o.exitTime.slice(0, 2)}h`;
        hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      }
      const top = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return {
        text: top.length > 0 ? `Horários de maior movimento hoje (por saída registrada): ${top.map(([h, c]) => `${h} (${c})`).join(", ")}.` : "Ainda não há saídas registradas hoje para calcular horário de pico.",
        links: [{ label: "Ver movimentações de hoje", href: "/movimentacoes?period=today" }],
      };
    }

    case "comparar_hoje_ontem": {
      const today = resolvePeriod("today");
      const yesterday = resolvePeriod("yesterday");
      const [todayResult, yesterdayResult] = await Promise.all([fetchOperationalOrders(today.from, today.to), fetchOperationalOrders(yesterday.from, yesterday.to)]);
      if (!todayResult.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (todayResult.error || yesterdayResult.error) return { text: todayResult.error ?? yesterdayResult.error ?? "Falha ao consultar o JumpPark.", links: [] };
      const todaySummary = computeOperationalSummary(todayResult.orders);
      const yesterdaySummary = computeOperationalSummary(yesterdayResult.orders);
      const revenueCmp = comparePeriods(todaySummary.revenue, yesterdaySummary.revenue);
      const vehiclesCmp = comparePeriods(todaySummary.vehiclesServed, yesterdaySummary.vehiclesServed);
      return {
        text: `Faturamento: hoje ${formatCurrency(todaySummary.revenue)} vs. ontem ${formatCurrency(yesterdaySummary.revenue)} (${trendLabel(revenueCmp.trend, revenueCmp.deltaPercent)}). Veículos: hoje ${todaySummary.vehiclesServed} vs. ontem ${yesterdaySummary.vehiclesServed} (${trendLabel(vehiclesCmp.trend, vehiclesCmp.deltaPercent)}).`,
        links: [{ label: "Ver movimentações", href: "/movimentacoes?period=today" }],
      };
    }

    case "comparar_mes_anterior": {
      const month = resolvePeriod("month");
      const previousMonth = resolvePeriod("previous_month");
      const [monthResult, previousResult] = await Promise.all([fetchOperationalOrders(month.from, month.to), fetchOperationalOrders(previousMonth.from, previousMonth.to)]);
      if (!monthResult.jumpparkConfigured) return { text: "O JumpPark não está configurado neste ambiente.", links: [] };
      if (monthResult.error || previousResult.error) return { text: monthResult.error ?? previousResult.error ?? "Falha ao consultar o JumpPark.", links: [] };
      const monthSummary = computeOperationalSummary(monthResult.orders);
      const previousSummary = computeOperationalSummary(previousResult.orders);
      const revenueCmp = comparePeriods(monthSummary.revenue, previousSummary.revenue);
      return {
        text: `Faturamento operacional: mês atual (parcial, até hoje) ${formatCurrency(monthSummary.revenue)} vs. mês anterior (completo) ${formatCurrency(previousSummary.revenue)} — ${trendLabel(revenueCmp.trend, revenueCmp.deltaPercent)}. Compare com cautela: o mês atual ainda não terminou.`,
        links: [{ label: "Ver Movimentações", href: "/movimentacoes?period=month" }],
      };
    }

    default:
      return UNKNOWN_ANSWER;
  }
}

/**
 * Camada A/E do Zézinho 2.0: interpreta saudação, comparação de períodos e perguntas de
 * acompanhamento em texto livre. Quando nada disso se aplica, cai no roteador determinístico
 * existente (matchIntent + answerQuestion) — o fallback seguro exigido pela sprint. Este é o
 * modo "analítico local": funciona inteiramente sem nenhum provedor de IA configurado.
 */

const GREETING_PATTERN = /^\s*(bom\s*dia|boa\s*tarde|boa\s*noite|oi|ol[áa]|e\s*a[íi])\b[\s,!.]*(z[eé]zinho)?[\s,!.]*/iu;

function extractGreeting(freeText: string): { hasGreeting: boolean; rest: string } {
  const match = freeText.match(GREETING_PATTERN);
  if (!match) return { hasGreeting: false, rest: freeText.trim() };
  return { hasGreeting: true, rest: freeText.slice(match[0].length).trim() };
}

function detectKindFilter(text: string): "lavacao" | "estacionamento" | null {
  const normalized = normalize(text);
  if (normalized.includes("lavacao") || normalized.includes("lavagem")) return "lavacao";
  if (normalized.includes("estacionamento")) return "estacionamento";
  return null;
}

function isWhyFollowUp(text: string): boolean {
  const n = normalize(text);
  return n.includes("por que") || n.includes("por qu") || n.includes("o que explica") || n.includes("o que causou") || n.includes("o que aconteceu") || n.includes("qual foi o principal") || n.includes("quais servicos explicam") || n.includes("qual servico");
}

function isAreaComparisonFollowUp(text: string): boolean {
  const n = normalize(text);
  return n.includes("qual area") || n.includes("area esta performando") || n.includes("area performando") || n.includes("area foi melhor");
}

function isRevenueVsCashFollowUp(text: string): boolean {
  const n = normalize(text);
  return n.includes("faturamento") && (n.includes("entrada de caixa") || n.includes("entrada real") || (n.includes("caixa") && n.includes("operacional")));
}

/**
 * Reconhece pedidos de recomendação/plano de ação (ex.: "o que devemos fazer?", "como podemos
 * melhorar?", "que faria para manter o crescimento?"). Checado ANTES de `parseComparisonExpression`
 * na resposta (bug fix): uma frase como "o que fazer nessa próxima semana" menciona "semana" e,
 * sem essa prioridade, era reinterpretada como um pedido de NOVA comparação (semana atual vs.
 * passada) em vez de uma recomendação — repetindo a resposta anterior. A intenção da mensagem
 * atual sempre vence sobre uma releitura literal de palavras que também aparecem no contexto.
 */
const RECOMMENDATION_PATTERNS: RegExp[] = [
  /\bque devemos fazer\b/,
  /\bo que fazer\b/,
  /\bvoce recomenda\b/,
  /\bo que recomenda\b/,
  /\bsua sugestao\b/,
  /\bsua opiniao\b/,
  /\bcomo podemos melhorar\b/,
  /\bcomo melhorar\b/,
  /\bcomo elevar\b/,
  /\belevar\w*\s+(esses|os|nossos)?\s*numeros\b/,
  /\baumentar\w*\s+(esses|os|nossos)?\s*numeros\b/,
  /\baumentar\w*\s+(o\s+)?ticket\s*medio\b/,
  /\bqual\s+(deve ser\s+)?(o\s+)?(nosso\s+)?plano\b/,
  /\bonde devemos agir\b/,
  /\bcomo gerente\b/,
  /\bo que faria\b/,
  /\bmanter\s+(o|esse|esta)?\s*crescimento\b/,
  /\bplano de acao\b/,
  /\bde um plano\b/,
  /\bplano para\b/,
];

function isRecommendationFollowUp(text: string): boolean {
  const n = normalize(text);
  return RECOMMENDATION_PATTERNS.some((p) => p.test(n));
}

/** Único ponto de entrada da conversa em texto livre — usado pelo Server Action do Zézinho. */
export async function answerFreeText(freeText: string, context: ZezinhoContext = EMPTY_ZEZINHO_CONTEXT): Promise<{ answer: ZezinhoAnswer; nextContext: ZezinhoContext }> {
  const trimmed = freeText.trim();
  if (!trimmed) return { answer: UNKNOWN_ANSWER, nextContext: context };

  const { hasGreeting, rest } = extractGreeting(trimmed);
  const greetingText = hasGreeting ? `${greeting(new Date())}, Robério` : null;

  // Saudação pura ("Bom dia.") -> resumo do dia, nunca trava esperando mais contexto.
  if (hasGreeting && rest.length === 0) {
    const summary = await generateDailySummary();
    return { answer: { text: summary, links: [{ label: "Ver Central de Operações", href: "/dashboard" }] }, nextContext: context };
  }

  const text = rest || trimmed;

  // Pedido de recomendação/plano de ação — checado antes de tudo, com prioridade sobre o
  // contexto herdado (bug fix): a intenção da mensagem atual nunca é substituída por uma releitura
  // literal de palavras (ex.: "semana") que também aparecem na comparação anterior.
  if (isRecommendationFollowUp(text)) {
    if (!context.lastPeriodA) {
      const prefix = greetingText ? `${greetingText}! ` : "";
      return {
        answer: {
          text: `${prefix}Ainda não tenho uma comparação de períodos para basear uma recomendação. Peça algo como "Compare esta semana com a passada" primeiro e eu já sugiro os próximos passos.`,
          links: [],
        },
        nextContext: context,
      };
    }
    const report = await buildComparisonReport(context.lastPeriodA, context.lastPeriodB, { kind: context.lastKindFilter ?? undefined });
    const answer = buildRecommendationNarrative(report, { greeting: greetingText });
    return { answer, nextContext: { ...context, lastTopic: "recomendacao" } };
  }

  const kindFromText = detectKindFilter(text);
  const newComparison = parseComparisonExpression(text);

  // Nova comparação de períodos detectada (inclui a pergunta obrigatória da sprint).
  if (newComparison) {
    const report = await buildComparisonReport(newComparison.periodA, newComparison.periodB, { kind: kindFromText ?? undefined });
    const answer = buildComparisonNarrative(report, { greeting: greetingText, dayMatchedNote: newComparison.dayMatched ? newComparison.note : null });
    return {
      answer,
      nextContext: { lastPeriodA: newComparison.periodA, lastPeriodB: newComparison.periodB, lastKindFilter: kindFromText, lastTopic: "comparacao" },
    };
  }

  // Acompanhamento: "E só a lavação?" — reaproveita os períodos da última comparação, muda o filtro.
  if (kindFromText && context.lastPeriodA) {
    const report = await buildComparisonReport(context.lastPeriodA, context.lastPeriodB, { kind: kindFromText });
    const answer = buildComparisonNarrative(report, { greeting: greetingText });
    return { answer, nextContext: { ...context, lastKindFilter: kindFromText } };
  }

  // Acompanhamento: "Por que mudou?" / "Qual foi o principal serviço responsável?"
  if (isWhyFollowUp(text) && context.lastPeriodA) {
    const report = await buildComparisonReport(context.lastPeriodA, context.lastPeriodB, { kind: context.lastKindFilter ?? undefined });
    const answer = buildComparisonNarrative(report, { greeting: greetingText });
    const top = report.topServicesA.slice(0, 3);
    const topText = top.length > 0 ? ` Os serviços que mais faturaram no período foram: ${top.map((s) => `${s.description} (${formatCurrency(s.amount)})`).join(", ")}.` : "";
    return { answer: { ...answer, text: answer.text + topText }, nextContext: context };
  }

  // Acompanhamento: "Qual área está performando melhor?"
  if (isAreaComparisonFollowUp(text) && context.lastPeriodA) {
    const report = await buildComparisonReport(context.lastPeriodA, context.lastPeriodB, {});
    const answer = buildComparisonNarrative(report, { greeting: greetingText });
    const wash = report.metrics.find((m) => m.key === "washRevenue");
    const parking = report.metrics.find((m) => m.key === "parkingRevenue");
    let prefix = "";
    if (wash && parking && wash.comparison.deltaPercent !== null && parking.comparison.deltaPercent !== null) {
      const better = wash.comparison.deltaPercent >= parking.comparison.deltaPercent ? "lavação" : "estacionamento";
      prefix = `A área que mais performou foi a ${better}. `;
    }
    return { answer: { ...answer, text: prefix + answer.text }, nextContext: context };
  }

  // Acompanhamento: "Compare faturamento operacional e entrada de caixa." — nunca mistura os dois sem explicar.
  if (isRevenueVsCashFollowUp(text)) {
    const period = context.lastPeriodA ?? resolvePeriod("month");
    const report = await buildComparisonReport(period, context.lastPeriodA ? context.lastPeriodB : null, {});
    if (!report.jumpparkConfigured) return { answer: { text: "O JumpPark não está configurado neste ambiente.", links: [] }, nextContext: context };
    const revenue = report.metrics.find((m) => m.key === "revenue");
    const cash = report.metrics.find((m) => m.key === "cashEntradas");
    const prefix = greetingText ? `${greetingText}! ` : "";
    const text2 =
      `${prefix}No período de ${formatDateBR(period.from)} a ${formatDateBR(period.to)}, o faturamento operacional (JumpPark) foi ${formatCurrency(revenue?.a ?? 0)} e as entradas reais de caixa (Neon) foram ${formatCurrency(cash?.a ?? 0)}. ` +
      `Esses números são diferentes de propósito: faturamento operacional é o valor das ordens de serviço fechadas, enquanto entrada de caixa é o dinheiro que efetivamente entrou nas contas — nem toda ordem vira entrada no mesmo dia, e o caixa pode ter entradas que não vêm da operação.`;
    return { answer: { text: text2, links: [{ label: "Ver Movimentações", href: `/movimentacoes?period=custom&from=${period.from}&to=${period.to}` }, { label: "Ver Fluxo de Caixa", href: "/financeiro/fluxo-de-caixa" }], sources: buildComparisonNarrative(report).sources }, nextContext: context };
  }

  // Fallback determinístico existente — nunca deixa a pergunta sem resposta.
  const questionId = matchIntent(text);
  const answer = await answerQuestion(questionId);
  const finalAnswer = greetingText ? { ...answer, text: `${greetingText}! ${answer.text}` } : answer;
  return { answer: finalAnswer, nextContext: context };
}
