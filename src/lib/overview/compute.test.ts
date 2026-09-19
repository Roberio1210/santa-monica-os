import { describe, expect, it } from "vitest";
import {
  buildAppointmentsSection,
  buildCapacitySection,
  buildFinanceSection,
  buildOverviewAlerts,
  buildServicesSection,
  filterPayableDueInRange,
  filterReceivableDueInRange,
  groupAppointmentsByDay,
  summarizeAppointmentsByStatus,
} from "@/lib/overview/compute";
import type { AppointmentRow } from "@/lib/planning/repository";
import type { AccountsReceivableView, AccountsPayableView } from "@/lib/finance/types";
import type { OverviewAppointmentsSection, OverviewCapacitySection, OverviewFinanceSection, OverviewRevenueSection, OverviewStoneSection } from "@/lib/overview/types";

function row(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: "apt-1",
    scheduledAt: "2026-09-19T14:00:00.000Z", // 11:00 em São Paulo (UTC-3)
    status: "agendado",
    customerId: "cust-1",
    customerName: "Maria",
    phone: "11999999999",
    vehicleId: "veh-1",
    vehicleLabel: "Onix Prata",
    plate: "ABC1234",
    serviceId: "svc-1",
    serviceName: "Lavagem Gold",
    expectedDurationMinutes: 60,
    notes: null,
    updatedAt: "2026-09-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("groupAppointmentsByDay — Missão 82 (timezone São Paulo)", () => {
  it("agrupa pelo dia CALENDÁRIO de São Paulo, nunca pelo dia UTC", () => {
    // 2026-09-19T14:00:00.000Z = 2026-09-19T11:00:00 em São Paulo (mesmo dia) — caso trivial.
    const groups = groupAppointmentsByDay([row({ scheduledAt: "2026-09-19T14:00:00.000Z" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].dateIso).toBe("2026-09-19");
  });

  it("borda de virada de dia: 2026-09-20T02:30:00Z é 2026-09-19 23:30 em São Paulo — nunca cai no dia 20 por engano", () => {
    const groups = groupAppointmentsByDay([row({ scheduledAt: "2026-09-20T02:30:00.000Z" })]);
    expect(groups[0].dateIso).toBe("2026-09-19");
  });

  it("agenda vazia -> lista vazia, nunca erro", () => {
    expect(groupAppointmentsByDay([])).toEqual([]);
  });

  it("agrupa e ordena múltiplos dias corretamente", () => {
    const groups = groupAppointmentsByDay([
      row({ id: "a", scheduledAt: "2026-09-20T14:00:00.000Z" }),
      row({ id: "b", scheduledAt: "2026-09-19T14:00:00.000Z" }),
      row({ id: "c", scheduledAt: "2026-09-19T12:00:00.000Z" }),
    ]);
    expect(groups.map((g) => g.dateIso)).toEqual(["2026-09-19", "2026-09-20"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["c", "b"]); // ordenado por horário dentro do dia
  });

  it("placa ausente aparece como null, nunca inventada", () => {
    const groups = groupAppointmentsByDay([row({ plate: null })]);
    expect(groups[0].items[0].plate).toBeNull();
  });
});

describe("summarizeAppointmentsByStatus", () => {
  it("conta por status real, nunca soma tudo num status genérico", () => {
    const counts = summarizeAppointmentsByStatus([row({ status: "agendado" }), row({ status: "concluido" }), row({ status: "concluido" })]);
    expect(counts).toEqual({ agendado: 1, concluido: 2 });
  });
});

describe("buildAppointmentsSection", () => {
  it("status sempre 'ok' — a fonte (appointments) é sempre confiável quando existe", () => {
    const section: OverviewAppointmentsSection = buildAppointmentsSection([row()]);
    expect(section.status).toBe("ok");
    expect(section.totalCount).toBe(1);
  });
});

describe("buildServicesSection — Missão 82 (regra anti-dupla-contagem)", () => {
  it("concluido conta como realizado, demais status ocupantes contam como previsto", () => {
    const rows = [row({ status: "concluido", serviceName: "Lavagem Gold" }), row({ status: "agendado", serviceName: "Lavagem Gold" }), row({ status: "confirmado", serviceName: "Lavagem Gold" })];
    const section = buildServicesSection(rows);
    expect(section.byService).toEqual([{ serviceName: "Lavagem Gold", realizadoCount: 1, previstoCount: 2 }]);
  });

  it("cancelado e reagendado NUNCA entram na contagem (não representam trabalho a fazer nesta data)", () => {
    const rows = [row({ status: "cancelado" }), row({ status: "reagendado" })];
    const section = buildServicesSection(rows);
    expect(section.byService).toEqual([]);
  });

  it("cada agendamento é contado exatamente uma vez — nunca duplicado entre realizado/previsto", () => {
    const rows = [row({ id: "a", status: "concluido" }), row({ id: "b", status: "agendado" })];
    const section = buildServicesSection(rows);
    const total = section.byService.reduce((sum, s) => sum + s.realizadoCount + s.previstoCount, 0);
    expect(total).toBe(2);
  });
});

describe("buildCapacitySection — Missão 82 (Parte J)", () => {
  it("período de mais de 1 dia -> indisponível, nunca soma capacidade diária por vários dias", () => {
    const section = buildCapacitySection({ from: "2026-09-01", to: "2026-09-07" }, { id: "cfg-1", boxesCount: 3, dailyOperatingMinutes: 480 }, []);
    expect(section).toEqual({ status: "unavailable", applicable: false, reason: expect.stringContaining("por dia") });
  });

  it("sem configuração ativa -> indisponível, nunca capacidade padrão inventada", () => {
    const section = buildCapacitySection({ from: "2026-09-19", to: "2026-09-19" }, null, []);
    expect(section.status).toBe("unavailable");
    if (section.status === "unavailable") expect(section.applicable).toBe(true);
  });

  it("1 dia com config ativa -> calcula via engine real (computeCapacitySummary), nunca cálculo paralelo", () => {
    const section: OverviewCapacitySection = buildCapacitySection({ from: "2026-09-19", to: "2026-09-19" }, { id: "cfg-1", boxesCount: 2, dailyOperatingMinutes: 480 }, [{ expectedDurationMinutes: 240 }]);
    expect(section).toMatchObject({ status: "ok", applicable: true, dailyCapacityMinutes: 960, committedMinutes: 240, availableMinutes: 720 });
  });
});

describe("filterReceivableDueInRange / filterPayableDueInRange", () => {
  it("só entra conta com saldo em aberto e vencimento dentro do período", () => {
    const items = [
      { id: "1", description: "A", partyName: "Cliente A", dueDate: "2026-09-10", outstandingAmount: 100, isOverdue: false, computedStatus: "open" } as AccountsReceivableView,
      { id: "2", description: "B", partyName: "Cliente B", dueDate: "2026-09-25", outstandingAmount: 200, isOverdue: false, computedStatus: "open" } as AccountsReceivableView,
      { id: "3", description: "C", partyName: "Cliente C", dueDate: "2026-09-10", outstandingAmount: 0, isOverdue: false, computedStatus: "paid" } as AccountsReceivableView,
    ];
    const result = filterReceivableDueInRange(items, "2026-09-01", "2026-09-15");
    expect(result.map((i) => i.id)).toEqual(["1"]);
  });

  it("conta cancelada nunca entra, mesmo com outstandingAmount > 0 (dado inconsistente defensivo)", () => {
    const items = [{ id: "1", description: "A", partyName: "P", dueDate: "2026-09-10", outstandingAmount: 100, isOverdue: false, computedStatus: "cancelled" } as AccountsReceivableView];
    expect(filterReceivableDueInRange(items, "2026-09-01", "2026-09-15")).toEqual([]);
  });

  it("payable: fornecedor ausente vira texto explícito, nunca omitido", () => {
    const items = [{ id: "1", description: "A", partyName: undefined, supplierName: null, dueDate: "2026-09-10", outstandingAmount: 50, isOverdue: false, computedStatus: "pendente" } as unknown as AccountsPayableView];
    const result = filterPayableDueInRange(items, "2026-09-01", "2026-09-15");
    expect(result[0].partyName).toBe("Sem fornecedor informado");
  });
});

describe("buildFinanceSection", () => {
  it("soma total = soma dos itens filtrados, nunca um valor à parte", () => {
    const section: OverviewFinanceSection = buildFinanceSection(
      [{ id: "1", description: "A", partyName: "P", dueDate: "2026-09-10", amount: 100, isOverdue: false }],
      [{ id: "2", description: "B", partyName: "F", dueDate: "2026-09-10", amount: 40, isOverdue: true }],
    );
    expect(section.receivable.totalAmount).toBe(100);
    expect(section.payable.totalAmount).toBe(40);
  });
});

describe("buildOverviewAlerts — Missão 82 (determinístico, nunca IA)", () => {
  const baseFinance: OverviewFinanceSection = { status: "ok", receivable: { totalAmount: 0, items: [] }, payable: { totalAmount: 0, items: [] } };
  const baseAppointments: OverviewAppointmentsSection = { status: "ok", totalCount: 0, countByStatus: {}, byDay: [] };
  const baseCapacity: OverviewCapacitySection = { status: "unavailable", applicable: false, reason: "x" };
  const baseStone: OverviewStoneSection = { status: "ok", saldoDisponivel: null, saldoIndisponivelMotivo: "x", vendasNoPeriodo: { count: 0, netAmount: 0 }, liquidacoesNoPeriodo: { count: 0, settledAmount: 0 }, ultimaSincronizacao: null };
  const baseRevenue: OverviewRevenueSection = { status: "ok", realizado: 100, realizadoIndisponivelMotivo: null, realizadoEstetica: 100, realizadoEstacionamento: 0, recebido: 90, recebidoIndisponivelMotivo: null, previsto: 0 };

  it("conta vencida gera alerta crítico", () => {
    const alerts = buildOverviewAlerts({
      todayIso: "2026-09-19",
      finance: { ...baseFinance, receivable: { totalAmount: 100, items: [{ id: "1", description: "A", partyName: "P", dueDate: "2026-09-01", amount: 100, isOverdue: true }] } },
      appointments: baseAppointments,
      capacity: baseCapacity,
      stone: baseStone,
      revenue: baseRevenue,
    });
    expect(alerts).toContainEqual(expect.objectContaining({ id: "receivable-overdue", severity: "critical" }));
  });

  it("agendamento sem placa gera alerta informativo", () => {
    const alerts = buildOverviewAlerts({
      todayIso: "2026-09-19",
      finance: baseFinance,
      appointments: { ...baseAppointments, byDay: [{ dateIso: "2026-09-19", items: [{ id: "a", scheduledAt: "2026-09-19T14:00:00Z", status: "agendado", customerName: "M", vehicleLabel: "V", plate: null, serviceName: "S", expectedDurationMinutes: 60 }] }] },
      capacity: baseCapacity,
      stone: baseStone,
      revenue: baseRevenue,
    });
    expect(alerts).toContainEqual(expect.objectContaining({ id: "appointments-no-plate" }));
  });

  it("Stone indisponível gera alerta, mas nunca some com os outros alertas", () => {
    const alerts = buildOverviewAlerts({ todayIso: "2026-09-19", finance: baseFinance, appointments: baseAppointments, capacity: baseCapacity, stone: { ...baseStone, status: "unavailable" }, revenue: baseRevenue });
    expect(alerts).toContainEqual(expect.objectContaining({ id: "stone-unavailable" }));
  });

  it("nenhum alerta quando tudo está normal", () => {
    const alerts = buildOverviewAlerts({ todayIso: "2026-09-19", finance: baseFinance, appointments: baseAppointments, capacity: baseCapacity, stone: baseStone, revenue: baseRevenue });
    expect(alerts).toEqual([]);
  });
});
