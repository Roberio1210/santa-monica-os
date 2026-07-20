/**
 * Horários oficiais de funcionamento — Sta Mônica Estética Automotiva e Estacionamento
 * (confirmados pelo usuário, Sprint 4.0, 20/07/2026). Lavação e Estacionamento têm
 * expedientes DIFERENTES — todo o resto do módulo situacional trata cada área separadamente,
 * nunca um horário único para "a empresa".
 *
 * `close: "24:00"` representa "até o fim do dia corrente" (ex.: estacionamento quarta a sábado,
 * que fecha à meia-noite) — evita lidar com virada de dia/mês nos cálculos de estágio.
 */

export type ServiceArea = "lavacao" | "estacionamento";

export interface DayHours {
  open: string;
  close: string;
}

/** Índice 0 = domingo, 1 = segunda, ... 6 = sábado — mesmo padrão de `Date.getUTCDay()`. */
export type WeeklyHours = readonly [DayHours | null, DayHours | null, DayHours | null, DayHours | null, DayHours | null, DayHours | null, DayHours | null];

export const LAVACAO_HOURS: WeeklyHours = [
  null, // domingo — fechado
  { open: "08:00", close: "18:00" }, // segunda
  { open: "08:00", close: "18:00" }, // terça
  { open: "08:00", close: "18:00" }, // quarta
  { open: "08:00", close: "18:00" }, // quinta
  { open: "08:00", close: "18:00" }, // sexta
  { open: "08:00", close: "12:00" }, // sábado
];

export const ESTACIONAMENTO_HOURS: WeeklyHours = [
  { open: "12:00", close: "22:00" }, // domingo
  { open: "08:00", close: "18:00" }, // segunda
  { open: "08:00", close: "22:00" }, // terça
  { open: "08:00", close: "24:00" }, // quarta
  { open: "08:00", close: "24:00" }, // quinta
  { open: "08:00", close: "24:00" }, // sexta
  { open: "08:00", close: "24:00" }, // sábado
];

export const AREA_HOURS: Record<ServiceArea, WeeklyHours> = {
  lavacao: LAVACAO_HOURS,
  estacionamento: ESTACIONAMENTO_HOURS,
};

export function hoursForWeekday(area: ServiceArea, weekday: number): DayHours | null {
  return AREA_HOURS[area][weekday] ?? null;
}
