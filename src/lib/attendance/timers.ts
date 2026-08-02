import type { ServiceOrderStatus } from "@/lib/attendance/types";

/**
 * Cronômetro de uma Ordem de Serviço — puro, sem I/O. O schema não guarda histórico de
 * transições de status (só o status atual + `updatedAt` da última mudança), então só
 * conseguimos derivar honestamente três números:
 *  - `sinceEntryMinutes`: sempre disponível, `agora - visitCreatedAt`.
 *  - `inExecutionMinutes`: só enquanto o status atual é `em_execucao` — nesse caso `updatedAt` É
 *    o momento em que entrou em execução (foi a última mudança de status). Em qualquer outro
 *    status, essa informação já foi sobrescrita pela mudança seguinte — `null`, nunca estimado.
 *  - `totalMinutes`: só quando `entregue` (`updatedAt - visitCreatedAt`, tempo fechado). Enquanto
 *    o atendimento ainda está aberto, "tempo total" ainda não existe — `null`, nunca confundido
 *    com `sinceEntryMinutes` (que continua contando).
 */
export interface OrderTimers {
  sinceEntryMinutes: number;
  inExecutionMinutes: number | null;
  totalMinutes: number | null;
}

/** Minutos entre um timestamp ISO e `now` — nunca negativo. Base de todo cronômetro do módulo. */
export function minutesSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - Date.parse(iso)) / 60_000);
}

export function computeOrderTimers(
  params: { status: ServiceOrderStatus; visitCreatedAt: string; updatedAt: string },
  now: Date = new Date(),
): OrderTimers {
  const { status, visitCreatedAt, updatedAt } = params;

  return {
    sinceEntryMinutes: minutesSince(visitCreatedAt, now),
    inExecutionMinutes: status === "em_execucao" ? minutesSince(updatedAt, now) : null,
    totalMinutes: status === "entregue" ? Math.max(0, (Date.parse(updatedAt) - Date.parse(visitCreatedAt)) / 60_000) : null,
  };
}
