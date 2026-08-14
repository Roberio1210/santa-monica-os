import { beforeEach, describe, expect, it } from "vitest";
import { generateIesaClosingReceivable } from "@/lib/finance/iesaClosing";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";

/** Missão Financeiro V2 (Prioridade 3) — fechamento consolidado por competência, nunca uma conta por ordem, nunca duplica o recebível histórico real. */

describe("generateIesaClosingReceivable", () => {
  beforeEach(() => resetFinanceRepositoryForTests());

  it("gera uma única conta a receber consolidada para o mês, vinculada ao parceiro/contrato IESA já cadastrados", async () => {
    const result = await generateIesaClosingReceivable("2026-07", 490, 10, "Robério");
    expect(result.status).toBe("created");

    const receivable = await getFinanceRepository().getAccountsReceivable(result.accountsReceivableId);
    expect(receivable?.expectedAmount).toBe(490);
    expect(receivable?.competenceDate).toBe("2026-07-01");
    expect(receivable?.dueDate).toBe("2026-08-10");
    expect(receivable?.partyName.toLowerCase()).toContain("iesa");
  });

  it("idempotente: gerar o mesmo mês duas vezes nunca cria uma segunda conta a receber", async () => {
    const first = await generateIesaClosingReceivable("2026-07", 490, 10, "Robério");
    const second = await generateIesaClosingReceivable("2026-07", 490, 10, "Robério");
    expect(first.status).toBe("created");
    expect(second.status).toBe("already_exists");
    expect(second.accountsReceivableId).toBe(first.accountsReceivableId);
  });

  it("nunca duplica o recebível histórico real de junho/2026 (R$ 900,00, iesa-recebivel-2026-06) — mesmo externalId, mesma linha", async () => {
    // O recebível histórico é seedado com externalId "iesa-recebivel-2026-06" (ver src/lib/finance/data/accounts-receivable.ts) —
    // gerar o fechamento do mesmo mês precisa reconhecer a linha já existente, nunca criar uma segunda.
    const before = (await getFinanceRepository().listAccountsReceivable()).length;
    const result = await generateIesaClosingReceivable("2026-06", 900, 10, "Robério");
    const after = (await getFinanceRepository().listAccountsReceivable()).length;
    expect(result.status).toBe("already_exists");
    expect(after).toBe(before);
  });
});
