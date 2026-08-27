import type { AvailabilityCandidate, AvailabilityCheckResult, ConflictingAppointmentRef, OccupyingAppointmentForCheck, UndeterminedAppointmentRef } from "@/lib/planning/types";

/**
 * Missão 3.1 (Fase 3 — Motor de Disponibilidade e Conflito) — núcleo puro da detecção de
 * sobreposição de horário, no mesmo espírito de `capacity.ts`: funções puras, sem acesso a
 * banco, recebendo dados já resolvidos. A orquestração real (buscar agendamentos do dia,
 * resolver duração via catálogo, carregar `operational_capacity_config`) vive em
 * `checkAvailabilityForRequest` (service.ts).
 *
 * Nunca inventa capacidade (`capacity = null` quando `operational_capacity_config` não tem linha
 * ativa — jamais assumido como 1 box) nem duração (`durationMinutes = null` quando nem o
 * agendamento nem o serviço têm valor cadastrado).
 */

/**
 * `novo_inicio < existente_fim` E `novo_fim > existente_inicio` — sobreposição estrita.
 * Encostar exatamente na borda (um termina quando o outro começa) NUNCA é conflito — por isso
 * as comparações são `<`/`>`, nunca `<=`/`>=`.
 */
export function intervalsOverlap(newStartMs: number, newEndMs: number, existingStartMs: number, existingEndMs: number): boolean {
  return newStartMs < existingEndMs && newEndMs > existingStartMs;
}

/** Duração explícita do candidato sempre vence; cai para a duração do serviço só quando ausente. Nunca inventa um terceiro valor (ex.: média arbitrária). */
export function resolveCandidateDuration(explicitMinutes: number | null | undefined, serviceEstimatedDurationMinutes: number | null): number | null {
  return explicitMinutes ?? serviceEstimatedDurationMinutes;
}

/**
 * Núcleo puro da checagem de disponibilidade para um único candidato contra os agendamentos que
 * já ocupam capacidade no mesmo dia (status ∈ OCCUPYING_STATUSES — filtragem é responsabilidade
 * do chamador). `capacity` é a config ATIVA de `operational_capacity_config`, ou `null` quando
 * não configurada — nunca substituída por um valor padrão.
 */
export function checkAvailability(candidate: AvailabilityCandidate, sameDayOccupying: OccupyingAppointmentForCheck[], capacity: { boxesCount: number } | null): AvailabilityCheckResult {
  if (candidate.durationMinutes === null) {
    return {
      status: "insufficient_data",
      reason: "A duração deste serviço não está cadastrada (nem informada para este agendamento, nem no catálogo) — não é possível calcular o horário de término com segurança.",
    };
  }

  const candidateStart = Date.parse(candidate.scheduledAt);
  const candidateEnd = candidateStart + candidate.durationMinutes * 60_000;

  const known = sameDayOccupying.filter((a) => a.durationMinutes !== null) as (OccupyingAppointmentForCheck & { durationMinutes: number })[];
  const undetermined = sameDayOccupying.filter((a) => a.durationMinutes === null);
  const undeterminedAppointments: UndeterminedAppointmentRef[] = undetermined.map((a) => ({ id: a.id, scheduledAt: a.scheduledAt }));

  const overlapping = known.filter((a) => {
    const start = Date.parse(a.scheduledAt);
    const end = start + a.durationMinutes * 60_000;
    return intervalsOverlap(candidateStart, candidateEnd, start, end);
  });
  const conflictingAppointments: ConflictingAppointmentRef[] = overlapping.map((a) => ({ id: a.id, scheduledAt: a.scheduledAt, expectedDurationMinutes: a.durationMinutes }));

  // Agendamento do mesmo dia sem duração determinável: não dá para provar que NÃO sobrepõe o candidato — nunca tratado como 0 minutos.
  if (undetermined.length > 0) {
    return {
      status: "insufficient_data",
      reason: "Existem agendamentos no mesmo dia sem duração determinável (nem própria, nem do catálogo do serviço) — não é possível garantir ausência de conflito com eles.",
      conflictingAppointments: conflictingAppointments.length > 0 ? conflictingAppointments : undefined,
      undeterminedAppointments,
    };
  }

  if (!capacity) {
    if (overlapping.length > 0) {
      return {
        status: "insufficient_data",
        reason: "Há sobreposição de horário com outro(s) agendamento(s), mas a capacidade operacional (número de boxes) não está configurada — não é possível decidir se isso excede a capacidade disponível.",
        conflictingAppointments,
      };
    }
    return { status: "available" };
  }

  // +1 = o próprio candidato. Nunca assume capacidade = 1: compara contra boxesCount real.
  const simultaneousCount = overlapping.length + 1;
  if (simultaneousCount > capacity.boxesCount) {
    return { status: "conflict", conflictingAppointments };
  }
  return { status: "available" };
}
