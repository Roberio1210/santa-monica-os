import { describe, expect, it } from "vitest";
import { weekdayLabelFull } from "./day-navigator";

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
