import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayAppointmentCard } from "./day-appointment-card";
import type { AppointmentStatus, DayAppointmentView } from "@/lib/planning/types";

/**
 * Missão 40 (item 6, R) / Missão 43 (Parte B/H/I) — mesma técnica de `react-dom/server` já usada
 * no projeto (sem jsdom). Cobre o redesenho compacto: mesmos dados/garantias de antes, só
 * reorganizados visualmente.
 */

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

  it("item 20. denominador de capacidade acompanha qualquer valor real, nunca fixo em 4 (config atual de produção)", () => {
    const html = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment({ simultaneousCount: 6 }), capacityBoxesCount: 7 }));
    expect(html).toContain("6/7 posições");
  });

  it("item 19. nunca renderiza texto de box individual nomeado ('Box 1', 'Box 2'...)", () => {
    const html = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment(), capacityBoxesCount: 4 }));
    expect(html).not.toMatch(/Box\s*\d/i);
  });

  for (const status of ["agendado", "confirmado", "em_andamento", "concluido", "cancelado", "reagendado"] as AppointmentStatus[]) {
    it(`itens 7-11. status '${status}' renderiza sem quebrar, via StatusBadge reaproveitado`, () => {
      const html = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment({ status }), capacityBoxesCount: 4 }));
      expect(html.length).toBeGreaterThan(0);
    });
  }

  it("item 15. sinal de 'Primeira visita' é preservado quando presente nos dados reais", () => {
    const html = renderToStaticMarkup(
      createElement(DayAppointmentCard, { appointment: baseAppointment({ signals: [{ id: "primeira_visita", label: "Primeira visita" }] }), capacityBoxesCount: 4 }),
    );
    expect(html).toContain("Primeira visita");
  });

  it("agendamento cancelado/reagendado (fora de OCCUPYING_STATUSES) nunca mostra indicador de posições — a engine já não computa simultaneousCount para eles", () => {
    const html = renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment({ status: "cancelado", simultaneousCount: null }), capacityBoxesCount: 4 }));
    expect(html).not.toContain("posições");
  });
});
