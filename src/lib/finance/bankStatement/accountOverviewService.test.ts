import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchStoneAccountOverview } from "@/lib/finance/bankStatement/accountOverviewService";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";

const STONE_ACCOUNT_ID = "conta-stone";

beforeEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
});
afterEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
});

describe("fetchStoneAccountOverview — Missão Financeiro V2.1 (Fase E)", () => {
  it("sem saldo conferido manualmente, divergência é null (nunca 0 inventado)", async () => {
    const overview = await fetchStoneAccountOverview(STONE_ACCOUNT_ID, "2026-08-01", "2026-08-14");
    expect(overview.divergenceVsInformedBalance).toBeNull();
  });

  it("com saldo bancário conferido igual ao calculado, sem divergência", async () => {
    await getFinanceRepository().informAccountBalance({ financialAccountId: STONE_ACCOUNT_ID, informedBalance: 0 });
    const overview = await fetchStoneAccountOverview(STONE_ACCOUNT_ID, "2026-08-01", "2026-08-14");
    expect(overview.divergenceVsInformedBalance).toBe(0);
  });

  it("com saldo bancário conferido diferente do calculado, mostra a divergência real, nunca mascarada", async () => {
    await getFinanceRepository().informAccountBalance({ financialAccountId: STONE_ACCOUNT_ID, informedBalance: 500 });
    const overview = await fetchStoneAccountOverview(STONE_ACCOUNT_ID, "2026-08-01", "2026-08-14");
    expect(overview.divergenceVsInformedBalance).toBe(-500); // calculado (0) - informado (500)
  });

  it("retorna as linhas de extrato importadas dentro do período, filtradas por conta", async () => {
    await confirmBankStatementImport({
      financialAccountId: STONE_ACCOUNT_ID,
      fileFormat: "csv",
      filename: "extrato.csv",
      importedBy: "Gestor",
      csvContent: 'data,descricao,valor,tipo\n2026-08-05,Recebimento vendas,"1000,00",entrada',
    });
    const overview = await fetchStoneAccountOverview(STONE_ACCOUNT_ID, "2026-08-01", "2026-08-14");
    expect(overview.lines).toHaveLength(1);
    expect(overview.lines[0].amount).toBe(1000);
  });
});
