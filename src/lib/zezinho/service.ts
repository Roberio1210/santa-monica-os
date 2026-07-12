import "server-only";
import { computeConsolidatedAlerts, fetchCentralOverview, findFirstNegativeProjection, sumOutstandingDueWithin } from "@/lib/operations/central";
import { fetchDreReport } from "@/lib/finance/service";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

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
  const hour = now.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function addDaysIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
];

function currentMonthRange(): { from: string; to: string; label: string } {
  const now = new Date();
  const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const to = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to, label: from.slice(0, 7) };
}

const UNKNOWN_ANSWER: ZezinhoAnswer = { text: "Ainda não tenho dados suficientes para responder isso.", links: [] };

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

    default:
      return UNKNOWN_ANSWER;
  }
}
