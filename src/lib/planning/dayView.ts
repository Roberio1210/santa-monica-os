import { intervalsOverlap } from "@/lib/planning/availability";
import { saoPauloTimeHM } from "@/lib/utils/timezone";

/**
 * Missão 40 (Fase 1 — Agenda Operacional Visual) — funções puras da visão de UM dia. Nenhuma
 * regra de conflito/capacidade é recriada aqui: tudo reaproveita `intervalsOverlap` (availability.ts)
 * e recebe `capacity`/durações já resolvidas pelo chamador (mesmo padrão de `capacity.ts`).
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `raw` inválido ou ausente → sempre cai em `todayIso`, nunca uma data inventada/fora de padrão. */
export function resolveDayParam(raw: string | undefined | null, todayIso: string): string {
  if (raw && ISO_DATE_RE.test(raw)) return raw;
  return todayIso;
}

/**
 * Missão 39 (Parte E) confirmou: não existe horário de abertura estruturado em nenhuma tabela —
 * só o texto livre de `COMPANY_INFO.businessHours` ("08:00 às 18:00" nos dias úteis, "08:00 às
 * 14:00" aos sábados — o INÍCIO é sempre 08:00, real e confirmado pelo gestor). O FIM da janela
 * nunca é reinventado aqui: vem sempre de `dailyOperatingMinutes`, a mesma configuração real usada
 * por `computeCapacitySummary`/`fetchCapacityForDate` — nenhuma fórmula paralela de carga.
 */
export const EXPEDIENTE_START_HOUR = 8;

export function resolveExpedienteWindow(dateIso: string, dailyOperatingMinutes: number): { startMs: number; endMs: number } {
  const startMs = Date.parse(`${dateIso}T${String(EXPEDIENTE_START_HOUR).padStart(2, "0")}:00:00-03:00`);
  return { startMs, endMs: startMs + dailyOperatingMinutes * 60_000 };
}

export interface ResolvedDurationAppointment {
  id: string;
  scheduledAt: string;
  /** Já resolvida (própria ou fallback do catálogo) — `null` = indeterminada, nunca 0 inventado. */
  durationMinutes: number | null;
}

export interface OccupiedNowResult {
  occupiedCount: number;
  /** Agendamentos já iniciados (`scheduledAt <= now`) cuja duração é indeterminada — não entram em `occupiedCount`, nunca tratados como 0 nem como ocupando. */
  indeterminateCount: number;
}

/**
 * Um agendamento ocupa capacidade "agora" somente quando já começou (`scheduledAt <= now`) E tem
 * duração resolvida E `now` ainda está dentro do intervalo — limite final EXCLUSIVO
 * (`now < scheduledAt + duração`), mesma convenção de `intervalsOverlap`: 08:00–09:00 está ocupado
 * às 08:59 e livre às 09:00 em ponto. Um agendamento que ainda não começou nunca ocupa "agora",
 * independentemente de ter duração conhecida.
 */
export function computeOccupiedNow(appointments: ResolvedDurationAppointment[], nowMs: number): OccupiedNowResult {
  let occupiedCount = 0;
  let indeterminateCount = 0;
  for (const appointment of appointments) {
    const startMs = Date.parse(appointment.scheduledAt);
    if (startMs > nowMs) continue;
    if (appointment.durationMinutes === null) {
      indeterminateCount++;
      continue;
    }
    const endMs = startMs + appointment.durationMinutes * 60_000;
    if (nowMs < endMs) occupiedCount++;
  }
  return { occupiedCount, indeterminateCount };
}

/**
 * Quantos agendamentos (incluindo o próprio) ocupam capacidade ao mesmo tempo que cada um —
 * reaproveita `intervalsOverlap`, nunca uma segunda regra de sobreposição. `null` para um
 * agendamento com duração indeterminada (não dá para saber com quem ele se sobrepõe).
 */
export function computeSimultaneousOccupancyMap(appointments: ResolvedDurationAppointment[]): Map<string, number | null> {
  const known = appointments.filter((a): a is ResolvedDurationAppointment & { durationMinutes: number } => a.durationMinutes !== null);
  const result = new Map<string, number | null>();

  for (const appointment of appointments) {
    if (appointment.durationMinutes === null) {
      result.set(appointment.id, null);
      continue;
    }
    const start = Date.parse(appointment.scheduledAt);
    const end = start + appointment.durationMinutes * 60_000;
    const count = known.filter((other) => {
      if (other.id === appointment.id) return true;
      const otherStart = Date.parse(other.scheduledAt);
      const otherEnd = otherStart + other.durationMinutes * 60_000;
      return intervalsOverlap(start, end, otherStart, otherEnd);
    }).length;
    result.set(appointment.id, count);
  }
  return result;
}

export type NextAvailabilityResult =
  | { status: "nao_configurado" }
  | { status: "dia_encerrado" }
  | { status: "agora" }
  | { status: "horario"; time: string }
  | { status: "sem_disponibilidade" }
  | { status: "expediente_encerrado" };

/**
 * "Qual o próximo instante do dia em que existe pelo menos uma posição livre?" — varre o
 * expediente em passos de `granularityMinutes` contando sobreposições reais (mesma lógica de
 * `checkAvailability`, nunca uma segunda regra). Nunca inventa serviço/duração fictícia: só
 * verifica ocupação dos agendamentos já resolvidos pelo chamador. Nunca retorna horário fora do
 * expediente — o laço nunca ultrapassa `expedienteEndMs`.
 *
 * Limitação conhecida (Missão 43): esta função, sozinha, não distingue "hoje, fora do expediente"
 * de "um dia inteiramente passado" — ambos batem em `nowMs >= expedienteEndMs` e voltam
 * `expediente_encerrado`. Para um dia estritamente anterior a hoje, o chamador (`fetchDayView`)
 * decide ANTES de chamar esta função e retorna `dia_encerrado` diretamente — nenhuma regra nova de
 * disponibilidade, só uma classificação mais honesta de um resultado que, para o passado, nunca
 * teve utilidade prática.
 */
export function findNextAvailableSlot(
  occupying: ResolvedDurationAppointment[],
  capacity: { boxesCount: number } | null,
  params: { nowMs: number; expedienteStartMs: number; expedienteEndMs: number; granularityMinutes: number },
): NextAvailabilityResult {
  if (!capacity) return { status: "nao_configurado" };
  const { nowMs, expedienteStartMs, expedienteEndMs, granularityMinutes } = params;
  if (nowMs >= expedienteEndMs) return { status: "expediente_encerrado" };

  const known = occupying.filter((a): a is ResolvedDurationAppointment & { durationMinutes: number } => a.durationMinutes !== null);
  const occupiedCountAt = (instantMs: number): number =>
    known.filter((a) => {
      const start = Date.parse(a.scheduledAt);
      const end = start + a.durationMinutes * 60_000;
      return start <= instantMs && instantMs < end;
    }).length;

  if (nowMs >= expedienteStartMs && occupiedCountAt(nowMs) < capacity.boxesCount) {
    return { status: "agora" };
  }

  const stepMs = granularityMinutes * 60_000;
  const searchStartMs = Math.max(nowMs, expedienteStartMs);
  const alignedStartMs = expedienteStartMs + Math.ceil((searchStartMs - expedienteStartMs) / stepMs) * stepMs;

  for (let t = alignedStartMs; t < expedienteEndMs; t += stepMs) {
    if (occupiedCountAt(t) < capacity.boxesCount) {
      return { status: "horario", time: saoPauloTimeHM(new Date(t)) };
    }
  }
  return { status: "sem_disponibilidade" };
}

export function formatNextAvailability(result: NextAvailabilityResult): string {
  switch (result.status) {
    case "agora":
      return "Agora";
    case "horario":
      return result.time;
    case "sem_disponibilidade":
      return "Sem disponibilidade hoje";
    case "expediente_encerrado":
      return "Expediente encerrado";
    case "dia_encerrado":
      return "Dia encerrado";
    case "nao_configurado":
      return "Capacidade não configurada";
  }
}
