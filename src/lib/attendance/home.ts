import type { Goal } from "@/lib/goals/types";
import type { HomeGoalEstimate, HomeSummary, ManagerBoardColumn, ServiceOrder } from "@/lib/attendance/types";

/**
 * Resumo puro da Home — nunca faz I/O. "Meta do dia" é sempre a meta mensal real dividida pelos
 * dias do período (nunca uma meta diária inventada); `null` quando não há meta ativa hoje.
 * "Faturamento do dia" soma o preço padrão dos serviços das ordens cuja visita aconteceu hoje —
 * mesma técnica já usada em `history.ts`, nunca um número de outra fonte.
 */
export function summarizeHome(params: {
  boardColumns: ManagerBoardColumn[];
  todaysOrders: ServiceOrder[];
  servicePriceById: Record<string, number>;
  activeGoal: Goal | null;
}): HomeSummary {
  const { boardColumns, todaysOrders, servicePriceById, activeGoal } = params;

  const countByStatus = Object.fromEntries(boardColumns.map((c) => [c.status, c.orders.length]));

  const dailyRevenue = round2(
    todaysOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + (servicePriceById[item.serviceId] ?? 0), 0), 0),
  );

  const goal: HomeGoalEstimate | null = activeGoal ? { label: activeGoal.label, dailyTargetEstimate: round2(activeGoal.targetAmount / daysInPeriod(activeGoal)) } : null;

  return {
    countsToday: {
      // "Previstos" = carros recém-recebidos, ainda sem diagnóstico.
      previstos: countByStatus["recebido"] ?? 0,
      // "Aguardando atendimento" junta diagnóstico feito + aguardando execução — ambos "esperando
      // a equipe começar", só que em pontos diferentes do fluxo (nunca dois baldes para o mesmo carro).
      aguardandoAtendimento: (countByStatus["diagnostico"] ?? 0) + (countByStatus["aguardando_execucao"] ?? 0),
      emExecucao: countByStatus["em_execucao"] ?? 0,
      aguardandoConferencia: countByStatus["aguardando_conferencia"] ?? 0,
      prontoEntrega: countByStatus["pronto_entrega"] ?? 0,
    },
    dailyRevenue,
    goal,
  };
}

function daysInPeriod(goal: Goal): number {
  const days = Math.round((Date.parse(`${goal.periodEnd}T00:00:00Z`) - Date.parse(`${goal.periodStart}T00:00:00Z`)) / 86_400_000) + 1;
  return days > 0 ? days : 1;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
