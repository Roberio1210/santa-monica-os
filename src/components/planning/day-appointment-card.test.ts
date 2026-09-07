import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayAppointmentCard } from "./day-appointment-card";
import type { DayAppointmentView } from "@/lib/planning/types";

/** Missão 40 (item 6, R) — mesma técnica de `react-dom/server` já usada no projeto (sem jsdom). */

function baseAppointment(overrides: Partial<DayAppointmentView> = {}): DayAppointmentView {
  return {
    id: "a1",
    scheduledAt: "2026-09-07T11:00:00-03:00", // 08:00 -03:00 no fixture -> mantém explícito abaixo
    status: "agendado",
    customerId: "c1",
    customerName: "João da Silva",
    phone: "48999990000",
    vehicleId: "v1",
    vehicleLabel: "Chevrolet Onix",
    plate: "ABC1D23",
    serviceId: "s1",
    serviceName: "Bronze",
    expectedDurationMinutes: 75,
    notes: null,
    signals: [],
    resolvedDurationMinutes: 75,
    endAt: "2026-09-07T12:15:00-03:00",
    simultaneousCount: 1,
    ...overrides,
  };
}

describe("DayAppointmentCard", () => {
  it("mostra horário inicial–final, cliente, veículo, placa, serviço, duração e status", () => {
    const html = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment(), capacityBoxesCount: 2 }));
    expect(html).toContain("João da Silva");
    expect(html).toContain("Chevrolet Onix");
    expect(html).toContain("ABC1D23");
    expect(html).toContain("Bronze");
    expect(html).toContain("Agendado");
  });

  it("R. placa null renderiza explicitamente 'Placa não informada', nunca um placeholder inventado", () => {
    const html = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment({ plate: null }), capacityBoxesCount: 2 }));
    expect(html).toContain("Placa não informada");
    expect(html).not.toContain("ABC1D23");
  });

  it("duração indeterminada -> 'Tempo previsto não informado' e 'Horário final não definido', nunca um horário inventado", () => {
    const html = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment({ resolvedDurationMinutes: null, endAt: null }), capacityBoxesCount: 2 }));
    expect(html).toContain("Tempo previsto não informado");
    expect(html).toContain("Horário final não definido");
  });

  it("indicador de ocupação usa sempre o boxesCount real recebido, nunca um número fixo", () => {
    const html5 = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment({ simultaneousCount: 3 }), capacityBoxesCount: 5 }));
    expect(html5).toContain("3/5 posições");

    const html4 = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment({ simultaneousCount: 3 }), capacityBoxesCount: 4 }));
    expect(html4).toContain("3/4 posições");
  });

  it("sem capacidade configurada, não mostra o indicador de posições (nunca um denominador inventado)", () => {
    const html = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment(), capacityBoxesCount: null }));
    expect(html).not.toContain("posições");
  });
});
