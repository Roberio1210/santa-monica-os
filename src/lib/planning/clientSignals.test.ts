import { describe, expect, it } from "vitest";
import { deriveClientSignals, RECORRENTE_VISIT_THRESHOLD, RETURNING_AFTER_DAYS_THRESHOLD } from "@/lib/planning/clientSignals";

function baseInput() {
  return { visitCount: 1, daysSinceLastVisit: 5, hasOpenOrder: false, hasPendingRecommendation: false, purchasedServiceNames: [] as string[] };
}

describe("deriveClientSignals", () => {
  it("cliente sem nenhum histórico correspondente não recebe nenhum sinal", () => {
    expect(deriveClientSignals(baseInput())).toEqual([]);
  });

  it("nunca calcula VIP — sinal não existe no domínio", () => {
    const ids = deriveClientSignals({ ...baseInput(), visitCount: 50 }).map((s) => s.id);
    expect(ids).not.toContain("vip");
  });

  it("primeira visita quando visitCount é zero", () => {
    const ids = deriveClientSignals({ ...baseInput(), visitCount: 0, daysSinceLastVisit: null }).map((s) => s.id);
    expect(ids).toContain("primeira_visita");
  });

  it("cliente recorrente no limiar exato", () => {
    const ids = deriveClientSignals({ ...baseInput(), visitCount: RECORRENTE_VISIT_THRESHOLD }).map((s) => s.id);
    expect(ids).toContain("recorrente");
  });

  it("abaixo do limiar, não é recorrente", () => {
    const ids = deriveClientSignals({ ...baseInput(), visitCount: RECORRENTE_VISIT_THRESHOLD - 1 }).map((s) => s.id);
    expect(ids).not.toContain("recorrente");
  });

  it("retornando após muito tempo no limiar exato", () => {
    const ids = deriveClientSignals({ ...baseInput(), daysSinceLastVisit: RETURNING_AFTER_DAYS_THRESHOLD }).map((s) => s.id);
    expect(ids).toContain("retornando");
  });

  it("daysSinceLastVisit nulo (nunca visitou) nunca gera 'retornando'", () => {
    const ids = deriveClientSignals({ ...baseInput(), visitCount: 0, daysSinceLastVisit: null }).map((s) => s.id);
    expect(ids).not.toContain("retornando");
  });

  it("serviço em andamento quando há ordem aberta", () => {
    const ids = deriveClientSignals({ ...baseInput(), hasOpenOrder: true }).map((s) => s.id);
    expect(ids).toContain("servicos_pendentes");
  });

  it("recomendação técnica pendente quando sinalizado", () => {
    const ids = deriveClientSignals({ ...baseInput(), hasPendingRecommendation: true }).map((s) => s.id);
    expect(ids).toContain("recomendacao_pendente");
  });

  it("Premium Detail só aparece com compra real do serviço", () => {
    const ids = deriveClientSignals({ ...baseInput(), purchasedServiceNames: ["Premium Detail"] }).map((s) => s.id);
    expect(ids).toContain("premium_detail");
  });

  it("vitrificação no histórico só aparece com compra real do serviço", () => {
    const ids = deriveClientSignals({ ...baseInput(), purchasedServiceNames: ["Vitrificação"] }).map((s) => s.id);
    expect(ids).toContain("vitrificacao_historico");
  });

  it("serviço não relacionado nunca ativa Premium Detail nem Vitrificação", () => {
    const ids = deriveClientSignals({ ...baseInput(), purchasedServiceNames: ["Lavagem Externa"] }).map((s) => s.id);
    expect(ids).not.toContain("premium_detail");
    expect(ids).not.toContain("vitrificacao_historico");
  });

  it("combina múltiplos sinais reais simultaneamente", () => {
    const ids = deriveClientSignals({
      visitCount: RECORRENTE_VISIT_THRESHOLD,
      daysSinceLastVisit: 10,
      hasOpenOrder: true,
      hasPendingRecommendation: true,
      purchasedServiceNames: ["Premium Detail", "Vitrificação"],
    }).map((s) => s.id);
    expect(ids.sort()).toEqual(["premium_detail", "recomendacao_pendente", "recorrente", "servicos_pendentes", "vitrificacao_historico"].sort());
  });
});
