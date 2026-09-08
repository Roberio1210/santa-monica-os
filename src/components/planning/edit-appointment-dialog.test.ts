import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditAppointmentDialog, EditAppointmentForm } from "./edit-appointment-dialog";
import { Dialog } from "@/components/ui/dialog";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import type { DayAppointmentView } from "@/lib/planning/types";

/**
 * Missão 48 (Parte B/K, Parte P itens 8-14/24) — modal de edição: cliente/telefone/veículo
 * SEMPRE somente leitura (nunca um <input>/<select> para eles), serviço/data/horário/observações
 * editáveis, placa com fluxo próprio. `EditAppointmentDialog` (fechado) só expõe o gatilho —
 * `EditAppointmentForm` é testado diretamente (fora do Dialog) para verificar a estrutura real do
 * formulário, já que o portal do Radix não renderiza conteúdo fechado em `renderToStaticMarkup`.
 */

const SERVICE_CATALOG: ServiceCatalogEntry[] = [
  { id: "s1", name: "Bronze", category: "Lavação", defaultPrice: 80 },
  { id: "s2", name: "Silver", category: "Lavação", defaultPrice: 120 },
];

function baseAppointment(overrides: Partial<DayAppointmentView> = {}): DayAppointmentView {
  return {
    id: "a1",
    scheduledAt: "2026-09-07T11:00:00-03:00",
    status: "agendado",
    customerId: "c1",
    customerName: "Maria Souza",
    phone: "48999990000",
    vehicleId: "v1",
    vehicleLabel: "Fiat Argo",
    plate: "ABC1D23",
    serviceId: "s1",
    serviceName: "Bronze",
    expectedDurationMinutes: 60,
    notes: "Cliente prefere tarde",
    signals: [],
    updatedAt: "2026-09-07T11:00:00.000Z",
    resolvedDurationMinutes: 60,
    endAt: "2026-09-07T12:00:00-03:00",
    simultaneousCount: 1,
    ...overrides,
  };
}

describe("EditAppointmentDialog — gatilho (fechado por padrão)", () => {
  it("mostra o botão 'Editar', sem vazar o conteúdo do modal fechado", () => {
    const html = renderToStaticMarkup(createElement(EditAppointmentDialog, { appointment: baseAppointment(), serviceCatalog: SERVICE_CATALOG }));
    expect(html).toContain("Editar");
    expect(html).not.toContain("Salvar alterações");
    expect(html).not.toContain("Editar agendamento");
  });
});

describe("EditAppointmentForm — Parte K (cliente/telefone/veículo somente leitura)", () => {
  function renderForm(overrides: Partial<DayAppointmentView> = {}): string {
    // `EditAppointmentForm` usa `DialogClose` (precisa de contexto de `Dialog`) — envolver com
    // `Dialog open` supre o contexto sem depender do portal condicional de `DialogContent`.
    return renderToStaticMarkup(
      createElement(Dialog, { open: true }, createElement(EditAppointmentForm, { appointment: baseAppointment(overrides), serviceCatalog: SERVICE_CATALOG, onSaved: () => {} })),
    );
  }

  it("item 8. cliente aparece como texto simples, nunca dentro de <input>/<select>", () => {
    const html = renderForm();
    expect(html).toContain("Maria Souza");
    expect(html).not.toMatch(/<input[^>]*value="Maria Souza"/);
  });

  it("item 9. telefone aparece como texto simples, nunca editável", () => {
    const html = renderForm();
    expect(html).toContain("48999990000");
    expect(html).not.toMatch(/<input[^>]*value="48999990000"/);
  });

  it("item 10. veículo aparece como texto simples, nunca editável", () => {
    const html = renderForm();
    expect(html).toContain("Fiat Argo");
    expect(html).not.toMatch(/<input[^>]*value="Fiat Argo"/);
  });

  it("item 11. serviço é editável — aparece como <select> com o catálogo real", () => {
    const html = renderForm();
    expect(html).toMatch(/<select[^>]*>/);
    expect(html).toContain("Bronze");
    expect(html).toContain("Silver");
  });

  it("item 12/13. data e horário são editáveis — <input type=\"date\"> e <input type=\"time\">", () => {
    const html = renderForm();
    expect(html).toMatch(/<input[^>]*type="date"/);
    expect(html).toMatch(/<input[^>]*type="time"/);
  });

  it("item 14. observações são editáveis — <textarea> com o valor atual", () => {
    const html = renderForm();
    expect(html).toMatch(/<textarea/);
    expect(html).toContain("Cliente prefere tarde");
  });

  it("item 24. plate presente aparece como texto simples, nunca um campo de edição direta", () => {
    const html = renderForm({ plate: "ABC1D23" });
    expect(html).toContain("ABC1D23");
    expect(html).not.toContain("Informar placa");
  });

  it("item 24/25. plate=NULL mostra 'Placa não informada' e o botão 'Informar placa' (fluxo assignVehiclePlateAction)", () => {
    const html = renderForm({ plate: null });
    expect(html).toContain("Placa não informada");
    expect(html).toContain("Informar placa");
  });

  it("nunca expõe campo para trocar cliente ou veículo (sem <select>/<input> de customerId/vehicleId)", () => {
    const html = renderForm();
    expect(html).not.toContain("Trocar cliente");
    expect(html).not.toContain("Trocar veículo");
  });
});
