import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppointmentCard } from "./appointment-card";
import type { AppointmentView } from "@/lib/planning/types";

/** Missão 40 (item 6, R) — mesma correção de honestidade de placa aplicada ao card compartilhado (usado fora da visão de dia: busca, semana, próxima semana, todos). */

function baseAppointment(overrides: Partial<AppointmentView> = {}): AppointmentView {
  return {
    id: "a1",
    scheduledAt: "2026-09-07T11:00:00-03:00",
    status: "agendado",
    customerId: "c1",
    customerName: "Maria Souza",
    phone: null,
    vehicleId: "v1",
    vehicleLabel: "Fiat Argo",
    plate: "XYZ9A87",
    serviceId: "s1",
    serviceName: "Silver",
    expectedDurationMinutes: 60,
    notes: null,
    signals: [],
    ...overrides,
  };
}

describe("AppointmentCard — placa (Missão 40, item R)", () => {
  it("com placa, mostra a placa normalmente", () => {
    const html = renderToStaticMarkup(createElement(AppointmentCard, { appointment: baseAppointment() }));
    expect(html).toContain("XYZ9A87");
  });

  it("plate=null renderiza explicitamente 'Placa não informada', nunca omite o campo silenciosamente", () => {
    const html = renderToStaticMarkup(createElement(AppointmentCard, { appointment: baseAppointment({ plate: null }) }));
    expect(html).toContain("Placa não informada");
  });
});
