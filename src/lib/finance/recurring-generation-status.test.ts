import { describe, expect, it } from "vitest";
import { computeFifthBusinessDay } from "@/lib/finance/status";
import { fetchRecurringGenerationStatus, generateAccountsPayableFromTemplate } from "@/lib/finance/service";
import { getFinanceRepository } from "@/lib/finance/repository-factory";

describe("Geração de conta fixa a partir de recorrência", () => {
  it("gera a conta com o valor e o dia de vencimento do modelo", async () => {
    const created = await generateAccountsPayableFromTemplate("recorrencia-jumppark", "2026-10-01");
    expect(created?.originalAmount).toBe(125);
    expect(created?.dueDate).toBe("2026-10-10");
    expect(created?.recurringBillTemplateId).toBe("recorrencia-jumppark");
  });

  it("calcula o vencimento a partir do dia fixo do modelo (Aluguel, dia 5)", async () => {
    const created = await generateAccountsPayableFromTemplate("recorrencia-aluguel-iptu", "2026-11-01");
    expect(created?.dueDate).toBe("2026-11-05");
  });

  it("grava nota de auditoria legível com modelo, competência e responsável", async () => {
    const created = await generateAccountsPayableFromTemplate("recorrencia-verisure", "2026-10-01", { responsibleName: "Robério" });
    expect(created?.notes).toMatch(/Verisure/);
    expect(created?.notes).toMatch(/2026-10/);
    expect(created?.notes).toMatch(/Robério/);
  });
});

describe("Recorrência de valor variável exige valor explícito", () => {
  it("nunca gera com valor zero silenciosamente — lança erro sem valor informado", async () => {
    await expect(generateAccountsPayableFromTemplate("recorrencia-agua-casan", "2026-10-01")).rejects.toThrow(/valor variável/);
  });

  it("gera normalmente quando o valor é informado explicitamente para a competência", async () => {
    const created = await generateAccountsPayableFromTemplate("recorrencia-agua-casan", "2026-10-01", {
      amountOverride: 187.32,
      documentNumber: "NF-123",
      issueDate: "2026-10-02",
    });
    expect(created?.originalAmount).toBe(187.32);
    expect(created?.documentNumber).toBe("NF-123");
  });
});

describe("Idempotência por competência", () => {
  it("gerar a mesma recorrência duas vezes na mesma competência não cria duplicata", async () => {
    const first = await generateAccountsPayableFromTemplate("recorrencia-stylus-contabilidade", "2026-10-01");
    const second = await generateAccountsPayableFromTemplate("recorrencia-stylus-contabilidade", "2026-10-01");
    expect(second?.id).toBe(first?.id);
  });

  it("competências diferentes do mesmo modelo não conflitam entre si", async () => {
    const july = await generateAccountsPayableFromTemplate("recorrencia-vivo-internet", "2026-07-01");
    const august = await generateAccountsPayableFromTemplate("recorrencia-vivo-internet", "2026-08-01");
    expect(july?.id).not.toBe(august?.id);
  });
});

describe("Status de geração (prévia, nunca grava nada)", () => {
  it("identifica quando um modelo ainda não foi gerado para a competência", async () => {
    const status = await fetchRecurringGenerationStatus("2026-12");
    const jumppark = status.find((s) => s.template.id === "recorrencia-jumppark");
    expect(jumppark?.alreadyGenerated).toBe(false);
    expect(jumppark?.existingAccountsPayableId).toBeNull();
    expect(jumppark?.dueDate).toBe("2026-12-10");
  });

  it("identifica uma conta já gerada e permite localizar o registro existente", async () => {
    const created = await generateAccountsPayableFromTemplate("recorrencia-vivo-telefonia", "2026-10-01");
    const status = await fetchRecurringGenerationStatus("2026-10");
    const item = status.find((s) => s.template.id === "recorrencia-vivo-telefonia");
    expect(item?.alreadyGenerated).toBe(true);
    expect(item?.existingAccountsPayableId).toBe(created?.id);
  });

  it("modelo de valor variável (sem dia fixo) retorna dueDate null na prévia", async () => {
    const status = await fetchRecurringGenerationStatus("2026-10");
    const energia = status.find((s) => s.template.id === "recorrencia-energia-celesc");
    expect(energia?.dueDate).toBeNull();
  });

  it("modelo com fornecedor pendente (acordo) segue identificável para geração, com dados pendentes preservados", async () => {
    const status = await fetchRecurringGenerationStatus("2026-10");
    const acordo = status.find((s) => s.template.id === "recorrencia-acordo-cartao-cheque-especial");
    expect(acordo?.template.supplierId).toBeNull();
    expect(acordo?.template.pendingData).toBe(true);
    expect(acordo?.dueDate).toBe("2026-10-20");
  });

  it("geração de recorrência com fornecedor pendente preserva pendingData na conta criada", async () => {
    const created = await generateAccountsPayableFromTemplate("recorrencia-acordo-emprestimo", "2026-10-01");
    expect(created?.supplierId).toBeNull();
    expect(created?.pendingData).toBe(true);
  });
});

describe("Auditoria da geração", () => {
  it("registra a criação da conta gerada por recorrência em audit_logs", async () => {
    const created = await generateAccountsPayableFromTemplate("recorrencia-jumppark", "2026-12-01");
    const log = await getFinanceRepository().listAuditLog("accounts_payable", created!.id);
    expect(log.some((entry) => entry.action === "create")).toBe(true);
  });
});

describe("Quinto dia útil (segunda a sexta, sem feriados)", () => {
  it("julho de 2026 (1º é quarta-feira) — 5º dia útil é 07/07", () => {
    expect(computeFifthBusinessDay("2026-07")).toBe("2026-07-07");
  });

  it("pula sábado e domingo corretamente quando o mês começa perto do fim de semana", () => {
    // agosto/2026: dia 1 é sábado — 1(sáb, pula),2(dom, pula),3(seg,1),4(ter,2),5(qua,3),6(qui,4),7(sex,5)
    expect(computeFifthBusinessDay("2026-08")).toBe("2026-08-07");
  });

  it("nunca cai em sábado ou domingo", () => {
    for (const month of ["2026-01", "2026-02", "2026-03", "2026-06", "2026-09", "2026-12"]) {
      const result = computeFifthBusinessDay(month);
      const day = new Date(`${result}T00:00:00.000Z`).getUTCDay();
      expect(day).not.toBe(0);
      expect(day).not.toBe(6);
    }
  });
});
