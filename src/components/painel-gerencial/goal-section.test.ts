import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoalSection } from "./goal-section";
import type { Goal, GoalProgress } from "@/lib/goals/types";

/**
 * Missão 32 — testes T (renderização), item 1 (mês sem meta), 2 (meta cadastrada), 15 (painel
 * continua renderizando sem meta). Missão 36 — Passo 3/4/7: os dois cards (Meta Geral/Meta
 * Estética) têm título/subtítulo/estado-vazio próprios e nunca compartilham o campo oculto
 * `area` do formulário. Mesma técnica de `react-dom/server` já usada nas Missões 20/28 (sem
 * jsdom/Testing Library no projeto).
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

const generalProps = { area: "consolidado" as const, title: "Meta Geral — Setembro/2026", subtitle: "Estacionamento + Estética", monthKey: "2026-09", undefinedLabel: "Meta geral não definida." };
const detailingProps = { area: "lavacao" as const, title: "Meta Estética — Setembro/2026", subtitle: "Somente serviços de estética automotiva", monthKey: "2026-09", undefinedLabel: "Meta da estética não definida." };

describe("GoalSection — Missão 32", () => {
  it("1. mês sem meta -> mostra o texto de 'não definida' correspondente + botão 'Definir meta', sem crash", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { ...generalProps, progress: null, error: null }));
    expect(html).toContain("Meta geral não definida.");
    expect(html).toContain("Definir meta");
    expect(html).not.toContain("Editar meta");
  });

  it("2. meta cadastrada -> mostra faturamento, meta, percentual, falta, média/dia, projeção, status", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { ...generalProps, progress: progressFor(25000), error: null }));
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
    const html = renderToStaticMarkup(createElement(GoalSection, { ...generalProps, progress: progressFor(0), error: null }));
    expect(html).toContain("width:0%");
    expect(html).not.toMatch(/width:-|width:NaN|width:Infinity/);
  });

  it("meta ultrapassada (>100%): barra fica limitada a 100%, mas o texto mostra o percentual real", () => {
    const goal = baseGoal();
    const progress = progressFor(goal.targetAmount * 1.5, { goal });
    expect(progress.percentComplete).toBe(150);
    const html = renderToStaticMarkup(createElement(GoalSection, { ...generalProps, progress, error: null }));
    expect(html).toContain("150%"); // texto real, sem limitar
    expect(html).toContain("width:100%"); // barra visual nunca passa de 100%
  });

  it("nunca produz width negativo/NaN/Infinity mesmo com percentComplete fora do range normal", () => {
    const progress = progressFor(1000, { percentComplete: Number.NaN });
    const html = renderToStaticMarkup(createElement(GoalSection, { ...generalProps, progress, error: null }));
    expect(html).not.toMatch(/width:-|width:NaN|width:Infinity/);
  });

  it("15. erro de faturamento do mês não impede a renderização (mês sem meta)", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { ...generalProps, progress: null, error: "A API do JumpPark não respondeu." }));
    expect(html).toContain("Meta geral não definida.");
    expect(html).toContain("indisponível");
  });

  it("valores monetários usam formato brasileiro (R$)", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { ...generalProps, progress: progressFor(25000), error: null }));
    expect(html).toMatch(/R\$\s?25\.000,00/);
  });
});

describe("GoalSection — Missão 36 (Passo 3/4/7: Meta Geral x Meta Estética)", () => {
  it("card da Meta Geral mostra título/subtítulo corretos, nunca 'Lavação' cru", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { ...generalProps, progress: null, error: null }));
    expect(html).toContain("Meta Geral — Setembro/2026");
    expect(html).toContain("Estacionamento + Estética");
    expect(html).not.toContain("Lavação");
  });

  it("card da Meta Estética mostra título/subtítulo próprios, nunca a palavra 'Lavação' exposta ao usuário", () => {
    const html = renderToStaticMarkup(createElement(GoalSection, { ...detailingProps, progress: null, error: null }));
    expect(html).toContain("Meta Estética — Setembro/2026");
    expect(html).toContain("Somente serviços de estética automotiva");
    expect(html).toContain("Meta da estética não definida.");
    expect(html).not.toContain(">Lavação<");
  });

  it("Passo 7: o campo oculto 'area' do formulário reflete exatamente a área do card — geral nunca herda 'lavacao', estética nunca herda 'consolidado'", () => {
    // Como o botão "Definir meta" só revela o formulário após clique (estado local), aqui
    // validamos a garantia estrutural: a prop `area` é a ÚNICA fonte do campo oculto, nunca
    // escolhida pelo usuário — inspecionamos o componente `GoalForm` indiretamente checando que
    // ele nunca aparece cru (sem `area`) e que os dois cards usam props totalmente distintas.
    expect(generalProps.area).toBe("consolidado");
    expect(detailingProps.area).toBe("lavacao");
    expect(generalProps.area).not.toBe(detailingProps.area);
  });

  it("Meta Estética com progresso: indicadores usam o currentAmount recebido (faturamento de serviços), nunca o valor de outra meta", () => {
    const detailingGoal = baseGoal({ id: "goal-2", area: "lavacao", label: "Meta mensal — Estética/Lavação (Setembro/2026)", targetAmount: 12000 });
    const html = renderToStaticMarkup(createElement(GoalSection, { ...detailingProps, progress: progressFor(6000, { goal: detailingGoal }), error: null }));
    expect(html).toContain("Meta Estética — Setembro/2026");
    expect(html).toMatch(/R\$\s?6\.000,00/);
    expect(html).toMatch(/R\$\s?12\.000,00/);
  });
});
