import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoalSection } from "./goal-section";
import type { Goal, GoalProgress } from "@/lib/goals/types";

/**
 * Missão 32 — testes T (renderização), item 1 (mês sem meta), 2 (meta cadastrada), 15 (painel
 * continua renderizando sem meta). Mesma técnica de `react-dom/server` já usada nas Missões
 * 20/28 (sem jsdom/Testing Library no projeto).
 */

function baseGoal(overrides: Partial<Goal> = {}): Goal {
  return { id: "goal-1", area: "consolidado", label: "Meta mensal — Consolidado (Setembro/2026)", targetAmount: 50000, periodStart: "2026-09-01", periodEnd: "2026-09-30", bonusTiers: [], ...overrides };
}

function progressFor(currentAmount: number, overrides: Partial<GoalProgress> = {}): GoalProgress {
  const goal = overrides.goal ?? baseGoal();
  const percentComplete = goal.targetAmount > 0 ? Math.round((currentAmount / goal.targetAmount) * 10000) / 100 : 0;
  const remainingAmount = Math.max(0, Math.round((goal.targetAmount - currentAmount) * 100) / 100);
  return {
    goal,
    currentAmount,
    percentComplete,
    remainingAmount,
    daysElapsed: 10,
    daysTotal: 30,
    projectedAmount: currentAmount * 3,
    projectedPercent: percentComplete * 3,
    pace: "no_ritmo",
    nextBonusTier: null,
    amountToNextBonus: null,
    ...overrides,
  };
}

describe("GoalSection — Missão 32", () => {
  it("1. mês sem meta -> mostra 'Meta mensal não definida' + botão 'Definir meta', sem crash", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { monthLabel: "Setembro/2026", monthKey: "2026-09", progress: null, error: null }));
    expect(html).toContain("Meta mensal não definida");
    expect(html).toContain("Definir meta");
    expect(html).not.toContain("Editar meta");
  });

  it("2. meta cadastrada -> mostra faturamento, meta, percentual, falta, média/dia, projeção, status", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { monthLabel: "Setembro/2026", monthKey: "2026-09", progress: progressFor(25000), error: null }));
    expect(html).toContain("Faturamento do mês");
    expect(html).toContain("Meta mensal");
    expect(html).toContain("Falta para a meta");
    expect(html).toContain("Média por dia");
    expect(html).toContain("Projeção do mês");
    expect(html).toContain("No ritmo");
    expect(html).toContain("Editar meta");
    expect(html).not.toContain("Definir meta");
  });

  it("barra de progresso: 0% renderiza sem crash e sem largura negativa/NaN", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { monthLabel: "Setembro/2026", monthKey: "2026-09", progress: progressFor(0), error: null }));
    expect(html).toContain("width:0%");
    expect(html).not.toMatch(/width:-|width:NaN|width:Infinity/);
  });

  it("meta ultrapassada (>100%): barra fica limitada a 100%, mas o texto mostra o percentual real", () => {
    const goal = baseGoal();
    const progress = progressFor(goal.targetAmount * 1.5, { goal });
    expect(progress.percentComplete).toBe(150);
    const html = renderToStaticMarkup(createElement(GoalSection, { monthLabel: "Setembro/2026", monthKey: "2026-09", progress, error: null }));
    expect(html).toContain("150%"); // texto real, sem limitar
    expect(html).toContain("width:100%"); // barra visual nunca passa de 100%
  });

  it("nunca produz width negativo/NaN/Infinity mesmo com percentComplete fora do range normal", () => {
    const progress = progressFor(1000, { percentComplete: Number.NaN });
    const html = renderToStaticMarkup(createElement(GoalSection, { monthLabel: "Setembro/2026", monthKey: "2026-09", progress, error: null }));
    expect(html).not.toMatch(/width:-|width:NaN|width:Infinity/);
  });

  it("15. erro de faturamento do mês não impede a renderização (mês sem meta)", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { monthLabel: "Setembro/2026", monthKey: "2026-09", progress: null, error: "A API do JumpPark não respondeu." }));
    expect(html).toContain("Meta mensal não definida");
    expect(html).toContain("indisponível");
  });

  it("valores monetários usam formato brasileiro (R$)", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { monthLabel: "Setembro/2026", monthKey: "2026-09", progress: progressFor(25000), error: null }));
    expect(html).toMatch(/R\$\s?25\.000,00/);
  });
});
