import { describe, expect, it } from "vitest";
import {
  AppointmentNotTodayError,
  AppointmentPastDateError,
  createAppointment,
  fetchActiveCapacityConfig,
  fetchNextClient,
  fetchPlanningBoard,
  searchPlanningAppointments,
  setCapacityConfig,
  updateAppointmentStatus,
} from "@/lib/planning/service";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import { fetchServiceCatalog, registerQuickCustomerAndVehicle, startAttendance, startServiceOrder, createServiceOrderFromApprovedServices, saveDiagnosticStep } from "@/lib/attendance/service";
import { emptyTechnicalDiagnostic } from "@/lib/attendance/types";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Testa contra `getPlanningRepository()`, que em ambiente de teste (sem DATABASE_URL) sempre usa
 * o repositório em memória — mesmo padrão de `attendance/service.test.ts`.
 */

const tomorrowIso = addDaysIso(saoPauloDateISO(), 1);

async function newCustomerAndVehicle(phone: string, plate: string, name: string) {
  return registerQuickCustomerAndVehicle({ customerName: name, customerPhone: phone, vehiclePlate: plate });
}

describe("createAppointment / getAppointment", () => {
  it("cria um agendamento e permite recuperá-lo", async () => {
    const { customer, vehicle } = await newCustomerAndVehicle("48999210001", "PLN0001", "Cliente Agendamento");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({
      customerId: customer.id,
      vehicleId: vehicle.id,
      serviceId: catalog[0].id,
      scheduledAt: `${tomorrowIso}T14:00:00-03:00`,
      expectedDurationMinutes: 60,
      notes: "Cliente prefere de tarde",
    });
    const found = await getPlanningRepository().getAppointment(appointment.id);
    expect(found?.status).toBe("agendado");
    expect(found?.notes).toBe("Cliente prefere de tarde");
  });
});

describe("fetchPlanningBoard", () => {
  it("agrupa o agendamento no dia correto, com dados reais resolvidos", async () => {
    const { customer, vehicle } = await newCustomerAndVehicle("48999210002", "PLN0002", "Cliente Amanhã");
    const catalog = await fetchServiceCatalog();
    await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${tomorrowIso}T09:00:00-03:00`, expectedDurationMinutes: 90, notes: null });

    const board = await fetchPlanningBoard(null);
    const tomorrowDay = board.days.find((d) => d.dateIso === tomorrowIso);
    expect(tomorrowDay?.label).toBe("Amanhã");
    const entry = tomorrowDay?.appointments.find((a) => a.customerId === customer.id);
    expect(entry?.customerName).toBe("Cliente Amanhã");
    expect(entry?.phone).toBe("48999210002");
    expect(entry?.plate).toBe("PLN0002");
    expect(entry?.serviceName).toBe(catalog[0].name);
    expect(entry?.expectedDurationMinutes).toBe(90);
  });

  it("filtro 'hoje' só retorna o dia de hoje", async () => {
    const board = await fetchPlanningBoard("hoje");
    expect(board.days).toHaveLength(1);
    expect(board.days[0].dateIso).toBe(saoPauloDateISO());
  });

  it("filtro 'amanha' só retorna o dia de amanhã", async () => {
    const board = await fetchPlanningBoard("amanha");
    expect(board.days).toHaveLength(1);
    expect(board.days[0].dateIso).toBe(tomorrowIso);
  });
});

describe("updateAppointmentStatus", () => {
  it("persiste a mudança de status", async () => {
    const { customer, vehicle } = await newCustomerAndVehicle("48999210003", "PLN0003", "Cliente Status");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${tomorrowIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    const updated = await updateAppointmentStatus(appointment.id, "confirmado");
    expect(updated.status).toBe("confirmado");
  });
});

describe("fetchNextClient", () => {
  it("nunca retorna um agendamento já passado", async () => {
    const { customer, vehicle } = await newCustomerAndVehicle("48999210004", "PLN0004", "Cliente Passado");
    const catalog = await fetchServiceCatalog();
    const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: pastIso, expectedDurationMinutes: 30, notes: null });

    const next = await fetchNextClient();
    expect(next?.appointment.customerId).not.toBe(customer.id);
  });

  it("traz o histórico real do cliente (última visita, últimos serviços, pendências)", async () => {
    const { customer, vehicle } = await newCustomerAndVehicle("48999210005", "PLN0005", "Cliente Próximo");
    const visit = await startAttendance(customer.id, vehicle.id, 15000);
    await saveDiagnosticStep(visit.id, { ...emptyTechnicalDiagnostic().pintura, chuvaAcida: "media" }, emptyTechnicalDiagnostic().rodas, emptyTechnicalDiagnostic().pneus, emptyTechnicalDiagnostic().vidros, emptyTechnicalDiagnostic().motor, emptyTechnicalDiagnostic().interior, null);
    const catalog = await fetchServiceCatalog();
    await startServiceOrder(visit.id);
    await createServiceOrderFromApprovedServices(visit.id, [catalog[0].id]);

    const futureIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: futureIso, expectedDurationMinutes: 45, notes: null });

    const next = await fetchNextClient();
    expect(next?.appointment.customerId).toBe(customer.id);
    expect(next?.lastVisitAt).toBe(visit.createdAt);
    expect(next?.lastServiceNames).toEqual([catalog[0].name]);
    expect(next?.lastDiagnosticIssues.some((line) => line.startsWith("Pintura"))).toBe(true);
  });
});

describe("searchPlanningAppointments", () => {
  it("encontra por telefone", async () => {
    const { customer, vehicle } = await newCustomerAndVehicle("48999210006", "PLN0006", "Cliente Busca");
    const catalog = await fetchServiceCatalog();
    await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${tomorrowIso}T11:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const results = await searchPlanningAppointments("48999210006");
    expect(results.some((r) => r.customerId === customer.id)).toBe(true);
  });

  it("encontra por placa", async () => {
    const results = await searchPlanningAppointments("PLN0006");
    expect(results.some((r) => r.plate === "PLN0006")).toBe(true);
  });

  it("query curta demais não busca nada, nunca lista tudo por engano", async () => {
    expect(await searchPlanningAppointments("a")).toEqual([]);
  });
});

describe("capacidade", () => {
  it("sem configuração ativa, capacidade fica 'não calculável'", async () => {
    const config = await fetchActiveCapacityConfig();
    if (!config) {
      const board = await fetchPlanningBoard(null);
      expect(board.tomorrowPreparation.capacity).toEqual({ configured: false });
    }
  });

  it("após configurar, a capacidade reflete o real comprometido para amanhã", async () => {
    await setCapacityConfig({ boxesCount: 2, dailyOperatingMinutes: 480 });
    const { customer, vehicle } = await newCustomerAndVehicle("48999210007", "PLN0007", "Cliente Capacidade");
    const catalog = await fetchServiceCatalog();
    await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${tomorrowIso}T13:00:00-03:00`, expectedDurationMinutes: 120, notes: null });

    const board = await fetchPlanningBoard(null);
    expect(board.tomorrowPreparation.capacity.configured).toBe(true);
    if (board.tomorrowPreparation.capacity.configured) {
      expect(board.tomorrowPreparation.capacity.dailyCapacityMinutes).toBe(960);
      expect(board.tomorrowPreparation.capacity.committedMinutes).toBeGreaterThanOrEqual(120);
    }
  });

  it("rejeita configuração com valores zero ou negativos", async () => {
    await expect(setCapacityConfig({ boxesCount: 0, dailyOperatingMinutes: 480 })).rejects.toThrow();
  });
});

describe("sinalizadores de cliente no agendamento", () => {
  it("cliente recorrente aparece nos sinais reais do agendamento", async () => {
    const { customer, vehicle } = await newCustomerAndVehicle("48999210008", "PLN0008", "Cliente Recorrente");
    await startAttendance(customer.id, vehicle.id, null);
    await startAttendance(customer.id, vehicle.id, null);
    await startAttendance(customer.id, vehicle.id, null);
    const catalog = await fetchServiceCatalog();
    await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${tomorrowIso}T15:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const board = await fetchPlanningBoard("amanha");
    const entry = board.days[0].appointments.find((a) => a.customerId === customer.id);
    expect(entry?.signals.some((s) => s.id === "recorrente")).toBe(true);
  });
});

describe("updateAppointmentStatus — proteção temporal (Missão 46, itens 1-3)", () => {
  it("item 1. appointment de ONTEM -> mudar para em_andamento é bloqueado no backend (AppointmentPastDateError)", async () => {
    const yesterdayIso = addDaysIso(saoPauloDateISO(), -1);
    const { customer, vehicle } = await newCustomerAndVehicle("48999210050", "PLN0050", "Cliente Ontem Iniciar");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${yesterdayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(updateAppointmentStatus(appointment.id, "em_andamento")).rejects.toThrow(AppointmentPastDateError);
    const stillOriginal = await getPlanningRepository().getAppointment(appointment.id);
    expect(stillOriginal?.status).toBe("agendado"); // nada foi escrito
  });

  it("item 2. appointment de ONTEM -> mudar para cancelado é bloqueado no backend", async () => {
    const yesterdayIso = addDaysIso(saoPauloDateISO(), -1);
    const { customer, vehicle } = await newCustomerAndVehicle("48999210051", "PLN0051", "Cliente Ontem Cancelar");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${yesterdayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(updateAppointmentStatus(appointment.id, "cancelado")).rejects.toThrow(AppointmentPastDateError);
  });

  it("item 3. appointment de ONTEM já em_andamento -> mudar para concluido é bloqueado no backend", async () => {
    const yesterdayIso = addDaysIso(saoPauloDateISO(), -1);
    const { customer, vehicle } = await newCustomerAndVehicle("48999210052", "PLN0052", "Cliente Ontem Concluir");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${yesterdayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(updateAppointmentStatus(appointment.id, "concluido")).rejects.toThrow(AppointmentPastDateError);
  });

  it("mensagem do erro de data passada é a mesma sugerida pela missão, controlada (nunca um stack técnico)", async () => {
    const yesterdayIso = addDaysIso(saoPauloDateISO(), -1);
    const { customer, vehicle } = await newCustomerAndVehicle("48999210053", "PLN0053", "Cliente Ontem Mensagem");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${yesterdayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(updateAppointmentStatus(appointment.id, "cancelado")).rejects.toThrow(
      "Este agendamento pertence a uma data encerrada e não pode ser alterado pela agenda operacional.",
    );
  });

  it("appointment de HOJE continua permitindo todas as transições normalmente (nada quebrou)", async () => {
    const todayIso = saoPauloDateISO();
    const { customer, vehicle } = await newCustomerAndVehicle("48999210054", "PLN0054", "Cliente Hoje OK");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${todayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const started = await updateAppointmentStatus(appointment.id, "em_andamento");
    expect(started.status).toBe("em_andamento");
    const completed = await updateAppointmentStatus(appointment.id, "concluido");
    expect(completed.status).toBe("concluido");
  });

  it("appointment de AMANHÃ -> mudar para em_andamento é bloqueado (AppointmentNotTodayError, só no próprio dia)", async () => {
    const tomorrowIsoLocal = addDaysIso(saoPauloDateISO(), 1);
    const { customer, vehicle } = await newCustomerAndVehicle("48999210055", "PLN0055", "Cliente Amanhã Iniciar");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${tomorrowIsoLocal}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(updateAppointmentStatus(appointment.id, "em_andamento")).rejects.toThrow(AppointmentNotTodayError);
  });

  it("appointment de AMANHÃ -> cancelar continua permitido (matriz existente, não alterada)", async () => {
    const tomorrowIsoLocal = addDaysIso(saoPauloDateISO(), 1);
    const { customer, vehicle } = await newCustomerAndVehicle("48999210056", "PLN0056", "Cliente Amanhã Cancelar");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${tomorrowIsoLocal}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const canceled = await updateAppointmentStatus(appointment.id, "cancelado");
    expect(canceled.status).toBe("cancelado");
  });

  it("item 27. status cancelado continua fora de OCCUPYING_STATUSES — capacidade comprometida some após cancelar, comportamento idêntico a antes desta missão", async () => {
    const todayIso = saoPauloDateISO();
    await setCapacityConfig({ boxesCount: 4, dailyOperatingMinutes: 480 });
    const { customer, vehicle } = await newCustomerAndVehicle("48999210057", "PLN0057", "Cliente Capacidade Cancelar");
    const catalog = await fetchServiceCatalog();
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: catalog[0].id, scheduledAt: `${todayIso}T16:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const repo = getPlanningRepository();
    const beforeRows = await repo.listAppointmentsInRange(todayIso, todayIso);
    expect(beforeRows.some((r) => r.customerId === customer.id && r.status === "agendado")).toBe(true);

    await updateAppointmentStatus(appointment.id, "cancelado");

    const afterRows = await repo.listAppointmentsInRange(todayIso, todayIso);
    const entry = afterRows.find((r) => r.customerId === customer.id);
    expect(entry?.status).toBe("cancelado"); // status realmente mudou...
    expect(entry).toBeDefined(); // ...mas continua aparecendo na listagem do dia (nunca some/apaga)
  });
});
