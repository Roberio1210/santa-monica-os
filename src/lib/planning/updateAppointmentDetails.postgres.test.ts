import { afterAll, describe, expect, it } from "vitest";
import { fetchServiceCatalog, registerQuickCustomerAndVehicle } from "@/lib/attendance/service";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import { AppointmentConcurrentUpdateError, createAppointment, setCapacityConfig, updateAppointmentDetails } from "@/lib/planning/service";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Missão 49 (Parte C) — bug real encontrado na revisão da Missão 48: `updatedAt` de um appointment
 * recém-criado vem de `defaultNow()` (função `now()` do Postgres, precisão de microssegundos), mas
 * o cliente só recebe/reenvia a versão truncada em milissegundos (limite do `Date` do JS) — uma
 * comparação `eq` direta no CAS quase sempre falhava no PRIMEIRO edit de qualquer agendamento
 * nunca antes tocado por `updateAppointmentStatus`. Corrigido com `date_trunc('milliseconds', ...)`
 * na cláusula `WHERE` (`postgres-repository.ts`). Só o repositório em memória (usado no resto da
 * suíte) sempre escreve `updatedAt` via `new Date()` do JS — por isso esse bug nunca aparecia lá, e
 * só é verificável contra um Postgres real.
 *
 * Requer `TEST_DATABASE_URL` — nunca roda contra `DATABASE_URL` de produção (`db/client.ts` é
 * fail-closed em `NODE_ENV=test`: só lê `TEST_DATABASE_URL`, ignora `DATABASE_URL` mesmo se
 * presente). Sem essa variável, este arquivo inteiro fica `skip` — mesmo padrão de
 * `atomicRegistration.test.ts`. Offsets de dia (150+) escolhidos acima dos usados em qualquer
 * outro arquivo para nunca colidir num Postgres real compartilhado entre execuções.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;

let counter = 0;
function uniquePhone(): string {
  counter++;
  return `489993${String(counter).padStart(5, "0")}`;
}

/** Primeiro serviço real do catálogo que tenha `estimated_duration_minutes` cadastrado — a ordem de `listServiceCatalog()` não é garantida, nunca assumir `catalog[0]`. */
async function findServiceWithRealDuration(): Promise<string> {
  const catalog = await fetchServiceCatalog();
  for (const entry of catalog) {
    const service = await getPlanningRepository().getService(entry.id);
    if (service?.estimatedDurationMinutes !== null && service?.estimatedDurationMinutes !== undefined) return entry.id;
  }
  throw new Error("Nenhum serviço do catálogo de teste tem duração cadastrada — não é possível rodar este teste.");
}

const createdAppointmentIds: string[] = [];

afterAll(async () => {
  // Limpeza best-effort dos appointments criados neste arquivo — nunca toca em Kawe/Gilberto/Pedro
  // nem em qualquer dado pré-existente (só os ids retornados pelas próprias chamadas deste arquivo).
  if (!hasRealDb || createdAppointmentIds.length === 0) return;
  const db = (await import("@/db/client")).getDb();
  if (!db) return;
  const { appointments } = await import("@/db/schema");
  const { inArray } = await import("drizzle-orm");
  await db.delete(appointments).where(inArray(appointments.id, createdAppointmentIds));
});

describe.skipIf(!hasRealDb)("updateAppointmentDetails — CAS contra Postgres real (Missão 49, Parte C)", () => {
  it("primeiro edit de um appointment recém-criado (updatedAt ainda vem de defaultNow(), precisão de microssegundos) é aceito normalmente — nunca um falso 'alterado por outra operação'", async () => {
    await setCapacityConfig({ boxesCount: 4, dailyOperatingMinutes: 480 });
    const serviceId = await findServiceWithRealDuration();
    const dayIso = addDaysIso(saoPauloDateISO(), 150);
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Cliente Teste CAS Postgres", customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Veículo Teste" });
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: serviceId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    createdAppointmentIds.push(appointment.id);

    // Este é exatamente o cenário que falhava antes da correção: NENHUMA outra escrita tocou o
    // appointment entre a criação e este primeiro edit — `updatedAt` no banco ainda é o valor bruto
    // de `defaultNow()`, com microssegundos que o cliente nunca viu.
    const updated = await updateAppointmentDetails({
      appointmentId: appointment.id,
      serviceId: serviceId,
      scheduledAt: `${dayIso}T10:00:00-03:00`,
      notes: "Primeiro edit real contra Postgres",
      expectedUpdatedAt: appointment.updatedAt,
    });
    expect(updated.notes).toBe("Primeiro edit real contra Postgres");
  });

  it("cenário de concorrência real: operação A lê version 1, operação B salva (gera version 2), operação A tenta salvar com version 1 -> B permanece intacta, A recebe erro", async () => {
    await setCapacityConfig({ boxesCount: 4, dailyOperatingMinutes: 480 });
    const serviceId = await findServiceWithRealDuration();
    const dayIso = addDaysIso(saoPauloDateISO(), 151);
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Cliente Teste Concorrencia Postgres", customerPhone: uniquePhone(), vehiclePlate: null, vehicleModel: "Veículo Teste" });
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId: serviceId, scheduledAt: `${dayIso}T09:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    createdAppointmentIds.push(appointment.id);

    // Operação A "lê" o appointment (version 1 = appointment.updatedAt, ainda de defaultNow()).
    const versionReadByA = appointment.updatedAt;

    // Operação B salva primeiro, gerando version 2.
    const savedByB = await updateAppointmentDetails({
      appointmentId: appointment.id,
      serviceId: serviceId,
      scheduledAt: `${dayIso}T11:00:00-03:00`,
      notes: "Salvo por B",
      expectedUpdatedAt: versionReadByA,
    });
    expect(savedByB.notes).toBe("Salvo por B");

    // Operação A tenta salvar com a version 1 (já desatualizada) — deve ser rejeitada.
    await expect(
      updateAppointmentDetails({
        appointmentId: appointment.id,
        serviceId: serviceId,
        scheduledAt: `${dayIso}T14:00:00-03:00`,
        notes: "Tentativa de A (tela desatualizada)",
        expectedUpdatedAt: versionReadByA,
      }),
    ).rejects.toThrow(AppointmentConcurrentUpdateError);

    // B permanece intacta — a tentativa de A nunca escreveu nada.
    const finalState = await getPlanningRepository().getAppointment(appointment.id);
    expect(finalState?.notes).toBe("Salvo por B");
  });
});
