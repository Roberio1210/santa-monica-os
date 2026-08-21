import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { attemptStoneSettlementReconciliation, correctLineType, markBankStatementLineIgnored, processBankStatementLine } from "@/lib/finance/bankStatement/lineProcessingService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";
import { getStonePersistenceRepository, resetStonePersistenceRepositoryForTests } from "@/lib/integrations/stone/persistence/repository-factory";
import type { StoneNormalizedTransactionRecord } from "@/lib/integrations/stone/persistence/types";

const STONE_ACCOUNT_ID = "conta-stone";
const AILOS_ACCOUNT_ID = "conta-ailos-credcrea";

function stoneTx(overrides: Partial<StoneNormalizedTransactionRecord> = {}): StoneNormalizedTransactionRecord {
  return {
    externalKey: "tx-1",
    acquirerTransactionKey: "acq-1",
    authorizationCode: "AUTH1",
    initiatorTransactionKey: null,
    establishmentCode: "EST1",
    terminalSerialNumber: null,
    capturedAt: "2026-08-01T12:00:00.000Z",
    installmentNumber: 1,
    grossAmount: 5000,
    feeAmount: 163.5,
    netAmount: 4836.5,
    paymentMethod: "credito",
    brandId: "1",
    eventType: "sale",
    receivableState: "settled_on_time",
    expectedPaymentDate: "2026-08-01",
    settledPaymentDate: "2026-08-01",
    settledAmount: 5000,
    mdrAmountStone: null,
    saleFeeCombined: null,
    advanceFeeAmountStone: null,
    sourceFile: "test",
    importRunId: null,
    ...overrides,
  };
}

async function seedLine(csv: string): Promise<string> {
  const result = await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
  const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
  const seeded = lines.find((l) => l.importId === result.id);
  if (!seeded) throw new Error("linha não encontrada");
  return seeded.id;
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

describe("attemptStoneSettlementReconciliation — recebimento Stone NUNCA gera receita duplicada", () => {
  it("valor bate com a liquidação Stone -> conciliado, cria cash_movement com nature=null (nunca 'receita')", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,"5000,00",entrada');
    await getStonePersistenceRepository().upsertNormalizedTransactions([stoneTx()]);

    const before = await getFinanceRepository().listAccountsReceivable();
    const updated = await attemptStoneSettlementReconciliation(lineId, STONE_ACCOUNT_ID);

    expect(updated.status).toBe("conciliado");
    expect(updated.linkedCashMovementId).not.toBeNull();

    const after = await getFinanceRepository().listAccountsReceivable();
    expect(after.length).toBe(before.length); // nenhum recebível novo criado

    const movements = await getFinanceRepository().listCashMovements();
    const created = movements.find((m) => m.id === updated.linkedCashMovementId);
    expect(created).toBeDefined();
    expect(created!.nature).toBeNull(); // nunca "receita" — evita dupla contagem na DRE
  });

  it("sem dado Stone sincronizado para a data -> não conciliado, nenhum cash_movement criado", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,"5000,00",entrada');
    const before = await getFinanceRepository().listCashMovements();

    const updated = await attemptStoneSettlementReconciliation(lineId, STONE_ACCOUNT_ID);

    expect(updated.status).toBe("nao_conciliado");
    expect(updated.linkedCashMovementId).toBeNull();
    const after = await getFinanceRepository().listCashMovements();
    expect(after.length).toBe(before.length);
  });

  it("valor diverge do total liquidado Stone -> sugerido, nunca concilia silenciosamente, nenhum cash_movement ainda", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,"9999,00",entrada');
    await getStonePersistenceRepository().upsertNormalizedTransactions([stoneTx()]);

    const updated = await attemptStoneSettlementReconciliation(lineId, STONE_ACCOUNT_ID);

    expect(updated.status).toBe("sugerido");
    expect(updated.linkedCashMovementId).toBeNull();
    expect(updated.matchedStoneDivergence).not.toBe(0);
  });

  it("chamar duas vezes na mesma linha já conciliada não cria um segundo cash_movement (idempotência)", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,"5000,00",entrada');
    await getStonePersistenceRepository().upsertNormalizedTransactions([stoneTx()]);

    const first = await attemptStoneSettlementReconciliation(lineId, STONE_ACCOUNT_ID);
    const second = await attemptStoneSettlementReconciliation(lineId, STONE_ACCOUNT_ID);

    expect(second.linkedCashMovementId).toBe(first.linkedCashMovementId);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.filter((m) => m.id === first.linkedCashMovementId)).toHaveLength(1);
  });
});

describe("processBankStatementLine — transferência/aporte/retirada nunca contam como receita/despesa", () => {
  it("transferencia_entrada cria account_transfer, NUNCA cash_movement", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-01,Transferência recebida,"1000,00",entrada');
    const before = await getFinanceRepository().listCashMovements();

    const updated = await processBankStatementLine({ lineId, resultingType: "transferencia_entrada", performedBy: "Gestor", counterAccountId: AILOS_ACCOUNT_ID }, STONE_ACCOUNT_ID);

    expect(updated.linkedAccountTransferId).not.toBeNull();
    expect(updated.linkedCashMovementId).toBeNull();
    const after = await getFinanceRepository().listCashMovements();
    expect(after.length).toBe(before.length);

    const transfers = await getFinanceRepository().listAccountTransfers();
    const created = transfers.find((t) => t.id === updated.linkedAccountTransferId);
    expect(created?.type).toBe("transferencia");
  });

  it("aporte de sócio (confirmado explicitamente) cria account_transfer tipo aporte_socios, nunca faturamento", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-01,Pix recebido - Sócio Carlos,"2000,00",entrada');

    const updated = await processBankStatementLine({ lineId, resultingType: "aporte", performedBy: "Gestor" }, STONE_ACCOUNT_ID);

    expect(updated.linkedCashMovementId).toBeNull();
    const transfers = await getFinanceRepository().listAccountTransfers();
    const created = transfers.find((t) => t.id === updated.linkedAccountTransferId);
    expect(created?.type).toBe("aporte_socios");
    expect(created?.toAccountId).toBe(STONE_ACCOUNT_ID);
  });

  it("retirada de sócio cria account_transfer tipo retirada", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-01,Pix enviado - Sócio Carlos,"500,00",saida');

    const updated = await processBankStatementLine({ lineId, resultingType: "retirada", performedBy: "Gestor" }, STONE_ACCOUNT_ID);

    const transfers = await getFinanceRepository().listAccountTransfers();
    const created = transfers.find((t) => t.id === updated.linkedAccountTransferId);
    expect(created?.type).toBe("retirada");
    expect(created?.fromAccountId).toBe(STONE_ACCOUNT_ID);
  });
});

describe("processBankStatementLine — Pix/pagamento sem correspondência segura vira cash_movement, nunca inventa cliente/fornecedor", () => {
  it("Pix de cliente desconhecido processado como pix_recebido -> cash_movement criado, nature null (cai na fila de classificação existente)", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-01,Pix recebido - desconhecido,"80,00",entrada');

    const updated = await processBankStatementLine({ lineId, resultingType: "pix_recebido", performedBy: "Gestor" }, STONE_ACCOUNT_ID);

    expect(updated.status).toBe("conciliado");
    const movements = await getFinanceRepository().listCashMovements();
    const created = movements.find((m) => m.id === updated.linkedCashMovementId);
    expect(created?.nature).toBeNull();
    expect(created?.supplierId ?? null).toBeNull();
  });

  it("tarifa vira cash_movement com nature='tarifa'", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-02,Tarifa,"12,90",saida');
    const updated = await processBankStatementLine({ lineId, resultingType: "tarifa", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.id === updated.linkedCashMovementId)?.nature).toBe("tarifa");
  });

  it("mensalidade Stone vira cash_movement classificado como tarifa (nunca confundida com MDR de venda)", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-02,Mensalidade Stone,"49,90",saida');
    const updated = await processBankStatementLine({ lineId, resultingType: "mensalidade_stone", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.id === updated.linkedCashMovementId)?.nature).toBe("tarifa");
  });

  it("devolução vira cash_movement com nature='estorno', nunca tratada como receita nova", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-02,Estorno de venda,"30,00",saida');
    const updated = await processBankStatementLine({ lineId, resultingType: "devolucao", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.id === updated.linkedCashMovementId)?.nature).toBe("estorno");
  });
});

describe("processBankStatementLine — vínculo com recebível/pagável existente usa a baixa real, nunca um cash_movement solto duplicado", () => {
  it("linha vinculada a um accounts_receivable existente chama a baixa real (recordReceivablePayment)", async () => {
    const [receivable] = await getFinanceRepository().createAccountsReceivable({
      description: "Serviço avulso — cliente Pix",
      partnerId: null,
      categoryId: "receita-lavacao",
      costCenterId: "cc-estetica-automotiva",
      competenceDate: "2026-08-01",
      dueDate: "2026-08-01",
      expectedAmount: 80,
    });

    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-01,Pix recebido - Cliente conhecido,"80,00",entrada');
    await processBankStatementLine({ lineId, resultingType: "pix_recebido", performedBy: "Gestor", linkedAccountsReceivableId: receivable.id }, STONE_ACCOUNT_ID);

    const updatedReceivable = await getFinanceRepository().getAccountsReceivable(receivable.id);
    expect(updatedReceivable?.receivedAmount).toBe(80);
    expect(updatedReceivable?.outstandingAmount).toBe(0);
  });

  it("linha vinculada a um accounts_payable existente chama a baixa real (recordPayablePayment), nunca duplica a despesa", async () => {
    const [payable] = await getFinanceRepository().createAccountsPayable({
      description: "Compra de insumos — fornecedor Pix",
      categoryId: "despesa-produtos-e-insumos",
      competenceDate: "2026-08-02",
      dueDate: "2026-08-02",
      originalAmount: 300,
    });

    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-02,Pagamento fornecedor,"300,00",saida');
    await processBankStatementLine({ lineId, resultingType: "pagamento", performedBy: "Gestor", linkedAccountsPayableId: payable.id }, STONE_ACCOUNT_ID);

    const updatedPayable = await getFinanceRepository().getAccountsPayable(payable.id);
    expect(updatedPayable?.paidAmount).toBe(300);
    expect(updatedPayable?.outstandingAmount).toBe(0);
  });
});

describe("processBankStatementLine — idempotência e integridade", () => {
  it("processar uma linha já processada lança erro, nunca cria um segundo movimento", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-02,Tarifa,"12,90",saida');
    await processBankStatementLine({ lineId, resultingType: "tarifa", performedBy: "Gestor" }, STONE_ACCOUNT_ID);

    await expect(processBankStatementLine({ lineId, resultingType: "tarifa", performedBy: "Gestor" }, STONE_ACCOUNT_ID)).rejects.toThrow(/já foi processada/i);
  });

  it("sem responsável informado, lança erro claro", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-02,Tarifa,"12,90",saida');
    await expect(processBankStatementLine({ lineId, resultingType: "tarifa", performedBy: "" }, STONE_ACCOUNT_ID)).rejects.toThrow(/informe quem/i);
  });
});

describe("markBankStatementLineIgnored — só com justificativa explícita e auditável", () => {
  it("marca como ignorado quando há justificativa", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-02,Lançamento diverso,"5,00",saida');
    const updated = await markBankStatementLineIgnored(lineId, "Ajuste técnico Stone, confirmado por telefone com suporte.", "Gestor");
    expect(updated.status).toBe("ignorado");
    expect(updated.reconciliationNote).toContain("Ajuste técnico");
  });

  it("sem justificativa, lança erro — nunca ignora silenciosamente", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-08-02,Lançamento diverso,"5,00",saida');
    await expect(markBankStatementLineIgnored(lineId, "", "Gestor")).rejects.toThrow(/justificativa/i);
  });
});

describe("correctLineType — Missão Financeiro V2.2 (Fase D/G item 7D), correção evidenciada de erro do parser/classificador", () => {
  it("corrige o tipo e reseta o status para o inicial do novo tipo, grava auditoria", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-04-16,Maestro | Débito / STYLUS CONTABILIDADE,"59,33",entrada');
    const updated = await correctLineType({
      lineId,
      correctedType: "recebimento_venda_stone",
      reason: "Linha vizinha 794 já é o pagamento real da Stylus; rótulo Maestro|Débito confirma venda Stone, nome da Stylus vazou da linha anterior.",
      performedBy: "Roberio Rocha Filho",
    });
    expect(updated.type).toBe("recebimento_venda_stone");
    expect(updated.status).toBe("nao_conciliado"); // initialStatusForType para recebimento_venda_stone

    const audit = await getFinanceRepository().listAuditLog("bank_statement_line", lineId);
    expect(audit.some((a) => a.action === "correct_line_type")).toBe(true);
  });

  it("linha corrigida para recebimento_venda_stone some do motor de classificação geral (nunca mistura com conciliação Stone)", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-04-16,Maestro | Débito / STYLUS CONTABILIDADE,"59,33",entrada');
    await correctLineType({ lineId, correctedType: "recebimento_venda_stone", reason: "Evidência de venda Stone, ver linha vizinha.", performedBy: "Gestor" });

    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    const corrected = lines.find((l) => l.id === lineId);
    expect(corrected?.type).toBe("recebimento_venda_stone");
  });

  it("sem motivo/evidência, lança erro — nunca corrige silenciosamente", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-04-16,Maestro | Débito / X,"10,00",entrada');
    await expect(correctLineType({ lineId, correctedType: "recebimento_venda_stone", reason: "", performedBy: "Gestor" })).rejects.toThrow(/evidência/i);
  });

  it("linha já processada (virou movimento real) nunca pode ser corrigida silenciosamente", async () => {
    const lineId = await seedLine('data,descricao,valor,tipo\n2026-04-16,Tarifa,"1,00",saida');
    await processBankStatementLine({ lineId, resultingType: "tarifa", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    await expect(correctLineType({ lineId, correctedType: "outro", reason: "teste", performedBy: "Gestor" })).rejects.toThrow(/já virou um movimento real/i);
  });
});
