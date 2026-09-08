import { describe, expect, it } from "vitest";
import {
  AppointmentConcurrentUpdateError,
  AppointmentEditConflictError,
  AppointmentNotEditableError,
  AppointmentOutsideExpedienteError,
  AppointmentPastDateError,
  createAppointment,
  ServiceDurationMissingError,
  ServiceNotFoundError,
  setCapacityConfig,
  updateAppointmentDetails,
  updateAppointmentStatus,
} from "@/lib/planning/service";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import { MemoryPlanningRepository } from "@/lib/planning/memory-repository";
import { fetchServiceCatalog, registerQuickCustomerAndVehicle } from "@/lib/attendance/service";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";
import type { AppointmentStatus } from "@/lib/planning/types";

/**
 * Missão 48 — testes de `updateAppointmentDetails` (edição segura e completa do agendamento),
 * contra o repositório em memória (mesmo padrão de `service.test.ts`/`availability.test.ts`).
 * Dias usados ficam em offsets 60+, bem afastados dos usados em outros arquivos, para nunca
 * colidir no repositório em memória compartilhado do processo de teste.
 *
 * O catálogo de serviços em memória não carrega duração real (Missão 3.1) — por isso os testes
 * semeiam explicitamente a duração via `setServiceEstimatedDurationForTesting` (método de TESTE,
 * fora da interface `PlanningRepository`; produção/Postgres sempre lê o valor real da tabela
 * `services`).
 */

const repo = getPlanningRepository() as MemoryPlanningRepository;

let counter = 0;
async function newCustomerAndVehicle(prefix: string) {
  counter++;
  return registerQuickCustomerAndVehicle({ customerName: `${prefix} ${counter}`, customerPhone: `4899977${String(counter).padStart(4, "0")}`, vehiclePlate: `EDT${String(counter).padStart(4, "0")}` });
}

async function catalogIds() {
  const catalog = await fetchServiceCatalog();
  return { lavacaoId: catalog[0].id, polimentoId: catalog[1].id, higienizacaoId: catalog[2].id };
}

describe("updateAppointmentDetails — capacidade e conflito (Parte F, itens 1-9)", () => {
  it("item 1. editar sem mudar horário: o próprio appointment nunca conta como conflito consigo mesmo", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 60);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("Item1");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const updated = await updateAppointmentDetails({
      appointmentId: appointment.id,
      serviceId: lavacaoId,
      scheduledAt: `${dayIso}T09:00:00-03:00`,
      notes: "Observação nova",
      expectedUpdatedAt: appointment.updatedAt,
    });
    expect(updated.notes).toBe("Observação nova");
  });

  it("item 2. alterar horário para intervalo livre: permitido", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 61);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("Item2");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const updated = await updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T14:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt });
    expect(updated.scheduledAt).toBe(`${dayIso}T14:00:00-03:00`);
  });

  it("item 3. 1 outro simultâneo: permitido com capacidade 4", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 62);
    await setCapacityConfig({ boxesCount: 4, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const a = await newCustomerAndVehicle("Item3A");
    const b = await newCustomerAndVehicle("Item3B");
    const appointmentA = await createAppointment({ customerId: a.customer.id, vehicleId: a.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    await createAppointment({ customerId: b.customer.id, vehicleId: b.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const updated = await updateAppointmentDetails({ appointmentId: appointmentA.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, notes: null, expectedUpdatedAt: appointmentA.updatedAt });
    expect(updated.status).toBe("agendado");
  });

  it("item 4. 3 outros simultâneos: edição que cria o 4º é permitida (capacidade 4)", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 63);
    await setCapacityConfig({ boxesCount: 4, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const target = `${dayIso}T10:00:00-03:00`;
    const a = await newCustomerAndVehicle("Item4A");
    const appointmentA = await createAppointment({ customerId: a.customer.id, vehicleId: a.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    for (const label of ["Item4B", "Item4C", "Item4D"]) {
      const { customer, vehicle } = await newCustomerAndVehicle(label);
      await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: target, expectedDurationMinutes: 60, notes: null });
    }

    const updated = await updateAppointmentDetails({ appointmentId: appointmentA.id, serviceId: lavacaoId, scheduledAt: target, notes: null, expectedUpdatedAt: appointmentA.updatedAt });
    expect(updated.scheduledAt).toBe(target);
  });

  it("item 5. 4 outros simultâneos: edição que criaria o 5º é bloqueada (capacidade 4)", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 64);
    await setCapacityConfig({ boxesCount: 4, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const target = `${dayIso}T10:00:00-03:00`;
    const a = await newCustomerAndVehicle("Item5A");
    const appointmentA = await createAppointment({ customerId: a.customer.id, vehicleId: a.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    for (const label of ["Item5B", "Item5C", "Item5D", "Item5E"]) {
      const { customer, vehicle } = await newCustomerAndVehicle(label);
      await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: target, expectedDurationMinutes: 60, notes: null });
    }

    await expect(updateAppointmentDetails({ appointmentId: appointmentA.id, serviceId: lavacaoId, scheduledAt: target, notes: null, expectedUpdatedAt: appointmentA.updatedAt })).rejects.toThrow(
      AppointmentEditConflictError,
    );
    const stillOriginal = await getPlanningRepository().getAppointment(appointmentA.id);
    expect(stillOriginal?.scheduledAt).toBe(`${dayIso}T09:00:00-03:00`); // nada foi escrito
  });

  it("item 6. intervalos apenas encostando: NÃO conflitam", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 65);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const a = await newCustomerAndVehicle("Item6A");
    const b = await newCustomerAndVehicle("Item6B");
    const appointmentA = await createAppointment({ customerId: a.customer.id, vehicleId: a.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T08:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    await createAppointment({ customerId: b.customer.id, vehicleId: b.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null }); // 10:00-11:00

    // Editar A para 09:00-10:00 — termina exatamente quando B começa, nunca conflito.
    const updated = await updateAppointmentDetails({ appointmentId: appointmentA.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: null, expectedUpdatedAt: appointmentA.updatedAt });
    expect(updated.scheduledAt).toBe(`${dayIso}T09:00:00-03:00`);
  });

  it("item 7. troca de serviço aumenta duração e passa a conflitar: bloqueada", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 66);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId, polimentoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    repo.setServiceEstimatedDurationForTesting(polimentoId, 120);
    const a = await newCustomerAndVehicle("Item7A");
    const b = await newCustomerAndVehicle("Item7B");
    const appointmentA = await createAppointment({ customerId: a.customer.id, vehicleId: a.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null }); // 09:00-10:00
    await createAppointment({ customerId: b.customer.id, vehicleId: b.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null }); // 10:00-11:00

    // Trocar A para polimento (120min) mantendo 09:00 -> passaria a terminar 11:00, conflitando com B.
    await expect(
      updateAppointmentDetails({ appointmentId: appointmentA.id, serviceId: polimentoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: null, expectedUpdatedAt: appointmentA.updatedAt }),
    ).rejects.toThrow(AppointmentEditConflictError);
  });

  it("item 8. troca de serviço reduz duração e fica disponível: permitida", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 67);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId, polimentoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    repo.setServiceEstimatedDurationForTesting(polimentoId, 120);
    const a = await newCustomerAndVehicle("Item8A");
    const b = await newCustomerAndVehicle("Item8B");
    // A criado diretamente já "conflitando" com B (createAppointment não valida disponibilidade — só a edição via updateAppointmentDetails valida).
    const appointmentA = await createAppointment({ customerId: a.customer.id, vehicleId: a.vehicle.id, serviceId: polimentoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 120, notes: null }); // 09:00-11:00
    await createAppointment({ customerId: b.customer.id, vehicleId: b.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null }); // 10:00-11:00

    // Trocar A para lavação (60min) mantendo 09:00 -> passa a terminar 10:00, sem conflito com B.
    const updated = await updateAppointmentDetails({ appointmentId: appointmentA.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: null, expectedUpdatedAt: appointmentA.updatedAt });
    expect(updated.serviceId).toBe(lavacaoId);
    expect(updated.expectedDurationMinutes).toBe(60);
  });

  it("item 9. capacidade variável (2 e 5) — mesmo cenário do item 3, provando ausência de hard-code de 4", async () => {
    for (const boxesCount of [2, 5]) {
      const dayIso = addDaysIso(saoPauloDateISO(), boxesCount === 2 ? 68 : 69);
      await setCapacityConfig({ boxesCount, dailyOperatingMinutes: 480 });
      const { lavacaoId } = await catalogIds();
      repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
      const target = `${dayIso}T10:00:00-03:00`;
      const a = await newCustomerAndVehicle(`Item9A${boxesCount}`);
      const appointmentA = await createAppointment({ customerId: a.customer.id, vehicleId: a.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
      // preenche até faltar exatamente 1 posição (boxesCount - 1 outros já ocupando o slot-alvo)
      for (let i = 0; i < boxesCount - 1; i++) {
        const { customer, vehicle } = await newCustomerAndVehicle(`Item9Fill${boxesCount}-${i}`);
        await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: target, expectedDurationMinutes: 60, notes: null });
      }

      // editar A para o slot-alvo deve caber exatamente (usa a última posição livre)
      const updated = await updateAppointmentDetails({ appointmentId: appointmentA.id, serviceId: lavacaoId, scheduledAt: target, notes: null, expectedUpdatedAt: appointmentA.updatedAt });
      expect(updated.scheduledAt).toBe(target);

      // mais um appointment no mesmo slot-alvo agora deve estourar a capacidade
      const overflow = await newCustomerAndVehicle(`Item9Overflow${boxesCount}`);
      const appointmentOverflow = await createAppointment({ customerId: overflow.customer.id, vehicleId: overflow.vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T13:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
      await expect(
        updateAppointmentDetails({ appointmentId: appointmentOverflow.id, serviceId: lavacaoId, scheduledAt: target, notes: null, expectedUpdatedAt: appointmentOverflow.updatedAt }),
      ).rejects.toThrow(AppointmentEditConflictError);
    }
  });
});

describe("updateAppointmentDetails — recálculo de duração e serviço sem duração (Parte C, itens 15/16)", () => {
  it("item 15. duração é sempre recalculada a partir do NOVO serviço, nunca reaproveita a antiga", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 70);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId, polimentoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    repo.setServiceEstimatedDurationForTesting(polimentoId, 120);
    const { customer, vehicle } = await newCustomerAndVehicle("Item15");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 999, notes: null }); // duração antiga deliberadamente absurda

    const updated = await updateAppointmentDetails({ appointmentId: appointment.id, serviceId: polimentoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt });
    expect(updated.expectedDurationMinutes).toBe(120); // do catálogo do novo serviço, nunca 999
  });

  it("item 16. serviço sem duração cadastrada -> bloqueado, nunca inventa/reaproveita duração antiga", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 71);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId, higienizacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    repo.setServiceEstimatedDurationForTesting(higienizacaoId, null); // simula serviço real sem duração cadastrada
    const { customer, vehicle } = await newCustomerAndVehicle("Item16");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(
      updateAppointmentDetails({ appointmentId: appointment.id, serviceId: higienizacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt }),
    ).rejects.toThrow(ServiceDurationMissingError);
    await expect(
      updateAppointmentDetails({ appointmentId: appointment.id, serviceId: higienizacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt }),
    ).rejects.toThrow("O serviço selecionado não possui duração prevista.");
  });
});

describe("updateAppointmentDetails — data passada e expediente (Partes D/L, itens 17/18)", () => {
  it("item 17a. appointment com data ATUAL passada -> bloqueado, mesmo tentando só mudar notes", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), -2);
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("Item17a");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(
      updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: "tentativa", expectedUpdatedAt: appointment.updatedAt }),
    ).rejects.toThrow(AppointmentPastDateError);
  });

  it("item 17b. mover um appointment válido PARA uma data passada -> também bloqueado", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 72);
    const pastDayIso = addDaysIso(saoPauloDateISO(), -3);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("Item17b");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(
      updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${pastDayIso}T09:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt }),
    ).rejects.toThrow(AppointmentPastDateError);
  });

  it("item 18a. término previsto ultrapassa o fim do expediente -> bloqueado", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 73);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 }); // 08:00-16:00
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 120);
    const { customer, vehicle } = await newCustomerAndVehicle("Item18a");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 120, notes: null });

    await expect(
      updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T15:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt }),
    ).rejects.toThrow(AppointmentOutsideExpedienteError);
  });

  it("item 18b. horário inicial antes da abertura do expediente -> bloqueado", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 74);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 }); // 08:00-16:00
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("Item18b");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(
      updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T06:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt }),
    ).rejects.toThrow(AppointmentOutsideExpedienteError);
  });

  it("item 18c (Missão 49, Parte F). início exatamente às 08:00 (abertura) é PERMITIDO — limite inclusivo, não estrito", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 79);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 }); // 08:00-16:00
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("Item18c");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const updated = await updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T08:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt });
    expect(updated.scheduledAt).toBe(`${dayIso}T08:00:00-03:00`);
  });

  it("item 18d (Missão 49, Parte F). término EXATAMENTE no fechamento (16:00) é PERMITIDO; 1 minuto depois é bloqueado", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 82);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 }); // 08:00-16:00
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("Item18dOk");
    const appointmentOk = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    // 15:00 + 60min = 16:00 exatamente -> permitido
    const updatedOk = await updateAppointmentDetails({ appointmentId: appointmentOk.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T15:00:00-03:00`, notes: null, expectedUpdatedAt: appointmentOk.updatedAt });
    expect(updatedOk.scheduledAt).toBe(`${dayIso}T15:00:00-03:00`);

    const { customer: c2, vehicle: v2 } = await newCustomerAndVehicle("Item18dBloqueado");
    const appointmentBlocked = await createAppointment({ customerId: c2.id, vehicleId: v2.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    // 15:01 + 60min = 16:01, 1 minuto depois do fechamento -> bloqueado
    await expect(
      updateAppointmentDetails({ appointmentId: appointmentBlocked.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T15:01:00-03:00`, notes: null, expectedUpdatedAt: appointmentBlocked.updatedAt }),
    ).rejects.toThrow(AppointmentOutsideExpedienteError);
  });
});

describe("updateAppointmentDetails — matriz de status (Partes A/M)", () => {
  const nonEditable: AppointmentStatus[] = ["em_andamento", "concluido", "cancelado", "reagendado"];

  for (const status of nonEditable) {
    it(`status '${status}' -> edição estrutural bloqueada no BACKEND (não só botão escondido)`, async () => {
      // "hoje", nunca um dia futuro: em_andamento/concluido só podem ser atingidos no próprio dia
      // do agendamento (Missão 46) — usar um dia futuro aqui quebraria a própria montagem do fixture.
      const dayIso = saoPauloDateISO();
      const { lavacaoId } = await catalogIds();
      repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
      const { customer, vehicle } = await newCustomerAndVehicle(`ItemStatus${status}`);
      const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
      const withStatus = status === "agendado" ? appointment : await updateAppointmentStatus(appointment.id, status);

      await expect(
        updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, notes: null, expectedUpdatedAt: withStatus.updatedAt }),
      ).rejects.toThrow(AppointmentNotEditableError);
    });
  }

  it("agendado e confirmado continuam editáveis (regressão)", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 76);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("ItemAgendadoConfirmado");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    const confirmed = await updateAppointmentStatus(appointment.id, "confirmado");

    const updated = await updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T11:00:00-03:00`, notes: null, expectedUpdatedAt: confirmed.updatedAt });
    expect(updated.status).toBe("confirmado"); // edição não altera o status
  });
});

describe("updateAppointmentDetails — concorrência otimista (Parte H, item 23)", () => {
  it("segunda edição com o updatedAt ORIGINAL (já desatualizado) é rejeitada, nunca sobrescreve silenciosamente", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 77);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("ItemCAS");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const first = await updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T10:00:00-03:00`, notes: "Primeira edição", expectedUpdatedAt: appointment.updatedAt });
    expect(first.notes).toBe("Primeira edição");

    await expect(
      updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T11:00:00-03:00`, notes: "Segunda edição (tela desatualizada)", expectedUpdatedAt: appointment.updatedAt }),
    ).rejects.toThrow(AppointmentConcurrentUpdateError);

    const finalState = await getPlanningRepository().getAppointment(appointment.id);
    expect(finalState?.notes).toBe("Primeira edição"); // a segunda tentativa nunca sobrescreveu
  });
});

describe("updateAppointmentDetails — campos preservados (Parte G, itens 28/29/30)", () => {
  it("customerId, vehicleId, source e createdAt nunca mudam através da edição", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 78);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId, polimentoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    repo.setServiceEstimatedDurationForTesting(polimentoId, 120);
    const { customer, vehicle } = await newCustomerAndVehicle("ItemPreservado");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const updated = await updateAppointmentDetails({ appointmentId: appointment.id, serviceId: polimentoId, scheduledAt: `${dayIso}T11:00:00-03:00`, notes: "Novo texto", expectedUpdatedAt: appointment.updatedAt });

    expect(updated.customerId).toBe(customer.id);
    expect(updated.vehicleId).toBe(vehicle.id);
    expect(updated.createdAt).toBe(appointment.createdAt);
    expect(updated.serviceId).toBe(polimentoId); // isto sim muda — é o campo editável
  });
});

describe("updateAppointmentDetails — normalização de observações (Missão 49, Parte G)", () => {
  it("notes vazia ('') -> normalizada para NULL", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 86);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("ItemNotesVazia");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: "Texto antigo" });

    const updated = await updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: "", expectedUpdatedAt: appointment.updatedAt });
    expect(updated.notes).toBeNull();
  });

  it("notes só com espaços ('   ') -> normalizada para NULL", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 87);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("ItemNotesEspacos");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const updated = await updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: "    ", expectedUpdatedAt: appointment.updatedAt });
    expect(updated.notes).toBeNull();
  });

  it("notes com texto real, com espaços nas bordas -> preservado e aparado (trim)", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 88);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("ItemNotesTexto");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const updated = await updateAppointmentDetails({ appointmentId: appointment.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: "  Cliente prefere ser avisado por telefone  ", expectedUpdatedAt: appointment.updatedAt });
    expect(updated.notes).toBe("Cliente prefere ser avisado por telefone");
  });
});

describe("updateAppointmentDetails — validação real de serviço (Missão 49, Parte E)", () => {
  it("serviceId inexistente -> ServiceNotFoundError, nunca confundido com 'sem duração'", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 83);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("ItemServicoInexistente");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(
      updateAppointmentDetails({ appointmentId: appointment.id, serviceId: "servico-que-nao-existe", scheduledAt: `${dayIso}T09:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt }),
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it("serviceId existente mas INATIVO -> ServiceNotFoundError, nunca aceito silenciosamente", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 84);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId, polimentoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    repo.setServiceEstimatedDurationForTesting(polimentoId, 120);
    repo.setServiceActiveForTesting(polimentoId, false); // simula serviço real desativado
    const { customer, vehicle } = await newCustomerAndVehicle("ItemServicoInativo");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    await expect(
      updateAppointmentDetails({ appointmentId: appointment.id, serviceId: polimentoId, scheduledAt: `${dayIso}T09:00:00-03:00`, notes: null, expectedUpdatedAt: appointment.updatedAt }),
    ).rejects.toThrow(ServiceNotFoundError);
    repo.setServiceActiveForTesting(polimentoId, true); // restaura para não afetar outros testes do arquivo
  });
});

describe("updateAppointmentDetails — chamada direta maliciosa (Missão 49, Parte K)", () => {
  it("payload com customerId/vehicleId extras é silenciosamente ignorado — não fazem parte do input autorizado e nunca chegam ao UPDATE", async () => {
    const dayIso = addDaysIso(saoPauloDateISO(), 85);
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { lavacaoId } = await catalogIds();
    repo.setServiceEstimatedDurationForTesting(lavacaoId, 60);
    const { customer, vehicle } = await newCustomerAndVehicle("ItemPayloadMalicioso");
    const outroCliente = await newCustomerAndVehicle("ItemOutroClienteAlvo");
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: lavacaoId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });

    // `UpdateAppointmentDetailsInput` nem declara customerId/vehicleId — simula um payload
    // malicioso via cast forçado, exatamente o cenário de uma chamada direta fora do TypeScript.
    const maliciousInput = {
      appointmentId: appointment.id,
      serviceId: lavacaoId,
      scheduledAt: `${dayIso}T09:00:00-03:00`,
      notes: null,
      expectedUpdatedAt: appointment.updatedAt,
      customerId: outroCliente.customer.id,
      vehicleId: outroCliente.vehicle.id,
    } as Parameters<typeof updateAppointmentDetails>[0];

    const updated = await updateAppointmentDetails(maliciousInput);
    expect(updated.customerId).toBe(customer.id); // nunca virou outroCliente.customer.id
    expect(updated.vehicleId).toBe(vehicle.id); // nunca virou outroCliente.vehicle.id
  });
});
