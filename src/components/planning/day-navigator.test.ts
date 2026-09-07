import { describe, expect, it } from "vitest";
import { dayContextLabel, weekdayLabelFull } from "./day-navigator";

/**
 * Missão 40 (item 1, T) — `DayNavigator` usa `useRouter`/`useSearchParams` (precisa de um App
 * Router montado), então só a função pura de rótulo é testada diretamente aqui — mesma limitação
 * já aceita para `RangeFilter`, que também nunca teve teste de render por depender desses hooks.
 */
describe("weekdayLabelFull", () => {
  it("mapeia corretamente os 7 dias da semana", () => {
    expect(weekdayLabelFull("2026-09-06")).toBe("Domingo"); // 06/09/2026 é domingo
    expect(weekdayLabelFull("2026-09-07")).toBe("Segunda-feira");
    expect(weekdayLabelFull("2026-09-12")).toBe("Sábado");
  });

  it("virada de mês/ano não afeta o cálculo do dia da semana", () => {
    expect(weekdayLabelFull("2026-08-31")).toBe("Segunda-feira");
    expect(weekdayLabelFull("2026-12-31")).toBe("Quinta-feira");
  });
});

describe("dayContextLabel — Missão 43 (Parte G, item 12)", () => {
  const todayIso = "2026-09-07";

  it("hoje -> relative 'Hoje', nunca passado", () => {
    expect(dayContextLabel(todayIso, todayIso)).toEqual({ relative: "Hoje", isPast: false });
  });

  it("amanhã -> relative 'Amanhã', nunca passado", () => {
    expect(dayContextLabel("2026-09-08", todayIso)).toEqual({ relative: "Amanhã", isPast: false });
  });

  it("ontem -> relative 'Ontem' e passado", () => {
    expect(dayContextLabel("2026-09-06", todayIso)).toEqual({ relative: "Ontem", isPast: true });
  });

  it("data mais distante no passado -> sem rótulo relativo, mas isPast=true (Dia encerrado)", () => {
    expect(dayContextLabel("2026-08-29", todayIso)).toEqual({ relative: null, isPast: true });
  });

  it("data futura distante -> sem rótulo relativo, nunca marcada como passado", () => {
    expect(dayContextLabel("2026-09-20", todayIso)).toEqual({ relative: null, isPast: false });
  });

  it("virada de ano não confunde a comparação de passado", () => {
    expect(dayContextLabel("2026-12-31", "2027-01-01")).toEqual({ relative: "Ontem", isPast: true });
  });
});
