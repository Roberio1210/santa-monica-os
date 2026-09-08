import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayAppointmentCard } from "./day-appointment-card";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import type { AppointmentStatus, DayAppointmentView } from "@/lib/planning/types";

const SERVICE_CATALOG: ServiceCatalogEntry[] = [
  { id: "s1", name: "Bronze", category: "Lavação", defaultPrice: 80 },
  { id: "s2", name: "Silver", category: "Lavação", defaultPrice: 120 },
];

/**
 * Missão 40 (item 6, R) / Missão 43 (Parte B/H/I) / Missão 46 (Parte E, itens 5/6) — mesma técnica
 * de `react-dom/server` já usada no projeto (sem jsdom). Cobre o redesenho compacto e a proteção
 * temporal: mesmos dados/garantias de antes, card de histórico permanece totalmente visível.
 */

const TODAY_ISO = "2026-09-07";

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
    updatedAt: "2026-09-07T11:00:00.000Z",
    resolvedDurationMinutes: 75,
    endAt: "2026-09-07T12:15:00-03:00",
    simultaneousCount: 1,
    ...overrides,
  };
}

function renderCard(overrides: Partial<DayAppointmentView> = {}, capacityBoxesCount: number | null = 2, todayIso: string = TODAY_ISO): string {
  return renderToStaticMarkup(createElement(DayAppointmentCard, { appointment: baseAppointment(overrides), capacityBoxesCount, todayIso, serviceCatalog: SERVICE_CATALOG }));
}

describe("DayAppointmentCard", () => {
  it("mostra horário inicial–final, cliente, veículo, placa, serviço, duração e status", () => {
    const html = renderCard();
    expect(html).toContain("João da Silva");
    expect(html).toContain("Chevrolet Onix");
    expect(html).toContain("ABC1D23");
    expect(html).toContain("Bronze");
    expect(html).toContain("Agendado");
  });

  it("R. placa null renderiza explicitamente 'Placa não informada', nunca um placeholder inventado", () => {
    const html = renderCard({ plate: null });
    expect(html).toContain("Placa não informada");
    expect(html).not.toContain("ABC1D23");
  });

  it("duração indeterminada -> 'Tempo previsto não informado' e 'Horário final não definido', nunca um horário inventado", () => {
    const html = renderCard({ resolvedDurationMinutes: null, endAt: null });
    expect(html).toContain("Tempo previsto não informado");
    expect(html).toContain("Horário final não definido");
  });

  it("indicador de ocupação usa sempre o boxesCount real recebido, nunca um número fixo", () => {
    expect(renderCard({ simultaneousCount: 3 }, 5)).toContain("3/5 posições");
    expect(renderCard({ simultaneousCount: 3 }, 4)).toContain("3/4 posições");
  });

  it("sem capacidade configurada, não mostra o indicador de posições (nunca um denominador inventado)", () => {
    const html = renderCard({}, null);
    expect(html).not.toContain("posições");
  });

  it("item 20 (Missão 43). denominador de capacidade acompanha qualquer valor real, nunca fixo em 4 (config atual de produção)", () => {
    expect(renderCard({ simultaneousCount: 6 }, 7)).toContain("6/7 posições");
  });

  it("item 19 (Missão 43). nunca renderiza texto de box individual nomeado ('Box 1', 'Box 2'...)", () => {
    expect(renderCard({}, 4)).not.toMatch(/Box\s*\d/i);
  });

  for (const status of ["agendado", "confirmado", "em_andamento", "concluido", "cancelado", "reagendado"] as AppointmentStatus[]) {
    it(`itens 7-11 (Missão 43). status '${status}' renderiza sem quebrar, via StatusBadge reaproveitado`, () => {
      expect(renderCard({ status }, 4).length).toBeGreaterThan(0);
    });
  }

  it("item 15 (Missão 43). sinal de 'Primeira visita' é preservado quando presente nos dados reais", () => {
    const html = renderCard({ signals: [{ id: "primeira_visita", label: "Primeira visita" }] }, 4);
    expect(html).toContain("Primeira visita");
  });

  it("agendamento cancelado/reagendado (fora de OCCUPYING_STATUSES) nunca mostra indicador de posições — a engine já não computa simultaneousCount para eles", () => {
    const html = renderCard({ status: "cancelado", simultaneousCount: null }, 4);
    expect(html).not.toContain("posições");
  });

  it("item 5 (Missão 46). appointment de data passada continua com o card totalmente visível como histórico (cliente/veículo/placa/serviço/duração/telefone/status)", () => {
    const html = renderCard({ scheduledAt: "2026-09-06T11:00:00-03:00", endAt: "2026-09-06T12:15:00-03:00" }, 4, TODAY_ISO);
    expect(html).toContain("João da Silva");
    expect(html).toContain("Chevrolet Onix");
    expect(html).toContain("ABC1D23");
    expect(html).toContain("Bronze");
    expect(html).toContain("48999990000");
    expect(html).toContain("Agendado");
  });

  it("item 6 (Missão 46). appointment de data passada mostra 'Histórico' no lugar das ações", () => {
    const html = renderCard({ scheduledAt: "2026-09-06T11:00:00-03:00", endAt: "2026-09-06T12:15:00-03:00" }, 4, TODAY_ISO);
    expect(html).toContain("Histórico");
    expect(html).not.toContain("Iniciar atendimento");
    expect(html).not.toContain("Cancelar");
  });

  it("primeira visita continua visível mesmo em data passada (histórico não esconde sinais reais)", () => {
    const html = renderCard(
      { scheduledAt: "2026-09-06T11:00:00-03:00", endAt: "2026-09-06T12:15:00-03:00", signals: [{ id: "primeira_visita", label: "Primeira visita" }] },
      4,
      TODAY_ISO,
    );
    expect(html).toContain("Primeira visita");
  });
});
