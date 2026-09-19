import { saoPauloDateISO } from "@/lib/utils/timezone";
import { OCCUPYING_STATUSES, type CapacityConfig, type CapacitySummary } from "@/lib/planning/types";
import { computeCapacitySummary } from "@/lib/planning/capacity";
import type { AppointmentRow } from "@/lib/planning/repository";
import type { AccountsReceivableView, AccountsPayableView } from "@/lib/finance/types";
import type {
  OverviewAppointmentDayGroup as DayGroup,
  OverviewAppointmentsSection,
  OverviewCapacitySection,
  OverviewFinanceItem,
  OverviewServicesSection,
  OverviewAlert,
  OverviewRevenueSection,
  OverviewFinanceSection,
  OverviewStoneSection,
} from "@/lib/overview/types";

/**
 * Missão 82 (VG1) — funções PURAS de agregação (nenhum I/O aqui), mesma separação já usada em
 * todo o projeto (`capacity.ts`, `crossDaySettlement.ts`, `reconciliation.ts`) para permitir
 * testar a lógica de negócio sem banco.
 */

export function groupAppointmentsByDay(rows: AppointmentRow[]): DayGroup[] {
  const byDay = new Map<string, AppointmentRow[]>();
  for (const row of rows) {
    const dateIso = saoPauloDateISO(new Date(row.scheduledAt));
    if (!byDay.has(dateIso)) byDay.set(dateIso, []);
    byDay.get(dateIso)!.push(row);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateIso, items]) => ({
      dateIso,
      items: items
        .slice()
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .map((r) => ({
          id: r.id,
          scheduledAt: r.scheduledAt,
          status: r.status,
          customerName: r.customerName,
          vehicleLabel: r.vehicleLabel,
          plate: r.plate,
          serviceName: r.serviceName,
          expectedDurationMinutes: r.expectedDurationMinutes,
        })),
    }));
}

export function summarizeAppointmentsByStatus(rows: AppointmentRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}

export function buildAppointmentsSection(rows: AppointmentRow[]): OverviewAppointmentsSection {
  return {
    status: "ok",
    totalCount: rows.length,
    countByStatus: summarizeAppointmentsByStatus(rows),
    byDay: groupAppointmentsByDay(rows),
  };
}

/**
 * Regra explícita anti-dupla-contagem (Missão 82, Parte I): esta seção nasce EXCLUSIVAMENTE de
 * `appointments` — nunca combinada com ordens JumpPark, porque não existe hoje uma chave de
 * junção confiável entre os dois sistemas (Missão 81A). "Realizado" = status `concluido`.
 * "Previsto" = demais status ocupantes (`agendado`/`confirmado`/`em_andamento`) — nunca
 * `cancelado`/`reagendado`, que não representam trabalho a ser feito nesta data.
 */
export function buildServicesSection(rows: AppointmentRow[]): OverviewServicesSection {
  const occupying = rows.filter((r) => (OCCUPYING_STATUSES as readonly string[]).includes(r.status));
  const byName = new Map<string, { realizadoCount: number; previstoCount: number }>();
  for (const row of occupying) {
    const entry = byName.get(row.serviceName) ?? { realizadoCount: 0, previstoCount: 0 };
    if (row.status === "concluido") entry.realizadoCount += 1;
    else entry.previstoCount += 1;
    byName.set(row.serviceName, entry);
  }
  return {
    status: "ok",
    byService: [...byName.entries()]
      .map(([serviceName, counts]) => ({ serviceName, ...counts }))
      .sort((a, b) => b.realizadoCount + b.previstoCount - (a.realizadoCount + a.previstoCount)),
  };
}

/**
 * Capacidade só é significativa para EXATAMENTE 1 dia — `dailyCapacityMinutes` é uma grandeza
 * por-dia (boxes × minutos de operação), nunca multiplicada por dias de um período (Missão 82,
 * Parte J: "não mostrar ocupação atual para período histórico como se fosse tempo real").
 */
export function buildCapacitySection(period: { from: string; to: string }, config: CapacityConfig | null, occupyingAppointments: { expectedDurationMinutes: number | null }[]): OverviewCapacitySection {
  if (period.from !== period.to) {
    return { status: "unavailable", applicable: false, reason: "Ocupação é calculada por dia — selecione um único dia para ver este indicador." };
  }
  const summary: CapacitySummary = computeCapacitySummary(config, occupyingAppointments);
  if (!summary.configured) {
    return { status: "unavailable", applicable: true, reason: "Nenhuma configuração de capacidade (boxes/minutos) está ativa." };
  }
  return {
    status: "ok",
    applicable: true,
    boxesCount: summary.boxesCount,
    dailyOperatingMinutes: summary.dailyOperatingMinutes,
    dailyCapacityMinutes: summary.dailyCapacityMinutes,
    committedMinutes: summary.committedMinutes,
    availableMinutes: summary.availableMinutes,
    percentOccupied: summary.percentOccupied,
  };
}

/** Só entra quem ainda tem saldo em aberto e vencimento dentro do período — nunca contas já quitadas/canceladas. */
export function filterReceivableDueInRange(items: AccountsReceivableView[], from: string, to: string): OverviewFinanceItem[] {
  return items
    .filter((i) => i.computedStatus !== "cancelled" && i.computedStatus !== "paid" && i.outstandingAmount > 0 && i.dueDate >= from && i.dueDate <= to)
    .map((i) => ({ id: i.id, description: i.description, partyName: i.partyName, dueDate: i.dueDate, amount: i.outstandingAmount, isOverdue: i.isOverdue }));
}

export function filterPayableDueInRange(items: AccountsPayableView[], from: string, to: string): OverviewFinanceItem[] {
  return items
    .filter((i) => i.computedStatus !== "cancelada" && i.computedStatus !== "paga" && i.outstandingAmount > 0 && i.dueDate >= from && i.dueDate <= to)
    .map((i) => ({ id: i.id, description: i.description, partyName: i.supplierName ?? "Sem fornecedor informado", dueDate: i.dueDate, amount: i.outstandingAmount, isOverdue: i.isOverdue }));
}

export function buildFinanceSection(receivableItems: OverviewFinanceItem[], payableItems: OverviewFinanceItem[]): OverviewFinanceSection {
  return {
    status: "ok",
    receivable: { totalAmount: receivableItems.reduce((sum, i) => sum + i.amount, 0), items: receivableItems },
    payable: { totalAmount: payableItems.reduce((sum, i) => sum + i.amount, 0), items: payableItems },
  };
}

export function buildOverviewAlerts(input: {
  todayIso: string;
  finance: OverviewFinanceSection;
  appointments: OverviewAppointmentsSection;
  capacity: OverviewCapacitySection;
  stone: OverviewStoneSection;
  revenue: OverviewRevenueSection;
}): OverviewAlert[] {
  const alerts: OverviewAlert[] = [];

  const overdueReceivable = input.finance.receivable.items.filter((i) => i.isOverdue);
  if (overdueReceivable.length > 0) {
    alerts.push({ id: "receivable-overdue", severity: "critical", message: `${overdueReceivable.length} conta(s) a receber vencida(s) no período.` });
  }
  const dueTodayReceivable = input.finance.receivable.items.filter((i) => i.dueDate === input.todayIso && !i.isOverdue);
  if (dueTodayReceivable.length > 0) {
    alerts.push({ id: "receivable-due-today", severity: "info", message: `${dueTodayReceivable.length} conta(s) a receber vencendo hoje.` });
  }
  const overduePayable = input.finance.payable.items.filter((i) => i.isOverdue);
  if (overduePayable.length > 0) {
    alerts.push({ id: "payable-overdue", severity: "critical", message: `${overduePayable.length} conta(s) a pagar vencida(s) no período.` });
  }
  const dueTodayPayable = input.finance.payable.items.filter((i) => i.dueDate === input.todayIso && !i.isOverdue);
  if (dueTodayPayable.length > 0) {
    alerts.push({ id: "payable-due-today", severity: "warning", message: `${dueTodayPayable.length} conta(s) a pagar vencendo hoje.` });
  }

  const withoutPlate = input.appointments.byDay.flatMap((d) => d.items).filter((i) => i.plate === null);
  if (withoutPlate.length > 0) {
    alerts.push({ id: "appointments-no-plate", severity: "info", message: `${withoutPlate.length} agendamento(s) sem placa informada.` });
  }

  if (input.capacity.status === "ok" && input.capacity.applicable && input.capacity.percentOccupied >= 90) {
    alerts.push({ id: "capacity-high", severity: "warning", message: `Ocupação dos boxes em ${input.capacity.percentOccupied.toFixed(0)}% — capacidade quase esgotada.` });
  }

  if (input.stone.status === "unavailable") {
    alerts.push({ id: "stone-unavailable", severity: "info", message: "Dados da Stone indisponíveis para este período." });
  }

  if (input.revenue.realizado === null) {
    alerts.push({ id: "revenue-unavailable", severity: "warning", message: input.revenue.realizadoIndisponivelMotivo ?? "Faturamento realizado indisponível para este período." });
  }

  return alerts;
}
