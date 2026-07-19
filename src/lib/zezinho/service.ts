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
import { addDaysIso, saoPauloDateISO, SAO_PAULO_TZ } from "@/lib/utils/timezone";
import type { EligibleOrder } from "@/lib/orders/types";
import type { ConsumptionPreview } from "@/lib/orders/preview";

/**
 * "Zézinho — Resumo Gerencial": funções determinísticas sobre dados reais do sistema, sem
 * nenhuma API externa de IA. Somente leitura — nunca cria, altera, paga ou exclui nada.
 */

export interface ZezinhoLink {
  label: string;
  href: string;
}

export interface ZezinhoAnswer {
  text: string;
  links: ZezinhoLink[];
}

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

export interface ZezinhoQuestion {
  id: string;
  label: string;
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
  { keywords: ["alerta"], questionId: "alertas_importantes" },
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
        links: [{ label: "Ver movimentações", href: "/operacoes" }],
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

    default:
      return UNKNOWN_ANSWER;
  }
}
