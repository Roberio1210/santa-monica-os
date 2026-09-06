import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { fetchServiceCatalog, registerQuickCustomerAndVehicle } from "@/lib/attendance/service";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import { AppointmentAvailabilityError, createAppointment, createAppointmentWithNewCustomerAtomic, setCapacityConfig } from "@/lib/planning/service";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Missão de Atomicidade Planejamento — prova o comportamento de `createAppointmentWithNewCustomerAtomic`
 * (`planning/service.ts`): sucesso atômico, rollback em cada um dos 3 pontos de falha, e que
 * registros REAPROVEITADOS nunca são afetados por rollback.
 *
 * Testes B-H exigem um Postgres real (`TEST_DATABASE_URL`) — o repositório em memória usado no
 * resto da suíte não tem transação de verdade, então não há rollback a provar nele. Ficam
 * marcados `skip` automaticamente quando essa variável não está definida (nunca rodam contra
 * `DATABASE_URL` de produção — ver `docs/database-and-auth-setup-guide.md`, "Como rodar os testes
 * com segurança"). Testes A e I não precisam de Postgres real e rodam sempre.
 *
 * Offsets de dia (100+) escolhidos deliberadamente acima de qualquer usado em
 * `src/app/planejamento/actions.test.ts` (máximo 41) para nunca colidir com esses testes quando
 * ambos os arquivos rodam contra o mesmo Postgres real.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;

let counter = 0;
function uniquePhone(prefix: number): string {
  counter++;
  return `48999${prefix}${String(counter).padStart(4, "0")}`;
}

beforeEach(async () => {
  await setCapacityConfig({ boxesCount: 3, dailyOperatingMinutes: 480 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createAppointmentWithNewCustomerAtomic — sem Postgres real (roda sempre)", () => {
  it("A. registerQuickCustomerAndVehicle e createAppointment continuam funcionando sem runner (compatibilidade retroativa)", async () => {
    const phone = uniquePhone(0);
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({
      customerName: `CompatA ${counter}`,
      customerPhone: phone,
      vehiclePlate: null,
      vehicleModel: "Fiat Uno",
    });
    expect(customer.id).toBeTruthy();
    expect(vehicle.plate).toBeNull();

    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 100);
    const appointment = await createAppointment({
      customerId: customer.id,
      vehicleId: vehicle.id,
      serviceId: catalog[0].id,
      scheduledAt: `${dayIso}T09:00:00-03:00`,
      expectedDurationMinutes: 60,
      notes: null,
    });
    expect(appointment.id).toBeTruthy();
    expect(appointment.status).toBe("agendado");
  });

  it("I. indisponibilidade impede a criação — AppointmentAvailabilityError, nada é escrito", async () => {
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 101);

    const occupantPhone = uniquePhone(1);
    const occupant = await registerQuickCustomerAndVehicle({
      customerName: `Ocupante ${counter}`,
      customerPhone: occupantPhone,
      vehiclePlate: null,
      vehicleModel: "Onix",
    });
    await createAppointment({
      customerId: occupant.customer.id,
      vehicleId: occupant.vehicle.id,
      serviceId: catalog[0].id,
      scheduledAt: `${dayIso}T10:00:00-03:00`,
      expectedDurationMinutes: 60,
      notes: null,
    });

    const conflictPhone = uniquePhone(2);
    await expect(
      createAppointmentWithNewCustomerAtomic({
        register: { customerName: `Conflitante ${counter}`, customerPhone: conflictPhone, vehiclePlate: null, vehicleModel: "Argo" },
        serviceId: catalog[0].id,
        scheduledAt: `${dayIso}T10:30:00-03:00`,
        expectedDurationMinutes: 60,
      }),
    ).rejects.toBeInstanceOf(AppointmentAvailabilityError);

    const found = await getAttendanceRepository().findCustomerByPhone(conflictPhone);
    expect(found).toBeNull();
  });
});

describe.skipIf(!hasRealDb)("createAppointmentWithNewCustomerAtomic — requer Postgres real (TEST_DATABASE_URL)", () => {
  it("B. sucesso atômico — customer + vehicle + appointment novos, todos existem após commit", async () => {
    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 102);
    const phone = uniquePhone(3);

    const result = await createAppointmentWithNewCustomerAtomic({
      register: { customerName: `Atomico ${counter}`, customerPhone: phone, vehiclePlate: null, vehicleModel: "Ford Ka" },
      serviceId: catalog[0].id,
      scheduledAt: `${dayIso}T09:00:00-03:00`,
      expectedDurationMinutes: 60,
    });

    expect(result.customer.id).toBeTruthy();
    expect(result.vehicle.id).toBeTruthy();
    expect(result.appointment.id).toBeTruthy();

    const persistedCustomer = await getAttendanceRepository().findCustomerByPhone(phone);
    expect(persistedCustomer?.id).toBe(result.customer.id);
    const persistedVehicle = await getAttendanceRepository().getVehicle(result.vehicle.id);
    expect(persistedVehicle).not.toBeNull();
    const persistedAppointment = await getPlanningRepository().getAppointment(result.appointment.id);
    expect(persistedAppointment).not.toBeNull();
  });

  it("C. falha no customer -> nenhum registro novo permanece", async () => {
    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 103);
    const phone = uniquePhone(4);

    const repo = getAttendanceRepository();
    vi.spyOn(repo, "createCustomer").mockRejectedValueOnce(new Error("Falha simulada no customer"));

    await expect(
      createAppointmentWithNewCustomerAtomic({
        register: { customerName: `FalhaCustomer ${counter}`, customerPhone: phone, vehiclePlate: null, vehicleModel: "Gol" },
        serviceId: catalog[0].id,
        scheduledAt: `${dayIso}T09:00:00-03:00`,
        expectedDurationMinutes: 60,
      }),
    ).rejects.toThrow("Falha simulada no customer");

    expect(await repo.findCustomerByPhone(phone)).toBeNull();
    expect(await getPlanningRepository().listAppointmentsInRange(dayIso, dayIso)).toHaveLength(0);
  });

  it("D. falha no vehicle após customer criado -> customer novo também sofre rollback", async () => {
    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 104);
    const phone = uniquePhone(5);

    const repo = getAttendanceRepository();
    vi.spyOn(repo, "createVehicle").mockRejectedValueOnce(new Error("Falha simulada no vehicle"));

    await expect(
      createAppointmentWithNewCustomerAtomic({
        register: { customerName: `FalhaVehicle ${counter}`, customerPhone: phone, vehiclePlate: null, vehicleModel: "Celta" },
        serviceId: catalog[0].id,
        scheduledAt: `${dayIso}T09:00:00-03:00`,
        expectedDurationMinutes: 60,
      }),
    ).rejects.toThrow("Falha simulada no vehicle");

    expect(await repo.findCustomerByPhone(phone)).toBeNull();
    expect(await getPlanningRepository().listAppointmentsInRange(dayIso, dayIso)).toHaveLength(0);
  });

  it("E. falha no appointment após customer+vehicle -> ambos novos sofrem rollback", async () => {
    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 105);
    const phone = uniquePhone(6);

    const planningRepo = getPlanningRepository();
    vi.spyOn(planningRepo, "createAppointment").mockRejectedValueOnce(new Error("Falha simulada no appointment"));

    await expect(
      createAppointmentWithNewCustomerAtomic({
        register: { customerName: `FalhaAppointment ${counter}`, customerPhone: phone, vehiclePlate: null, vehicleModel: "HB20" },
        serviceId: catalog[0].id,
        scheduledAt: `${dayIso}T09:00:00-03:00`,
        expectedDurationMinutes: 60,
      }),
    ).rejects.toThrow("Falha simulada no appointment");

    expect(await getAttendanceRepository().findCustomerByPhone(phone)).toBeNull();
    expect(await planningRepo.listAppointmentsInRange(dayIso, dayIso)).toHaveLength(0);
  });

  it("F. reutilização — customer e vehicle preexistentes + falha no appointment -> ambos continuam intactos", async () => {
    const phone = uniquePhone(7);
    const plate = `PRE${String(counter).padStart(4, "0")}`;
    const pre = await registerQuickCustomerAndVehicle({
      customerName: `Preexistente ${counter}`,
      customerPhone: phone,
      vehiclePlate: plate,
      vehicleModel: "Civic",
    });

    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 106);

    const planningRepo = getPlanningRepository();
    vi.spyOn(planningRepo, "createAppointment").mockRejectedValueOnce(new Error("Falha simulada"));

    await expect(
      createAppointmentWithNewCustomerAtomic({
        register: { customerName: pre.customer.name ?? "Cliente", customerPhone: phone, vehiclePlate: plate, vehicleModel: "Civic" },
        serviceId: catalog[0].id,
        scheduledAt: `${dayIso}T09:00:00-03:00`,
        expectedDurationMinutes: 60,
      }),
    ).rejects.toThrow();

    const stillThere = await getAttendanceRepository().findCustomerByPhone(phone);
    expect(stillThere?.id).toBe(pre.customer.id);
    const vehicleStillThere = await getAttendanceRepository().getVehicle(pre.vehicle.id);
    expect(vehicleStillThere).not.toBeNull();
    expect(vehicleStillThere?.plate).toBe(plate);
  });

  it("G. cenário misto — customer preexistente + vehicle novo + falha no appointment -> customer permanece, vehicle novo é desfeito", async () => {
    const phone = uniquePhone(8);
    const pre = await registerQuickCustomerAndVehicle({
      customerName: `MistoPre ${counter}`,
      customerPhone: phone,
      vehiclePlate: null,
      vehicleModel: "Fusca",
    });

    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 107);

    const planningRepo = getPlanningRepository();
    vi.spyOn(planningRepo, "createAppointment").mockRejectedValueOnce(new Error("Falha simulada"));

    // Mesmo telefone (customer reaproveitado), plate=null de novo (Missão 3.2.3: sem placa, sempre
    // cria um veículo NOVO — nunca deduplica por modelo) -> este vehicle é criado nesta transação.
    await expect(
      createAppointmentWithNewCustomerAtomic({
        register: { customerName: pre.customer.name ?? "Cliente", customerPhone: phone, vehiclePlate: null, vehicleModel: "Kombi" },
        serviceId: catalog[0].id,
        scheduledAt: `${dayIso}T09:00:00-03:00`,
        expectedDurationMinutes: 60,
      }),
    ).rejects.toThrow();

    const stillThere = await getAttendanceRepository().findCustomerByPhone(phone);
    expect(stillThere?.id).toBe(pre.customer.id);

    const vehiclesForCustomer = await getAttendanceRepository().listVehiclesByCustomer(pre.customer.id);
    expect(vehiclesForCustomer).toHaveLength(1);
    expect(vehiclesForCustomer[0].id).toBe(pre.vehicle.id);
  });

  it("H. plate=NULL — fluxo atômico continua permitindo veículo novo sem placa", async () => {
    const phone = uniquePhone(9);
    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 108);

    const result = await createAppointmentWithNewCustomerAtomic({
      register: { customerName: `SemPlacaAtomico ${counter}`, customerPhone: phone, vehiclePlate: null, vehicleModel: "Fiat Argo" },
      serviceId: catalog[0].id,
      scheduledAt: `${dayIso}T09:00:00-03:00`,
      expectedDurationMinutes: 60,
    });

    expect(result.vehicle.plate).toBeNull();
    const persisted = await getAttendanceRepository().getVehicle(result.vehicle.id);
    expect(persisted?.plate).toBeNull();
  });
});
