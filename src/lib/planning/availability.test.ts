import { describe, expect, it } from "vitest";
import { checkAvailability, intervalsOverlap, resolveCandidateDuration } from "@/lib/planning/availability";
import { checkAvailabilityForRequest, createAppointment, setCapacityConfig, updateAppointmentStatus } from "@/lib/planning/service";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import { fetchServiceCatalog, registerQuickCustomerAndVehicle } from "@/lib/attendance/service";
import { addDaysIso, saoPauloDateISO } from "@/lib/utils/timezone";
import type { OccupyingAppointmentForCheck } from "@/lib/planning/types";

/**
 * Missão 3.1 (Fase 3 — Motor de Disponibilidade e Conflito). Testes puros contra `checkAvailability`
 * (sem banco) cobrem a regra de sobreposição de intervalos; testes de `checkAvailabilityForRequest`
 * rodam contra `getPlanningRepository()`, que em ambiente de teste (sem DATABASE_URL) sempre usa o
 * repositório em memória — mesmo padrão de `service.test.ts`.
 */

const capacity1 = { boxesCount: 1 };
const capacity2 = { boxesCount: 2 };
const day = "2026-09-01";

function occ(id: string, scheduledAt: string, durationMinutes: number | null): OccupyingAppointmentForCheck {
  return { id, scheduledAt, durationMinutes };
}

describe("intervalsOverlap", () => {
  it("não sobrepõe quando totalmente livre", () => {
    expect(intervalsOverlap(0, 60, 120, 180)).toBe(false);
  });

  it("borda-a-borda nunca conflita — fim de um exatamente igual ao início do outro", () => {
    expect(intervalsOverlap(60, 120, 120, 180)).toBe(false);
    expect(intervalsOverlap(120, 180, 60, 120)).toBe(false);
  });

  it("sobrepõe quando os intervalos realmente se cruzam", () => {
    expect(intervalsOverlap(60, 120, 90, 150)).toBe(true);
  });
});

describe("resolveCandidateDuration", () => {
  it("usa a duração explícita quando presente, mesmo com fallback disponível", () => {
    expect(resolveCandidateDuration(45, 90)).toBe(45);
  });

  it("cai para a duração do serviço quando a explícita está ausente", () => {
    expect(resolveCandidateDuration(null, 90)).toBe(90);
    expect(resolveCandidateDuration(undefined, 90)).toBe(90);
  });

  it("null quando nenhuma das duas existe — nunca inventa um terceiro valor (ex.: média)", () => {
    expect(resolveCandidateDuration(null, null)).toBeNull();
  });
});

describe("checkAvailability — núcleo puro", () => {
  it("1. intervalo totalmente livre — available", () => {
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T14:00:00-03:00`, 60)];
    expect(checkAvailability(candidate, existing, capacity1)).toEqual({ status: "available" });
  });

  it("2. mesmo horário de início — conflict", () => {
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T10:00:00-03:00`, 60)];
    const result = checkAvailability(candidate, existing, capacity1);
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.conflictingAppointments.map((c) => c.id)).toEqual(["a1"]);
  });

  it("3. novo atendimento começando durante outro — conflict", () => {
    // existente 10:00-11:00, novo 10:30-11:30
    const candidate = { scheduledAt: `${day}T10:30:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T10:00:00-03:00`, 60)];
    expect(checkAvailability(candidate, existing, capacity1).status).toBe("conflict");
  });

  it("4. novo atendimento terminando durante outro — conflict", () => {
    // existente 10:30-11:30, novo 10:00-11:00 (termina dentro do existente)
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T10:30:00-03:00`, 60)];
    expect(checkAvailability(candidate, existing, capacity1).status).toBe("conflict");
  });

  it("5. novo atendimento envolvendo completamente outro — conflict", () => {
    // existente 10:15-10:45, novo 10:00-11:00
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T10:15:00-03:00`, 30)];
    expect(checkAvailability(candidate, existing, capacity1).status).toBe("conflict");
  });

  it("6. atendimento existente envolvendo completamente o novo — conflict", () => {
    // existente 09:00-12:00, novo 10:00-10:30
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 30 };
    const existing = [occ("a1", `${day}T09:00:00-03:00`, 180)];
    expect(checkAvailability(candidate, existing, capacity1).status).toBe("conflict");
  });

  it("7. atendimento existente termina exatamente quando o próximo começa — não deve conflitar", () => {
    // existente 09:00-10:00, novo 10:00-11:00
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T09:00:00-03:00`, 60)];
    expect(checkAvailability(candidate, existing, capacity1)).toEqual({ status: "available" });
  });

  it("8. novo atendimento começa exatamente quando o anterior termina — não deve conflitar", () => {
    // existente 10:00-11:00, novo 11:00-11:30
    const candidate = { scheduledAt: `${day}T11:00:00-03:00`, durationMinutes: 30 };
    const existing = [occ("a1", `${day}T10:00:00-03:00`, 60)];
    expect(checkAvailability(candidate, existing, capacity1)).toEqual({ status: "available" });
  });

  it("10. duração ausente (nem própria, nem do catálogo) — insufficient_data, nunca inventa", () => {
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: null };
    const result = checkAvailability(candidate, [], capacity1);
    expect(result.status).toBe("insufficient_data");
  });

  it("agendamento existente com duração indeterminada — insufficient_data, nunca tratado como 0 minutos", () => {
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T09:00:00-03:00`, null)];
    const result = checkAvailability(candidate, existing, capacity1);
    expect(result.status).toBe("insufficient_data");
    if (result.status === "insufficient_data") expect(result.undeterminedAppointments?.map((a) => a.id)).toEqual(["a1"]);
  });

  it("capacidade não configurada + sobreposição real — insufficient_data, nunca assume capacidade = 1", () => {
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T10:00:00-03:00`, 60)];
    const result = checkAvailability(candidate, existing, null);
    expect(result.status).toBe("insufficient_data");
  });

  it("capacidade não configurada + nenhuma sobreposição — available (não bloqueia sem necessidade)", () => {
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    expect(checkAvailability(candidate, [], null)).toEqual({ status: "available" });
  });

  it("2 boxes, 1 sobreposição — ainda cabe (available), respeitando boxesCount real", () => {
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T10:00:00-03:00`, 60)];
    expect(checkAvailability(candidate, existing, capacity2)).toEqual({ status: "available" });
  });

  it("2 boxes, 2 sobreposições — excede a capacidade real (conflict)", () => {
    const candidate = { scheduledAt: `${day}T10:00:00-03:00`, durationMinutes: 60 };
    const existing = [occ("a1", `${day}T10:00:00-03:00`, 60), occ("a2", `${day}T10:15:00-03:00`, 60)];
    const result = checkAvailability(candidate, existing, capacity2);
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.conflictingAppointments).toHaveLength(2);
  });
});

describe("checkAvailabilityForRequest — orquestração real (repositório em memória)", () => {
  it("9. appointment cancelado não bloqueia horário", async () => {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Cliente Conflito 1", customerPhone: "48999330001", vehiclePlate: "CNF0001" });
    const catalog = await fetchServiceCatalog();
    const serviceId = catalog[0].id;
    const dayIso = addDaysIso(saoPauloDateISO(), 5);
    const appointment = await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60, notes: null });
    await updateAppointmentStatus(appointment.id, "cancelado");

    const result = await checkAvailabilityForRequest({ serviceId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60 });
    expect(result.status).toBe("available");
  });

  it("11. data/horário tratados corretamente perto da virada do dia em São Paulo", async () => {
    // Capacidade explícita nesta própria checagem — nunca depende de outro teste/arquivo já ter
    // configurado `operational_capacity_config` antes (o repositório em memória é um singleton
    // por processo de teste; sem isso, o resultado correto seria "insufficient_data", não "conflict").
    await setCapacityConfig({ boxesCount: 1, dailyOperatingMinutes: 480 });
    const { customer, vehicle } = await registerQuickCustomerAndVehicle({ customerName: "Cliente Conflito 2", customerPhone: "48999330002", vehiclePlate: "CNF0002" });
    const catalog = await fetchServiceCatalog();
    const serviceId = catalog[0].id;
    const dayIso = addDaysIso(saoPauloDateISO(), 6);
    // 23:30 em São Paulo (UTC-03:00) — em UTC já é o dia seguinte, mas continua `dayIso` no calendário de São Paulo.
    await createAppointment({ customerId: customer.id, vehicleId: vehicle.id, serviceId, scheduledAt: `${dayIso}T23:30:00-03:00`, expectedDurationMinutes: 60, notes: null });

    const result = await checkAvailabilityForRequest({ serviceId, scheduledAt: `${dayIso}T23:45:00-03:00`, expectedDurationMinutes: 30 });
    expect(result.status).toBe("conflict");
  });

  it("12. consultar disponibilidade não cria, altera nem cancela nenhum appointment real", async () => {
    const catalog = await fetchServiceCatalog();
    const serviceId = catalog[0].id;
    const dayIso = addDaysIso(saoPauloDateISO(), 7);
    const before = await getPlanningRepository().listAppointmentsInRange(dayIso, dayIso);

    await checkAvailabilityForRequest({ serviceId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60 });
    await checkAvailabilityForRequest({ serviceId, scheduledAt: `${dayIso}T10:00:00-03:00`, expectedDurationMinutes: 60 });

    const after = await getPlanningRepository().listAppointmentsInRange(dayIso, dayIso);
    expect(after).toEqual(before);
  });

  it("cai para services.estimatedDurationMinutes quando o agendamento não tem duração própria (repositório real teria o dado; em memória o fallback fica null e o resultado é insufficient_data — comportamento honesto, nunca inventado)", async () => {
    const catalog = await fetchServiceCatalog();
    const serviceId = catalog[0].id;
    const dayIso = addDaysIso(saoPauloDateISO(), 8);
    const result = await checkAvailabilityForRequest({ serviceId, scheduledAt: `${dayIso}T10:00:00-03:00` });
    expect(result.status).toBe("insufficient_data");
  });
});
