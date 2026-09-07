import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DaySummaryCards } from "./day-summary-cards";
import type { DayView } from "@/lib/planning/types";

/** Missão 40 (item 2, 5, I, M) — resumo operacional do dia nunca hard-codeia o denominador de capacidade. */

function baseDayView(overrides: Partial<DayView> = {}): DayView {
  return {
    dateIso: "2026-09-07",
    isToday: true,
    appointments: [],
    appointmentCount: 4,
    occupiedNowCount: 2,
    occupiedNowIndeterminateCount: 0,
    capacity: { configured: true, boxesCount: 2, dailyOperatingMinutes: 480, dailyCapacityMinutes: 960, committedMinutes: 240, availableMinutes: 720, percentOccupied: 25, estimatedBoxesOccupied: 0.5, appointmentsMissingDuration: 0 },
    nextAvailability: { status: "agora" },
    ...overrides,
  };
}

describe("DaySummaryCards", () => {
  it("mostra os 5 cards do resumo operacional", () => {
    const html = renderToStaticMarkup(createElement(DaySummaryCards, { dayView: baseDayView() }));
    expect(html).toContain("Agendamentos");
    expect(html).toContain("Em atendimento agora");
    expect(html).toContain("Capacidade simultânea");
    expect(html).toContain("Próxima disponibilidade");
    expect(html).toContain("Carga prevista do dia");
  });

  it("nunca usa a palavra 'boxes' na UI nova — usa 'posições'/'capacidade'", () => {
    const html = renderToStaticMarkup(createElement(DaySummaryCards, { dayView: baseDayView() }));
    expect(html.toLowerCase()).not.toContain("box");
  });

  it("I. o denominador de capacidade acompanha o valor real de boxesCount — 4 e 5, nunca hard-coded", () => {
    const html4 = renderToStaticMarkup(createElement(DaySummaryCards, { dayView: baseDayView({ capacity: { ...baseDayView().capacity, boxesCount: 4 } as DayView["capacity"] }) }));
    expect(html4).toContain("/ 4 posições");

    const html5 = renderToStaticMarkup(createElement(DaySummaryCards, { dayView: baseDayView({ capacity: { ...baseDayView().capacity, boxesCount: 5 } as DayView["capacity"] }) }));
    expect(html5).toContain("/ 5 posições");
  });

  it("M. sobrecarga (ocupados > capacidade) aparece como está, nunca escondida/clampada", () => {
    const html = renderToStaticMarkup(
      createElement(DaySummaryCards, { dayView: baseDayView({ occupiedNowCount: 3, capacity: { ...baseDayView().capacity, boxesCount: 2 } as DayView["capacity"] }) }),
    );
    expect(html).toContain("3 / 2 posições");
  });

  it("sem capacidade configurada, mostra estado honesto — nunca um número inventado", () => {
    const html = renderToStaticMarkup(createElement(DaySummaryCards, { dayView: baseDayView({ capacity: { configured: false }, nextAvailability: { status: "nao_configurado" } }) }));
    expect(html).toContain("Não configurada");
    expect(html).toContain("Capacidade não configurada");
    expect(html).toContain("—"); // carga prevista sem config
  });

  it("U. estado vazio (0 agendamentos) continua mostrando capacidade/próxima disponibilidade/carga normalmente", () => {
    const html = renderToStaticMarkup(createElement(DaySummaryCards, { dayView: baseDayView({ appointmentCount: 0, occupiedNowCount: 0 }) }));
    expect(html).toContain("Agendamentos");
    expect(html).toContain(">0<");
    expect(html).toContain("Capacidade simultânea");
    expect(html).toContain("Próxima disponibilidade");
  });

  it("aviso de agendamentos sem duração definida aparece quando existir, nunca escondido", () => {
    const html = renderToStaticMarkup(
      createElement(DaySummaryCards, { dayView: baseDayView({ capacity: { ...baseDayView().capacity, appointmentsMissingDuration: 2 } as DayView["capacity"] }) }),
    );
    expect(html).toContain("2 agendamento(s) sem duração definida.");
  });
});
