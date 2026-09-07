import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlateConflictActions } from "./plate-conflict-actions";

/**
 * Missão 28 (Etapa E6) — testes T/U, mesma técnica de renderização estática usada na Missão 20
 * (`plate-conflict-review-card.test.ts`): sem jsdom/Testing Library no projeto, renderiza para
 * HTML com `react-dom/server` e verifica o markup. `useActionState` no render inicial só devolve
 * o estado inicial (sem round-trip de servidor), então isso funciona sem mocks.
 */
describe("PlateConflictActions — Missão 28 (T/U)", () => {
  it("T. renderiza as três ações", () => {
    const html = renderToStaticMarkup(createElement(PlateConflictActions, { reviewItemId: "review-1" }));
    expect(html).toContain("É o mesmo veículo");
    expect(html).toContain("São veículos diferentes");
    expect(html).toContain("Não tenho certeza");
  });

  it("U. NÃO mostra o texto de confirmação antes do operador clicar em 'É o mesmo veículo'", () => {
    const html = renderToStaticMarkup(createElement(PlateConflictActions, { reviewItemId: "review-1" }));
    expect(html).not.toContain("Confirma que estes dois registros representam o mesmo veículo?");
    expect(html).not.toContain("Confirmar vínculo");
  });

  it("os 3 forms carregam o reviewItemId correto como campo oculto", () => {
    const html = renderToStaticMarkup(createElement(PlateConflictActions, { reviewItemId: "review-xyz-123" }));
    const hiddenFieldCount = (html.match(/name="reviewItemId" value="review-xyz-123"/g) ?? []).length;
    expect(hiddenFieldCount).toBeGreaterThanOrEqual(2); // "diferentes" e "não tenho certeza" já têm form no render inicial ("mesmo veículo" só ganha form após confirmar)
  });
});
