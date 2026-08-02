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

export function computeOrderTimers(
  params: { status: ServiceOrderStatus; visitCreatedAt: string; updatedAt: string },
  now: Date = new Date(),
): OrderTimers {
  const { status, visitCreatedAt, updatedAt } = params;
  const minutesBetween = (fromIso: string, toMs: number) => Math.max(0, (toMs - Date.parse(fromIso)) / 60_000);

  return {
    sinceEntryMinutes: minutesBetween(visitCreatedAt, now.getTime()),
    inExecutionMinutes: status === "em_execucao" ? minutesBetween(updatedAt, now.getTime()) : null,
    totalMinutes: status === "entregue" ? minutesBetween(visitCreatedAt, Date.parse(updatedAt)) : null,
  };
}
