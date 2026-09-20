import { describe, expect, it } from "vitest";
import { computeCollaboratorEarnings, computeMonthlyEarnings, buildMonthWindows, type EarningsPaymentInput, type EarningsAdvanceInput } from "@/lib/hr/earnings";

/**
 * Fase 6 do Departamento Pessoal, Parte B (20/09/2026) — testes puros e determinísticos do Resumo
 * de Ganhos. Nunca usa `new Date()`/`Date.now()` direto: todas as datas são fixas (2026-xx-xx), o
 * mesmo raciocínio de `costSummary.test.ts`/`advances.test.ts`.
 */

function payment(overrides: Partial<EarningsPaymentInput> & Pick<EarningsPaymentInput, "id" | "category" | "amount" | "date">): EarningsPaymentInput {
  return { competenceDate: null, description: "pagamento de teste", ...overrides };
}

function advance(overrides: Partial<EarningsAdvanceInput> & Pick<EarningsAdvanceInput, "id" | "amount" | "date">): EarningsAdvanceInput {
  return { reason: null, status: "aberto", ...overrides };
}

describe("computeCollaboratorEarnings — Fase 6, Parte B (20/09/2026)", () => {
  it("1) cada balde de pagamento soma só a sua própria categoria, nunca misturado", () => {
    const payments: EarningsPaymentInput[] = [
      payment({ id: "p1", category: "salario_fixo", amount: 1500, date: "2026-09-05" }),
      payment({ id: "p2", category: "comissao", amount: 200, date: "2026-09-06" }),
      payment({ id: "p3", category: "bonus", amount: 50, date: "2026-09-07" }),
      payment({ id: "p4", category: "beneficio_auxilio", amount: 450, date: "2026-09-08" }),
      payment({ id: "p5", category: "outro", amount: 30, date: "2026-09-09" }),
    ];
    const s = computeCollaboratorEarnings(payments, [], { from: "2026-09-01", to: "2026-09-30" });
    expect(s.salaryTotal).toBe(1500);
    expect(s.commissionTotal).toBe(200);
    expect(s.bonusOrGoalTotal).toBe(50);
    expect(s.benefitsTotal).toBe(450);
    expect(s.otherTotal).toBe(30);
  });

  it("2) categorias residuais (diaria_freelancer/reembolso/desconto/rescisao/ferias/decimo_terceiro/encargo) caem todas em 'Outros'", () => {
    const payments: EarningsPaymentInput[] = [
      payment({ id: "p1", category: "diaria_freelancer", amount: 10, date: "2026-09-01" }),
      payment({ id: "p2", category: "reembolso", amount: 10, date: "2026-09-01" }),
      payment({ id: "p3", category: "desconto_compensacao", amount: 10, date: "2026-09-01" }),
      payment({ id: "p4", category: "rescisao", amount: 10, date: "2026-09-01" }),
      payment({ id: "p5", category: "ferias", amount: 10, date: "2026-09-01" }),
      payment({ id: "p6", category: "decimo_terceiro", amount: 10, date: "2026-09-01" }),
      payment({ id: "p7", category: "encargo", amount: 10, date: "2026-09-01" }),
    ];
    const s = computeCollaboratorEarnings(payments, [], { from: "2026-09-01", to: "2026-09-30" });
    expect(s.otherTotal).toBe(70);
    expect(s.paymentsTotal).toBe(70);
  });

  it("3) paymentsTotal é a soma exata dos 5 baldes, nunca inclui adiantamentos", () => {
    const payments: EarningsPaymentInput[] = [
      payment({ id: "p1", category: "salario_fixo", amount: 2600, date: "2026-09-05" }),
      payment({ id: "p2", category: "comissao", amount: 300, date: "2026-09-05" }),
    ];
    const advances: EarningsAdvanceInput[] = [advance({ id: "a1", amount: 100, date: "2026-09-05" })];
    const s = computeCollaboratorEarnings(payments, advances, { from: "2026-09-01", to: "2026-09-30" });
    expect(s.paymentsTotal).toBe(2900);
    expect(s.advancesTotal).toBe(100);
    expect(s.paymentsTotal).not.toBe(3000); // nunca soma o adiantamento aqui dentro
  });

  it("4) um employee_payment legado com category='adiantamento' nunca entra nos 5 baldes nem no advancesTotal", () => {
    const payments: EarningsPaymentInput[] = [
      payment({ id: "p1", category: "salario_fixo", amount: 1000, date: "2026-09-05" }),
      payment({ id: "p2", category: "adiantamento", amount: 100, date: "2026-09-05", description: "adiantamento legado (pré-Fase 4)" }),
    ];
    const s = computeCollaboratorEarnings(payments, [], { from: "2026-09-01", to: "2026-09-30" });
    expect(s.paymentsTotal).toBe(1000); // o R$100 legado não contamina nenhum dos 5 baldes
    expect(s.advancesTotal).toBe(0); // nem é somado como se fosse employee_advances
    const legacyItem = s.items.find((i) => i.id === "p2");
    expect(legacyItem?.kind).toBe("pagamento"); // continua sendo um employee_payment, nunca reclassificado
    expect(legacyItem?.category).toBe("adiantamento"); // aparece na tabela de detalhes com a categoria correta
  });

  it("5) advancesTotal nunca é somado silenciosamente ao paymentsTotal — outflowTotal é a métrica separada", () => {
    const payments: EarningsPaymentInput[] = [payment({ id: "p1", category: "salario_fixo", amount: 1000, date: "2026-09-05" })];
    const advances: EarningsAdvanceInput[] = [advance({ id: "a1", amount: 250, date: "2026-09-06" })];
    const s = computeCollaboratorEarnings(payments, advances, { from: "2026-09-01", to: "2026-09-30" });
    expect(s.paymentsTotal).toBe(1000);
    expect(s.advancesTotal).toBe(250);
    expect(s.outflowTotal).toBe(1250);
  });

  it("6) filtro de período exclui pagamentos e adiantamentos fora do intervalo (limites inclusivos)", () => {
    const payments: EarningsPaymentInput[] = [
      payment({ id: "p1", category: "salario_fixo", amount: 100, date: "2026-08-31" }), // fora (antes)
      payment({ id: "p2", category: "salario_fixo", amount: 200, date: "2026-09-01" }), // dentro (limite inicial)
      payment({ id: "p3", category: "salario_fixo", amount: 300, date: "2026-09-30" }), // dentro (limite final)
      payment({ id: "p4", category: "salario_fixo", amount: 400, date: "2026-10-01" }), // fora (depois)
    ];
    const advances: EarningsAdvanceInput[] = [
      advance({ id: "a1", amount: 50, date: "2026-08-31" }), // fora
      advance({ id: "a2", amount: 60, date: "2026-09-15" }), // dentro
    ];
    const s = computeCollaboratorEarnings(payments, advances, { from: "2026-09-01", to: "2026-09-30" });
    expect(s.paymentsTotal).toBe(500); // só p2 + p3
    expect(s.advancesTotal).toBe(60); // só a2
    expect(s.items).toHaveLength(3);
  });

  it("7) filtro de categoria restringe só a tabela de detalhes — os totais/cards continuam refletindo o período inteiro", () => {
    const payments: EarningsPaymentInput[] = [
      payment({ id: "p1", category: "salario_fixo", amount: 1000, date: "2026-09-05" }),
      payment({ id: "p2", category: "comissao", amount: 200, date: "2026-09-06" }),
    ];
    const advances: EarningsAdvanceInput[] = [advance({ id: "a1", amount: 50, date: "2026-09-07" })];
    const withFilter = computeCollaboratorEarnings(payments, advances, { from: "2026-09-01", to: "2026-09-30" }, "comissao");
    expect(withFilter.items).toHaveLength(1);
    expect(withFilter.items[0]!.id).toBe("p2");
    // cards nunca mudam com o filtro de categoria — continuam somando tudo do período
    expect(withFilter.salaryTotal).toBe(1000);
    expect(withFilter.commissionTotal).toBe(200);
    expect(withFilter.advancesTotal).toBe(50);
  });

  it("8) filtro de categoria 'adiantamento' mostra só os adiantamentos na tabela de detalhes", () => {
    const payments: EarningsPaymentInput[] = [payment({ id: "p1", category: "salario_fixo", amount: 1000, date: "2026-09-05" })];
    const advances: EarningsAdvanceInput[] = [advance({ id: "a1", amount: 50, date: "2026-09-07" })];
    const s = computeCollaboratorEarnings(payments, advances, { from: "2026-09-01", to: "2026-09-30" }, "adiantamento");
    expect(s.items).toHaveLength(1);
    expect(s.items[0]!.kind).toBe("adiantamento");
  });

  it("9) tabela de detalhes vem ordenada da mais recente para a mais antiga", () => {
    const payments: EarningsPaymentInput[] = [
      payment({ id: "p1", category: "salario_fixo", amount: 100, date: "2026-09-05" }),
      payment({ id: "p2", category: "salario_fixo", amount: 100, date: "2026-09-20" }),
    ];
    const advances: EarningsAdvanceInput[] = [advance({ id: "a1", amount: 50, date: "2026-09-10" })];
    const s = computeCollaboratorEarnings(payments, advances, { from: "2026-09-01", to: "2026-09-30" });
    expect(s.items.map((i) => i.id)).toEqual(["p2", "a1", "p1"]);
  });

  it("10) status do adiantamento (aberto/parcialmente_compensado/compensado) aparece no item; pagamento nunca tem status", () => {
    const payments: EarningsPaymentInput[] = [payment({ id: "p1", category: "salario_fixo", amount: 100, date: "2026-09-05" })];
    const advances: EarningsAdvanceInput[] = [advance({ id: "a1", amount: 50, date: "2026-09-06", status: "parcialmente_compensado" })];
    const s = computeCollaboratorEarnings(payments, advances, { from: "2026-09-01", to: "2026-09-30" });
    const paymentItem = s.items.find((i) => i.id === "p1")!;
    const advanceItem = s.items.find((i) => i.id === "a1")!;
    expect(paymentItem.status).toBeNull();
    expect(advanceItem.status).toBe("parcialmente_compensado");
  });

  it("11) competência do pagamento aparece no item; adiantamento nunca tem competência", () => {
    const payments: EarningsPaymentInput[] = [payment({ id: "p1", category: "comissao", amount: 100, date: "2026-08-10", competenceDate: "2026-07-01" })];
    const advances: EarningsAdvanceInput[] = [advance({ id: "a1", amount: 50, date: "2026-08-10" })];
    const s = computeCollaboratorEarnings(payments, advances, { from: "2026-08-01", to: "2026-08-31" });
    expect(s.items.find((i) => i.id === "p1")!.competenceDate).toBe("2026-07-01");
    expect(s.items.find((i) => i.id === "a1")!.competenceDate).toBeNull();
  });

  it("12) valores em string (numeric do Postgres) são normalizados para number corretamente", () => {
    const payments: EarningsPaymentInput[] = [payment({ id: "p1", category: "salario_fixo", amount: "1500.50", date: "2026-09-05" })];
    const advances: EarningsAdvanceInput[] = [advance({ id: "a1", amount: "99.90", date: "2026-09-06" })];
    const s = computeCollaboratorEarnings(payments, advances, { from: "2026-09-01", to: "2026-09-30" });
    expect(s.salaryTotal).toBe(1500.5);
    expect(s.advancesTotal).toBe(99.9);
  });

  it("13) período sem nenhum lançamento retorna todos os totais zerados e items vazio", () => {
    const s = computeCollaboratorEarnings([], [], { from: "2026-09-01", to: "2026-09-30" });
    expect(s.paymentsTotal).toBe(0);
    expect(s.advancesTotal).toBe(0);
    expect(s.outflowTotal).toBe(0);
    expect(s.items).toEqual([]);
  });
});

describe("buildMonthWindows — Fase 6, Parte B (20/09/2026)", () => {
  it("14) gera janelas do mês mais antigo para o mais recente, terminando no mês de referência", () => {
    const windows = buildMonthWindows("2026-09-20", 3);
    expect(windows.map((w) => w.monthKey)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(windows[2]!.from).toBe("2026-09-01");
    expect(windows[2]!.to).toBe("2026-09-30");
    expect(windows[0]!.from).toBe("2026-07-01");
    expect(windows[0]!.to).toBe("2026-07-31");
  });

  it("15) atravessa virada de ano corretamente", () => {
    const windows = buildMonthWindows("2027-01-15", 2);
    expect(windows.map((w) => w.monthKey)).toEqual(["2026-12", "2027-01"]);
  });

  it("16) rótulo em português com mês/ano", () => {
    const windows = buildMonthWindows("2026-09-20", 1);
    expect(windows[0]!.label).toBe("Setembro/2026");
  });
});

describe("computeMonthlyEarnings — Fase 6, Parte B (20/09/2026)", () => {
  it("17) cada mês soma só os lançamentos daquele mês, nunca vaza para o mês vizinho", () => {
    const payments: EarningsPaymentInput[] = [
      payment({ id: "p-ago", category: "salario_fixo", amount: 1000, date: "2026-08-15" }),
      payment({ id: "p-set", category: "salario_fixo", amount: 2000, date: "2026-09-15" }),
    ];
    const advances: EarningsAdvanceInput[] = [advance({ id: "a-set", amount: 100, date: "2026-09-20" })];
    const months = buildMonthWindows("2026-09-20", 2);
    const result = computeMonthlyEarnings(payments, advances, months);

    const agosto = result.find((m) => m.monthKey === "2026-08")!;
    const setembro = result.find((m) => m.monthKey === "2026-09")!;
    expect(agosto.paymentsTotal).toBe(1000);
    expect(agosto.advancesTotal).toBe(0);
    expect(setembro.paymentsTotal).toBe(2000);
    expect(setembro.advancesTotal).toBe(100);
    expect(setembro.outflowTotal).toBe(2100);
  });

  it("18) mês sem nenhum lançamento aparece com todos os totais zerados (nunca omitido da lista)", () => {
    const months = buildMonthWindows("2026-09-20", 3);
    const result = computeMonthlyEarnings([], [], months);
    expect(result).toHaveLength(3);
    for (const m of result) {
      expect(m.paymentsTotal).toBe(0);
      expect(m.advancesTotal).toBe(0);
      expect(m.outflowTotal).toBe(0);
    }
  });
});
