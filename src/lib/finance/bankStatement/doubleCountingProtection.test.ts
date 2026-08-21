import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { attemptStoneSettlementReconciliation, processBankStatementLine } from "@/lib/finance/bankStatement/lineProcessingService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";
import { getStonePersistenceRepository, resetStonePersistenceRepositoryForTests } from "@/lib/integrations/stone/persistence/repository-factory";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

const STONE_ACCOUNT_ID = "conta-stone";

function stoneTx(overrides: Partial<StoneNormalizedTransactionRecord> = {}): StoneNormalizedTransactionRecord {
  return {
    externalKey: "tx-double-1",
    acquirerTransactionKey: "acq-1",
    authorizationCode: "AUTH1",
    initiatorTransactionKey: null,
    establishmentCode: "EST1",
    terminalSerialNumber: null,
    capturedAt: "2026-08-01T12:00:00.000Z",
    installmentNumber: 1,
    grossAmount: 100,
    feeAmount: 3.27,
    netAmount: 96.73,
    paymentMethod: "credito",
    brandId: "1",
    eventType: "sale",
    receivableState: "settled_on_time",
    expectedPaymentDate: "2026-08-01",
    settledPaymentDate: "2026-08-01",
    settledAmount: 96.73,
    mdrAmountStone: null,
    saleFeeCombined: null,
    advanceFeeAmountStone: null,
    sourceFile: "test",
    importRunId: null,
    ...overrides,
  };
}

async function seed(csv: string) {
  const result = await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
  return getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID }).then((lines) => lines.filter((l) => l.importId === result.id));
}

beforeEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
  resetStonePersistenceRepositoryForTests();
});
afterEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
  resetStonePersistenceRepositoryForTests();
});

describe("Fase S — proteção contra dupla contagem (JumpPark/Stone/extrato/DRE)", () => {
  it("recebimento de venda Stone conciliado NUNCA cria accounts_receivable — só confirma liquidação já reconhecida em outro lugar", async () => {
    const [line] = await seed('data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,"96,73",entrada');
    await getStonePersistenceRepository().upsertNormalizedTransactions([stoneTx()]);

    const receivablesBefore = await getFinanceRepository().listAccountsReceivable();
    await attemptStoneSettlementReconciliation(line.id, STONE_ACCOUNT_ID);
    const receivablesAfter = await getFinanceRepository().listAccountsReceivable();

    expect(receivablesAfter.length).toBe(receivablesBefore.length);
  });

  it("antecipação de crédito conciliada também NUNCA cria accounts_receivable (mesmo caminho de código, mesma garantia)", async () => {
    const [line] = await seed('data,descricao,valor,tipo\n2026-08-01,Antecipação | Crédito,"96,73",entrada');
    await getBankStatementRepository().updateLine({ id: line.id, type: "antecipacao_credito" });
    await getStonePersistenceRepository().upsertNormalizedTransactions([stoneTx()]);

    const receivablesBefore = await getFinanceRepository().listAccountsReceivable();
    const updated = await attemptStoneSettlementReconciliation(line.id, STONE_ACCOUNT_ID);
    const receivablesAfter = await getFinanceRepository().listAccountsReceivable();

    expect(updated.status).toBe("conciliado");
    expect(receivablesAfter.length).toBe(receivablesBefore.length);
  });

  it("tarifa bancária processada no mesmo dia de um recebimento Stone conciliado NUNCA duplica/soma o fee_amount já embutido na liquidação", async () => {
    const linesSeeded = await seed(
      ['data,descricao,valor,tipo', '2026-08-01,Recebimento vendas,"96,73",entrada', '2026-08-01,Tarifa,"0,14",saida'].join("\n"),
    );
    await getStonePersistenceRepository().upsertNormalizedTransactions([stoneTx()]);

    const recebimento = linesSeeded.find((l) => l.type === "recebimento_venda_stone")!;
    const tarifa = linesSeeded.find((l) => l.type === "tarifa")!;

    const recebimentoResult = await attemptStoneSettlementReconciliation(recebimento.id, STONE_ACCOUNT_ID);
    const tarifaResult = await processBankStatementLine({ lineId: tarifa.id, resultingType: "tarifa", performedBy: "Gestor" }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    const recebimentoMovement = movements.find((m) => m.id === recebimentoResult.linkedCashMovementId);
    const tarifaMovement = movements.find((m) => m.id === tarifaResult.linkedCashMovementId);

    // dois movimentos completamente independentes — o valor da liquidação nunca inclui a tarifa, e vice-versa.
    expect(recebimentoMovement?.amount).toBe(96.73);
    expect(tarifaMovement?.amount).toBe(0.14);
    expect(recebimentoMovement?.id).not.toBe(tarifaMovement?.id);
  });

  it("cash_movement de liquidação Stone nunca tem nature='receita' — fica fora da DRE por padrão até classificação humana explícita", async () => {
    const [line] = await seed('data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,"96,73",entrada');
    await getStonePersistenceRepository().upsertNormalizedTransactions([stoneTx()]);
    const updated = await attemptStoneSettlementReconciliation(line.id, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.id === updated.linkedCashMovementId);
    expect(movement?.nature).not.toBe("receita");
  });

  it("transferência/aporte/retirada nunca vira cash_movement — fica só em account_transfers, fora de receita/despesa", async () => {
    const [line] = await seed('data,descricao,valor,tipo\n2026-08-01,Pix recebido - Sócio,"2000,00",entrada');
    const before = await getFinanceRepository().listCashMovements();
    await processBankStatementLine({ lineId: line.id, resultingType: "aporte", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const after = await getFinanceRepository().listCashMovements();
    expect(after.length).toBe(before.length); // nenhum cash_movement novo
  });

  it("reprocessar a mesma linha de conciliação Stone duas vezes nunca duplica o cash_movement (idempotência específica de dupla contagem)", async () => {
    const [line] = await seed('data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,"96,73",entrada');
    await getStonePersistenceRepository().upsertNormalizedTransactions([stoneTx()]);
    const first = await attemptStoneSettlementReconciliation(line.id, STONE_ACCOUNT_ID);
    const second = await attemptStoneSettlementReconciliation(line.id, STONE_ACCOUNT_ID);
    expect(second.linkedCashMovementId).toBe(first.linkedCashMovementId);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.filter((m) => m.id === first.linkedCashMovementId)).toHaveLength(1);
  });
});
