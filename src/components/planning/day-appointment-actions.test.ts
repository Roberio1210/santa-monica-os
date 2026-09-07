import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayAppointmentActions } from "./day-appointment-actions";
import type { AppointmentStatus } from "@/lib/planning/types";

/** Missão 40 (item 10, V) — ações expostas somente quando válidas para o status atual, nenhuma regra de transição nova (só a exposição na UI). */

function render(status: AppointmentStatus) {
  return renderToStaticMarkup(createElement(DayAppointmentActions, { appointmentId: "a1", status }));
}

describe("DayAppointmentActions", () => {
  it("agendado -> mostra 'Iniciar atendimento' e 'Cancelar'", () => {
    const html = render("agendado");
    expect(html).toContain("Iniciar atendimento");
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("Concluir");
  });

  it("confirmado -> mostra 'Iniciar atendimento' e 'Cancelar'", () => {
    const html = render("confirmado");
    expect(html).toContain("Iniciar atendimento");
    expect(html).toContain("Cancelar");
  });

  it("em_andamento -> mostra 'Concluir' e 'Cancelar', nunca 'Iniciar atendimento' de novo", () => {
    const html = render("em_andamento");
    expect(html).toContain("Concluir");
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("Iniciar atendimento");
  });

  it("concluido -> nenhuma ação (estado terminal)", () => {
    expect(render("concluido")).toBe("");
  });

  it("cancelado -> nenhuma ação (estado terminal)", () => {
    expect(render("cancelado")).toBe("");
  });

  it("reagendado -> nenhuma ação (estado terminal)", () => {
    expect(render("reagendado")).toBe("");
  });
});
