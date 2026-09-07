import { describe, expect, it } from "vitest";
import {
  computeOccupiedNow,
  computeSimultaneousOccupancyMap,
  findNextAvailableSlot,
  formatNextAvailability,
  resolveDayParam,
  resolveExpedienteWindow,
  type ResolvedDurationAppointment,
} from "@/lib/planning/dayView";
import { fetchDayView, createAppointment, setCapacityConfig, updateAppointmentStatus } from "@/lib/planning/service";
import { registerQuickCustomerAndVehicle, fetchServiceCatalog } from "@/lib/attendance/service";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Missão 40 (Fase 1 — Agenda Operacional Visual). Testes puros contra as funções de `dayView.ts`
 * (sem banco) + testes de integração de `fetchDayView` contra o repositório em memória (mesmo
 * padrão de `availability.test.ts`/`service.test.ts`). Dias usados nos testes de integração ficam
 * bem afastados dos usados em outros arquivos de teste (offsets 30+) para nunca colidir no
 * repositório em memória compartilhado do processo.
 */

const day = "2026-09-07";

function occ(id: string, scheduledAt: string, durationMinutes: number | null): ResolvedDurationAppointment {
  return { id, scheduledAt, durationMinutes };
}

describe("resolveDayParam — navegação de dia (A/B/C/D/E)", () => {
  const todayIso = "2026-09-07";

  it("A. sem parâmetro válido, cai em hoje", () => {
    expect(resolveDayParam(undefined, todayIso)).toBe(todayIso);
    expect(resolveDayParam("data-invalida", todayIso)).toBe(todayIso);
  });

  it("B. 'Hoje' é o próprio todayIso", () => {
    expect(resolveDayParam(todayIso, todayIso)).toBe(todayIso);
  });

  it("C. dia anterior/próximo navegam via addDaysIso, aceito como parâmetro válido", () => {
    expect(resolveDayParam(addDaysIso(todayIso, -1), todayIso)).toBe("2026-09-06");
    expect(resolveDayParam(addDaysIso(todayIso, 1), todayIso)).toBe("2026-09-08");
  });

  it("D. virada de mês", () => {
    expect(addDaysIso("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysIso("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("E. virada de ano", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("resolveExpedienteWindow", () => {
  it("início sempre 08:00 América/São Paulo; fim = início + dailyOperatingMinutes real, nunca reinventado", () => {
    const { startMs, endMs } = resolveExpedienteWindow(day, 480);
    expect(new Date(startMs).toISOString()).toBe(`${day}T11:00:00.000Z`); // 08:00 -03:00 = 11:00 UTC
    expect(endMs - startMs).toBe(480 * 60_000);
  });
});

describe("computeOccupiedNow — capacidade ocupada agora (N/Q)", () => {
  it("N. intervalo 08:00–09:00: ocupado às 08:00 e 08:59, livre às 09:00 (limite final exclusivo)", () => {
    const appts = [occ("a1", `${day}T08:00:00-03:00`, 60)];
    expect(computeOccupiedNow(appts, Date.parse(`${day}T08:00:00-03:00`)).occupiedCount).toBe(1);
    expect(computeOccupiedNow(appts, Date.parse(`${day}T08:59:00-03:00`)).occupiedCount).toBe(1);
    expect(computeOccupiedNow(appts, Date.parse(`${day}T09:00:00-03:00`)).occupiedCount).toBe(0);
  });

  it("J. 1 agendamento ativo -> 1 posição ocupada", () => {
    const appts = [occ("a1", `${day}T10:00:00-03:00`, 30)];
    expect(computeOccupiedNow(appts, Date.parse(`${day}T10:15:00-03:00`)).occupiedCount).toBe(1);
  });

  it("K. 3 simultâneos -> 3 posições ocupadas", () => {
    const now = Date.parse(`${day}T10:15:00-03:00`);
    const appts = [occ("a1", `${day}T10:00:00-03:00`, 30), occ("a2", `${day}T10:05:00-03:00`, 30), occ("a3", `${day}T10:10:00-03:00`, 30)];
    expect(computeOccupiedNow(appts, now).occupiedCount).toBe(3);
  });

  it("Q. duração desconhecida nunca vira zero — conta como indeterminado, não ocupado nem livre", () => {
    const now = Date.parse(`${day}T10:15:00-03:00`);
    const appts = [occ("a1", `${day}T10:00:00-03:00`, null)];
    const result = computeOccupiedNow(appts, now);
    expect(result.occupiedCount).toBe(0);
    expect(result.indeterminateCount).toBe(1);
  });

  it("agendamento que ainda não começou nunca ocupa 'agora', mesmo com duração conhecida", () => {
    const now = Date.parse(`${day}T09:00:00-03:00`);
    const appts = [occ("a1", `${day}T10:00:00-03:00`, 30)];
    expect(computeOccupiedNow(appts, now)).toEqual({ occupiedCount: 0, indeterminateCount: 0 });
  });
});

describe("computeSimultaneousOccupancyMap", () => {
  it("L. capacidade 5 + 3 simultâneos -> contagem real de 3 para cada um envolvido (independente do denominador de capacidade)", () => {
    const appts = [occ("a1", `${day}T10:00:00-03:00`, 30), occ("a2", `${day}T10:05:00-03:00`, 30), occ("a3", `${day}T10:10:00-03:00`, 30)];
    const map = computeSimultaneousOccupancyMap(appts);
    expect(map.get("a1")).toBe(3);
    expect(map.get("a2")).toBe(3);
    expect(map.get("a3")).toBe(3);
  });

  it("duração indeterminada -> null, nunca inclui/exclui por suposição", () => {
    const appts = [occ("a1", `${day}T10:00:00-03:00`, null)];
    expect(computeSimultaneousOccupancyMap(appts).get("a1")).toBeNull();
  });

  it("sem sobreposição -> 1 (só o próprio)", () => {
    const appts = [occ("a1", `${day}T08:00:00-03:00`, 30), occ("a2", `${day}T14:00:00-03:00`, 30)];
    const map = computeSimultaneousOccupancyMap(appts);
    expect(map.get("a1")).toBe(1);
    expect(map.get("a2")).toBe(1);
  });
});

describe("findNextAvailableSlot — próxima disponibilidade (S)", () => {
  const window = resolveExpedienteWindow(day, 480); // 08:00–16:00 -03:00

  it("sem capacidade configurada -> nao_configurado", () => {
    expect(findNextAvailableSlot([], null, { nowMs: window.startMs, expedienteStartMs: window.startMs, expedienteEndMs: window.endMs, granularityMinutes: 15 })).toEqual({
      status: "nao_configurado",
    });
  });

  it("capacidade livre agora -> 'agora'", () => {
    const result = findNextAvailableSlot([], { boxesCount: 2 }, { nowMs: Date.parse(`${day}T10:00:00-03:00`), expedienteStartMs: window.startMs, expedienteEndMs: window.endMs, granularityMinutes: 15 });
    expect(result).toEqual({ status: "agora" });
  });

  it("capacidade cheia agora, livre às 10:15 -> retorna o horário real, nunca um serviço/duração inventados", () => {
    const appts = [occ("a1", `${day}T10:00:00-03:00`, 15), occ("a2", `${day}T10:00:00-03:00`, 15)];
    const result = findNextAvailableSlot(appts, { boxesCount: 2 }, { nowMs: Date.parse(`${day}T10:00:00-03:00`), expedienteStartMs: window.startMs, expedienteEndMs: window.endMs, granularityMinutes: 15 });
    expect(result).toEqual({ status: "horario", time: "10:15" });
  });

  it("dia cheio o expediente inteiro -> sem_disponibilidade", () => {
    const appts = [occ("full1", `${day}T08:00:00-03:00`, 480), occ("full2", `${day}T08:00:00-03:00`, 480)];
    const result = findNextAvailableSlot(appts, { boxesCount: 2 }, { nowMs: window.startMs, expedienteStartMs: window.startMs, expedienteEndMs: window.endMs, granularityMinutes: 15 });
    expect(result).toEqual({ status: "sem_disponibilidade" });
  });

  it("expediente já encerrado -> expediente_encerrado", () => {
    const result = findNextAvailableSlot([], { boxesCount: 2 }, { nowMs: window.endMs + 1, expedienteStartMs: window.startMs, expedienteEndMs: window.endMs, granularityMinutes: 15 });
    expect(result).toEqual({ status: "expediente_encerrado" });
  });

  it("antes da abertura, nunca retorna 'agora' nem horário fora do expediente — primeiro slot é o início real", () => {
    const result = findNextAvailableSlot([], { boxesCount: 2 }, { nowMs: window.startMs - 60 * 60_000, expedienteStartMs: window.startMs, expedienteEndMs: window.endMs, granularityMinutes: 15 });
    expect(result).toEqual({ status: "horario", time: "08:00" });
  });

  it("nunca retorna horário >= fim do expediente", () => {
    const appts = [occ("a1", `${day}T15:50:00-03:00`, 60)]; // ocupa até 16:50, mas expediente termina às 16:00
    const result = findNextAvailableSlot(appts, { boxesCount: 1 }, { nowMs: Date.parse(`${day}T15:50:00-03:00`), expedienteStartMs: window.startMs, expedienteEndMs: window.endMs, granularityMinutes: 15 });
    expect(result).toEqual({ status: "sem_disponibilidade" });
  });
});

describe("formatNextAvailability", () => {
  it("mapeia cada status para o texto esperado", () => {
    expect(formatNextAvailability({ status: "agora" })).toBe("Agora");
    expect(formatNextAvailability({ status: "horario", time: "14:15" })).toBe("14:15");
    expect(formatNextAvailability({ status: "sem_disponibilidade" })).toBe("Sem disponibilidade hoje");
    expect(formatNextAvailability({ status: "expediente_encerrado" })).toBe("Expediente encerrado");
    expect(formatNextAvailability({ status: "nao_configurado" })).toBe("Capacidade não configurada");
  });
});

describe("fetchDayView — integração real com o repositório em memória (F/G/H/I/M/O/P/T/U)", () => {
  it("F/G/H. carga e denominador de capacidade acompanham a config real (2, 4 e 5), nunca hard-coded", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 30);
    await setCapacityConfig({ boxesCount: 2, dailyOperatingMinutes: 480 });
    const view2 = await fetchDayView(dayIso);
    expect(view2.capacity.configured && view2.capacity.boxesCount).toBe(2);

    await setCapacityConfig({ boxesCount: 4, dailyOperatingMinutes: 480 });
    const view4 = await fetchDayView(dayIso);
    expect(view4.capacity.configured && view4.capacity.boxesCount).toBe(4);

    await setCapacityConfig({ boxesCount: 5, dailyOperatingMinutes: 480 });
    const view5 = await fetchDayView(dayIso);
    expect(view5.capacity.configured && view5.capacity.boxesCount).toBe(5);
  });

  it("M. capacidade 2 + 3 simultâneos -> sobrecarga fica visível (occupiedNowCount > boxesCount), nunca escondida", async () => {
    await setCapacityConfig({ boxesCount: 2, dailyOperatingMinutes: 480 });
    const nowIso = new Date().toISOString();
    for (const [phone, plate] of [
      ["48999340001", "SBC0001"],
      ["48999340002", "SBC0002"],
      ["48999340003", "SBC0003"],
    ] as const) {
      const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: `Cliente ${plate}`, customerPhone: phone, vehiclePlate: plate });
      const catalog = await fetchServiceCatalog();
      await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: nowIso, expectedDurationMinutes: 60, notes: null });
    }

    const todayView = await fetchDayView(saoPauloDateISO());
    expect(todayView.occupiedNowCount).toBeGreaterThanOrEqual(3);
    expect(todayView.capacity.configured && todayView.capacity.boxesCount).toBe(2);
  });

  it("O/P. cancelado nunca ocupa; reagendado segue OCCUPYING_STATUSES (também não ocupa)", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 32);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Cliente Cancelado", customerPhone: "48999340010", vehiclePlate: "SBC0010" });
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    await updateAppointmentStatus(appointment.id, "cancelado");

    const { customer: c2, vehicle: v2 } = await registerQuickCustomerAndVehicle({ customerName: "Cliente Reagendado", customerPhone: "48999340011", vehiclePlate: "SBC0011" });
    const appointment2 = await createAppointment({ customerId: c2.id, vehicleId: v2.id, serviceId: catalog[0].id, scheduledAt: `${dayIso}T11:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    await updateAppointmentStatus(appointment2.id, "reagendado");

    const view = await fetchDayView(dayIso);
    expect(view.appointmentCount).toBe(2); // aparecem na lista do dia...
    expect(view.capacity.configured && view.capacity.committedMinutes).toBe(0); // ...mas nenhum entra na capacidade comprometida
  });

  it("U. estado vazio: sem agendamentos, ainda retorna data/capacidade/próxima disponibilidade normalmente", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 33);
    await setCapacityConfig({ boxesCount: 2, dailyOperatingMinutes: 480 });
    const view = await fetchDayView(dayIso);
    expect(view.appointments).toEqual([]);
    expect(view.appointmentCount).toBe(0);
    expect(view.dateIso).toBe(dayIso);
    expect(view.capacity.configured).toBe(true);
  });

  it("T. horário previsto de término é calculado corretamente através da virada de dia UTC/São Paulo", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 34);
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Cliente Virada", customerPhone: "48999340020", vehiclePlate: "SBC0020" });
    const catalog = await fetchServiceCatalog();
    await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${dayIso}T23:30:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const view = await fetchDayView(dayIso);
    const entry = view.appointments.find((a) => a.customerId === customer.id);
    expect(entry?.resolvedDurationMinutes).toBe(60);
    expect(entry?.endAt).toBe(new Date(Date.parse(`${dayIso}T23:30:00-03:00`) + 60 * 60_000).toISOString());
  });
});
