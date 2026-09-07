import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlateConflictReviewCard } from "./plate-conflict-review-card";
import type { EnrichedPlateConflictReviewViewModel } from "@/lib/integrations/jumppark/plateConflictEnrichment";

/**
 * Missão 20 (Etapa D — UI read-only). O projeto não usa jsdom/Testing Library (vitest roda com
 * `environment: "node"`, ver vitest.config.ts) — em vez de introduzir essa dependência só para
 * este card, renderiza para HTML estático com `react-dom/server` (já uma dependência do Next.js)
 * e verifica o markup resultante por conteúdo/ausência de elementos. `PlateConflictReviewCard` é
 * um componente síncrono (Server Component sem `async`), então isso funciona sem mocks.
 */

function baseItem(overrides: Partial<EnrichedPlateConflictReviewViewModel> = {}): EnrichedPlateConflictReviewViewModel {
  return {
    reviewItemId: "review-1",
    subjectKey: "vehicle_plate_collision_manual_jumppark:MQT1A01",
    status: "pending",
    conflictType: "manual_jumppark",
    normalizedPlate: "MQT1A01",
    displayPlate: "MQT1A01",
    existingVehicles: [],
    incomingOrderIds: [],
    incomingOrders: [],
    decidedAt: null,
    decidedNotes: null,
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    ...overrides,
  };
}

function renderCard(item: EnrichedPlateConflictReviewViewModel, decided = false): string {
  return renderToStaticMarkup(createElement(PlateConflictReviewCard, { item, decided }));
}

describe("PlateConflictReviewCard — Missão 20 (Etapa D)", () => {
  it("A. manual_jumppark renderiza corretamente", () => {
    const html = renderCard(
      baseItem({
        existingVehicles: [{ vehicleId: "v1", unavailable: false, source: "manual", plate: "MQT1A01", model: "Ka", brand: "Ford", color: "Preto", customer: { id: "c1", name: "Cliente Um", phone: "48999990001" }, appointment: null }],
      }),
    );
    expect(html).toContain("Conflito de placa");
    expect(html).toContain("MQT1A01");
    expect(html).toContain("Veículo agendado/manual");
    expect(html).toContain("Cliente Um");
  });

  it("B. jumppark_jumppark renderiza corretamente", () => {
    const html = renderCard(
      baseItem({
        conflictType: "jumppark_jumppark",
        existingVehicles: [{ vehicleId: "v1", unavailable: false, source: "jumppark", plate: "MQT2B02", model: "Onix", brand: "Chevrolet", color: null, customer: null, appointment: null }],
      }),
    );
    expect(html).toContain("Conflito entre registros do JumpPark");
  });

  it("C. múltiplos candidates aparecem todos", () => {
    const html = renderCard(
      baseItem({
        existingVehicles: [
          { vehicleId: "v1", unavailable: false, source: "manual", plate: "MQT1A01", model: "Ka", brand: "Ford", color: null, customer: null, appointment: null },
          { vehicleId: "v2", unavailable: false, source: "jumppark", plate: "MQT9Z99", model: "Onix", brand: "Chevrolet", color: null, customer: null, appointment: null },
        ],
      }),
    );
    expect(html).toContain("MQT1A01");
    expect(html).toContain("MQT9Z99");
    expect(html).toContain("Mais de um veículo encontrado para esta placa");
  });

  it("D. appointment aparece quando presente", () => {
    const html = renderCard(
      baseItem({
        existingVehicles: [
          {
            vehicleId: "v1",
            unavailable: false,
            source: "manual",
            plate: "MQT1A01",
            model: "Ka",
            brand: "Ford",
            color: null,
            customer: null,
            appointment: { id: "appt-1", scheduledAt: "2026-09-10T13:00:00.000Z", status: "agendado", serviceId: "s1", serviceName: "Lavação Completa" },
          },
        ],
      }),
    );
    expect(html).toContain("Agendamento relacionado");
    expect(html).toContain("Lavação Completa");
    expect(html).toContain("Nenhuma alteração automática foi realizada");
  });

  it("E. sem appointment não quebra", () => {
    const html = renderCard(
      baseItem({
        existingVehicles: [{ vehicleId: "v1", unavailable: false, source: "manual", plate: "MQT1A01", model: null, brand: null, color: null, customer: null, appointment: null }],
      }),
    );
    expect(html).not.toContain("Agendamento relacionado");
  });

  it("F. vehicle unavailable não quebra", () => {
    const html = renderCard(baseItem({ existingVehicles: [{ vehicleId: "v-sumiu", unavailable: true, source: null, plate: null, model: null, brand: null, color: null, customer: null, appointment: null }] }));
    expect(html).toContain("não foi encontrado");
  });

  it("G. incoming order ausente não quebra (array vazio e entrada unavailable)", () => {
    const htmlVazio = renderCard(baseItem({ incomingOrders: [] }));
    expect(htmlVazio).toContain("Nenhum dado incoming disponível");

    const htmlUnavailable = renderCard(baseItem({ incomingOrders: [{ orderId: "o1", unavailable: true, externalId: null, orderDate: null, plateMasked: null, vehicleModel: null, clientName: null, clientPhoneMasked: null }] }));
    expect(htmlUnavailable).toContain("Ordem de origem não encontrada localmente");
  });

  it("H. status preservado (pending e kept_separate, sem reinterpretar a decisão)", () => {
    expect(renderCard(baseItem({ status: "pending" }))).toContain("Pendente");
    const decidedHtml = renderCard(baseItem({ status: "kept_separate", decidedNotes: "Carros diferentes" }), true);
    expect(decidedHtml).toContain("Mantido separado");
    expect(decidedHtml).toContain("Carros diferentes");
    expect(renderCard(baseItem({ status: "deferred" }))).toContain("Revisar depois");
  });

  it("K. nenhuma ação de merge/mutação aparece — sem form, sem button, sem texto de ação", () => {
    const html = renderCard(
      baseItem({
        existingVehicles: [{ vehicleId: "v1", unavailable: false, source: "manual", plate: "MQT1A01", model: null, brand: null, color: null, customer: null, appointment: null }],
      }),
      true,
    );
    expect(html).not.toMatch(/<form|<button/i);
    expect(html).not.toMatch(/vincular|fundir|merge|manter separados|revisar depois|reabrir/i);
  });

  it("M. sem tabela horizontal (mobile-safe) — markup usa grid/flex, nunca <table>", () => {
    const html = renderCard(
      baseItem({
        existingVehicles: [
          { vehicleId: "v1", unavailable: false, source: "manual", plate: "MQT1A01", model: null, brand: null, color: null, customer: null, appointment: null },
          { vehicleId: "v2", unavailable: false, source: "jumppark", plate: "MQT2B02", model: null, brand: null, color: null, customer: null, appointment: null },
        ],
        incomingOrders: [{ orderId: "o1", unavailable: false, externalId: "ext-1", orderDate: "2026-01-01", plateMasked: "MQT1A01", vehicleModel: "Ka", clientName: "Fulano", clientPhoneMasked: "489***" }],
      }),
    );
    expect(html).not.toMatch(/<table/i);
  });

  it("evidência com nenhum candidato existente (empty existingVehicles) não quebra", () => {
    const html = renderCard(baseItem({ existingVehicles: [] }));
    expect(html).toContain("Nenhum veículo existente identificado");
  });
});
