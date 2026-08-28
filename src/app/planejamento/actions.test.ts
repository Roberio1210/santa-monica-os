import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createAppointmentAction } from "@/app/planejamento/actions";
import { fetchServiceCatalog, registerQuickCustomerAndVehicle } from "@/lib/attendance/service";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import { setCapacityConfig, updateAppointmentStatus } from "@/lib/planning/service";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Missão 3.2 (Fase 3 — Integrar Detecção de Conflito ao /planejamento/novo). Testa
 * `createAppointmentAction` (o server action real por trás do formulário) contra o repositório em
 * memória (ambiente de teste, sem DATABASE_URL) — mesmo padrão de `service.test.ts`/
 * `availability.test.ts`. Prova que o motor central de disponibilidade da Missão 3.1
 * (`checkAvailabilityForRequest`) roda de fato ANTES de qualquer escrita real, no server, nunca
 * só no client.
 */

let counter = 0;
async function newCustomerAndVehicle(namePrefix: string) {
  counter++;
  return registerQuickCustomerAndVehicle({ customerName: `${namePrefix} ${counter}`, customerPhone: `4899955${String(counter).padStart(4, "0")}`, vehiclePlate: `M32${String(counter).padStart(4, "0")}` });
}

async function countAppointmentsOnDay(dayIso: string): Promise<number> {
  const rows = await getPlanningRepository().listAppointmentsInRange(dayIso, dayIso);
  return rows.length;
}

describe("createAppointmentAction — Missão 3.2 (motor de disponibilidade conectado ao formulário)", () => {
  beforeEach(async () => {
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
  });

  it("1. appointment livre -> salva normalmente", async () => {
    const { customer, vehicle } = await newCustomerAndVehicle("Livre");
    const catalog = await fetchServiceCatalog();
    const dayIso = addDaysIso(saoPauloDateISO(), 20);

    const result = await createAppointmentAction(
      { customerName: customer.name ?? "Cliente", customerPhone: customer.phone ?? "", vehiclePlate: vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    expect(result.error).toBeNull();
    expect(result.availabilityConflict).toBeFalsy();
    expect(result.availabilityInsufficientData).toBeFalsy();
    expect(await countAppointmentsOnDay(dayIso)).toBe(1);
  });

  it("2. conflito real -> não salva (boxesCount=1, mesmo horário já ocupado)", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 21);
    const catalog = await fetchServiceCatalog();

    const first = await newCustomerAndVehicle("Ocupante");
    await createAppointmentAction(
      { customerName: first.customer.name ?? "Cliente", customerPhone: first.customer.phone ?? "", vehiclePlate: first.vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    const second = await newCustomerAndVehicle("Conflitante");
    const result = await createAppointmentAction(
      { customerName: second.customer.name ?? "Cliente", customerPhone: second.customer.phone ?? "", vehiclePlate: second.vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T10:30:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    expect(result.error).toBe("Já existe atendimento ocupando esse intervalo.");
    expect(result.availabilityConflict?.conflictingAppointments).toHaveLength(1);
    expect(await countAppointmentsOnDay(dayIso)).toBe(1);
  });

  it("3. appointment cancelado não bloqueia — mesmo horário pode ser reaproveitado", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 22);
    const catalog = await fetchServiceCatalog();

    const first = await newCustomerAndVehicle("Cancelado");
    const firstAppointment = await getPlanningRepository().createAppointment({
      customerId: first.customer.id,
      vehicleId: first.vehicle.id,
      serviceId: catalog[0].id,
      scheduledAt: `${dayIso}T11:00:00-03:00`,
      expectedDurationMinutes: 60,
      notes: null,
    });
    await updateAppointmentStatus(firstAppointment.id, "cancelado");

    const second = await newCustomerAndVehicle("NovoNoMesmoHorario");
    const result = await createAppointmentAction(
      { customerName: second.customer.name ?? "Cliente", customerPhone: second.customer.phone ?? "", vehiclePlate: second.vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T11:00:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    expect(result.error).toBeNull();
    expect(result.availabilityConflict).toBeFalsy();
  });

  it("4. horários encostando (fim de um = início do outro) -> permite", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 23);
    const catalog = await fetchServiceCatalog();

    const first = await newCustomerAndVehicle("Encostando1");
    await createAppointmentAction(
      { customerName: first.customer.name ?? "Cliente", customerPhone: first.customer.phone ?? "", vehiclePlate: first.vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    const second = await newCustomerAndVehicle("Encostando2");
    const result = await createAppointmentAction(
      { customerName: second.customer.name ?? "Cliente", customerPhone: second.customer.phone ?? "", vehiclePlate: second.vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 30, notes: null },
    );

    expect(result.error).toBeNull();
    expect(result.availabilityConflict).toBeFalsy();
    expect(await countAppointmentsOnDay(dayIso)).toBe(2);
  });

  it("5. duração ausente (nem própria, nem do catálogo em memória) -> exige confirmação humana, não salva ainda", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 24);
    const catalog = await fetchServiceCatalog();
    const { customer, vehicle } = await newCustomerAndVehicle("SemDuracao");

    const result = await createAppointmentAction(
      { customerName: customer.name ?? "Cliente", customerPhone: customer.phone ?? "", vehiclePlate: vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: null, notes: null },
    );

    expect(result.error).toBeNull();
    expect(result.availabilityInsufficientData?.reason).toBeTruthy();
    expect(await countAppointmentsOnDay(dayIso)).toBe(0);
  });

  it("6. duração ausente + SEM confirmação -> reenviar sem 'acknowledgedInsufficientData' continua não salvando", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 25);
    const catalog = await fetchServiceCatalog();
    const { customer, vehicle } = await newCustomerAndVehicle("SemConfirmacao");

    await createAppointmentAction(
      { customerName: customer.name ?? "Cliente", customerPhone: customer.phone ?? "", vehiclePlate: vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: null, notes: null },
    );
    const secondAttempt = await createAppointmentAction(
      { customerName: customer.name ?? "Cliente", customerPhone: customer.phone ?? "", vehiclePlate: vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: null, notes: null, acknowledgedInsufficientData: false },
    );

    expect(secondAttempt.availabilityInsufficientData?.reason).toBeTruthy();
    expect(await countAppointmentsOnDay(dayIso)).toBe(0);
  });

  it("7. duração ausente + confirmação humana explícita -> pode salvar", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 26);
    const catalog = await fetchServiceCatalog();
    const { customer, vehicle } = await newCustomerAndVehicle("ComConfirmacao");

    const result = await createAppointmentAction(
      { customerName: customer.name ?? "Cliente", customerPhone: customer.phone ?? "", vehiclePlate: vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: null, notes: null, acknowledgedInsufficientData: true },
    );

    expect(result.error).toBeNull();
    expect(result.availabilityInsufficientData).toBeFalsy();
    expect(await countAppointmentsOnDay(dayIso)).toBe(1);
  });

  it("8. check no servidor impede bypass do client — 'acknowledgedInsufficientData: true' NUNCA contorna um conflito real", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 27);
    const catalog = await fetchServiceCatalog();

    const first = await newCustomerAndVehicle("BypassOcupante");
    await createAppointmentAction(
      { customerName: first.customer.name ?? "Cliente", customerPhone: first.customer.phone ?? "", vehiclePlate: first.vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    const second = await newCustomerAndVehicle("TentaBypassar");
    const result = await createAppointmentAction(
      { customerName: second.customer.name ?? "Cliente", customerPhone: second.customer.phone ?? "", vehiclePlate: second.vehicle.plate ?? "" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null, acknowledgedInsufficientData: true },
    );

    expect(result.error).toBe("Já existe atendimento ocupando esse intervalo.");
    expect(await countAppointmentsOnDay(dayIso)).toBe(1);
  });

  it("9. nenhum conflito -> comportamento anterior preservado (resolução de cliente/veículo e duplicateWarning continuam funcionando)", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 28);
    const catalog = await fetchServiceCatalog();

    const result = await createAppointmentAction(
      { customerName: "Cliente Sem Duplicidade", customerPhone: "48999770001", vehiclePlate: "SDP0001" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    expect(result.error).toBeNull();
    expect(result.duplicateWarning).toBeNull();
    expect(await countAppointmentsOnDay(dayIso)).toBe(1);
  });

  it("10. erro na consulta de disponibilidade -> não inventa estado, nunca cria o agendamento", async () => {
    vi.resetModules();
    vi.doMock("@/lib/planning/service", async () => {
      const actual = await vi.importActual<typeof import("@/lib/planning/service")>("@/lib/planning/service");
      return { ...actual, checkAvailabilityForRequest: vi.fn().mockRejectedValue(new Error("falha simulada de consulta")) };
    });
    const { createAppointmentAction: actionWithFailingCheck } = await import("@/app/planejamento/actions");
    const { registerQuickCustomerAndVehicle: register2 } = await import("@/lib/attendance/service");
    const { fetchServiceCatalog: catalog2 } = await import("@/lib/attendance/service");
    const { getPlanningRepository: repoFactory2 } = await import("@/lib/planning/repository-factory");

    const dayIso = addDaysIso(saoPauloDateISO(), 29);
    const { customer, vehicle } = await register2({ customerName: "Erro Consulta", customerPhone: "48999998888", vehiclePlate: "ERR0001" });
    const services = await catalog2();

    const result = await actionWithFailingCheck(
      { customerName: customer.name ?? "Cliente", customerPhone: customer.phone ?? "", vehiclePlate: vehicle.plate ?? "" },
      { serviceId: services[0].id, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    expect(result.error).toBe("falha simulada de consulta");
    expect(result.availabilityConflict).toBeFalsy();
    expect(result.availabilityInsufficientData).toBeFalsy();
    const rows = await repoFactory2().listAppointmentsInRange(dayIso, dayIso);
    expect(rows).toHaveLength(0);
    vi.doUnmock("@/lib/planning/service");
    vi.resetModules();
  });

  it("12. zero criação quando conflito, mesmo tentando duas vezes seguidas (duplo clique/reenvio no mesmo horário)", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 30);
    const catalog = await fetchServiceCatalog();
    const { customer, vehicle } = await newCustomerAndVehicle("DuploClique");

    const input = { serviceId: catalog[0].id, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null };
    const registerInput = { customerName: customer.name ?? "Cliente", customerPhone: customer.phone ?? "", vehiclePlate: vehicle.plate ?? "" };

    const first = await createAppointmentAction(registerInput, input);
    const second = await createAppointmentAction(registerInput, input);

    expect(first.error).toBeNull();
    expect(second.error).toBe("Já existe atendimento ocupando esse intervalo.");
    expect(await countAppointmentsOnDay(dayIso)).toBe(1);
  });

  /**
   * Missão 3.2.3 — placa deixa de ser obrigatória para criar veículo/agendamento pelo
   * Planejamento (o carro pode ainda não ter chegado à loja). `NULL` é a única representação
   * aceita — nunca um placeholder como "SEMPLACA"/"0000000". O Atendimento (check-in físico) NÃO
   * é tocado por esta missão: sua exigência de placa vive só em `step-veiculo.tsx`
   * (`canSubmitNew = plate.trim().length > 0`), fora do escopo deste arquivo/teste.
   */
  it("13. registerQuickCustomerAndVehicle aceita vehiclePlate: null — veículo é criado com plate=null, nunca um placeholder", async () => {
    counter++;
    const { vehicle, customer } = await registerQuickCustomerAndVehicle({
      customerName: `SemPlaca ${counter}`,
      customerPhone: `4899977${String(counter).padStart(4, "0")}`,
      vehiclePlate: null,
      vehicleModel: "Ford Fiesta",
    });

    expect(vehicle.plate).toBeNull();
    expect(vehicle.model).toBe("Ford Fiesta");
    expect(customer.name).toBe(`SemPlaca ${counter}`);
  });

  it("14. createAppointmentAction com vehiclePlate: null -> cria appointment normalmente (disponibilidade nunca depende de placa)", async () => {
    counter++;
    const dayIso = addDaysIso(saoPauloDateISO(), 40);
    const catalog = await fetchServiceCatalog();

    const result = await createAppointmentAction(
      { customerName: `Kawe ${counter}`, customerPhone: `4899988${String(counter).padStart(4, "0")}`, vehiclePlate: null, vehicleModel: "Ford Fiesta" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T08:00:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    expect(result.error).toBeNull();
    expect(result.availabilityConflict).toBeFalsy();
    expect(result.availabilityInsufficientData).toBeFalsy();
    expect(await countAppointmentsOnDay(dayIso)).toBe(1);
  });

  it("15. dois agendamentos sem placa em conflito real (boxesCount=1) -> conflito continua detectado normalmente, ausência de placa nunca contorna capacidade", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 41);
    const catalog = await fetchServiceCatalog();

    counter++;
    await createAppointmentAction(
      { customerName: `SemPlacaA ${counter}`, customerPhone: `4899911${String(counter).padStart(4, "0")}`, vehiclePlate: null, vehicleModel: "Ford Fiesta" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    counter++;
    const second = await createAppointmentAction(
      { customerName: `SemPlacaB ${counter}`, customerPhone: `4899922${String(counter).padStart(4, "0")}`, vehiclePlate: null, vehicleModel: "Chevrolet Onix" },
      { serviceId: catalog[0].id, scheduledAt: `${dayIso}T10:30:00-03:00`, expectedDurationMinutes: 60, notes: null },
    );

    expect(second.error).toBe("Já existe atendimento ocupando esse intervalo.");
    expect(await countAppointmentsOnDay(dayIso)).toBe(1);
  });

  it("16. placa informada continua funcionando exatamente como antes (regressão) — reaproveita veículo existente pela placa exata", async () => {
    counter++;
    const phone = `4899933${String(counter).padStart(4, "0")}`;
    const plate = `N44${String(counter).padStart(4, "0")}`;
    const first = await registerQuickCustomerAndVehicle({ customerName: `ComPlaca ${counter}`, customerPhone: phone, vehiclePlate: plate });
    const second = await registerQuickCustomerAndVehicle({ customerName: `ComPlaca ${counter}`, customerPhone: phone, vehiclePlate: plate });

    expect(second.vehicle.id).toBe(first.vehicle.id);
    expect(second.vehicle.plate).toBe(plate);
  });
});
