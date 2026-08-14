import { beforeEach, describe, expect, it } from "vitest";
import { confirmReconciliationAsReceivable } from "@/lib/integrations/stone/persistence/receivableFromMatch";
import { getStonePersistenceRepository, resetStonePersistenceRepositoryForTests } from "@/lib/integrations/stone/persistence/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";
import type { StoneNormalizedTransactionRecord, StoneReconciliationResultRecord } from "@/lib/integrations/stone/persistence/types";

/** Missão Financeiro V2 (Prioridade 1) — nunca cria/baixa recebível sem confirmação humana explícita nem duplica ao reprocessar. */

function baseTransaction(overrides: Partial<StoneNormalizedTransactionRecord> = {}): StoneNormalizedTransactionRecord {
  return {
    externalKey: "tx-1",
    acquirerTransactionKey: "acq-1",
    authorizationCode: "AUTH1",
    initiatorTransactionKey: null,
    establishmentCode: "EST1",
    terminalSerialNumber: "TERM1",
    capturedAt: "2026-07-10T12:00:00.000Z",
    installmentNumber: 1,
    grossAmount: 100,
    feeAmount: 3,
    netAmount: 97,
    paymentMethod: "credito",
    brandId: "visa",
    eventType: "sale",
    receivableState: "scheduled",
    expectedPaymentDate: "2026-08-09",
    settledPaymentDate: null,
    settledAmount: null,
    sourceFile: "test",
    importRunId: null,
    ...overrides,
  };
}

function baseMatch(overrides: Partial<StoneReconciliationResultRecord> = {}): StoneReconciliationResultRecord {
  return {
    naturalKey: "probable_match:tx-1:order-1",
    stoneSaleExternalKey: "tx-1",
    jumpparkOrderExternalId: "order-1",
    matchType: "probable_match",
    confidence: "high",
    heuristicScore: 0.9,
    favorableSignals: ["valor", "horário"],
    contrarySignals: [],
    ruleApplied: "pontuacao_combinada",
    periodFrom: "2026-07-10",
    periodTo: "2026-07-10",
    ...overrides,
  };
}

async function seedMatch(matchOverrides: Partial<StoneReconciliationResultRecord> = {}, txOverrides: Partial<StoneNormalizedTransactionRecord> = {}) {
  const stoneRepo = getStonePersistenceRepository();
  await stoneRepo.upsertNormalizedTransactions([baseTransaction(txOverrides)]);
  await stoneRepo.upsertReconciliationResults([baseMatch(matchOverrides)]);
  const [row] = await stoneRepo.listReconciliationResults("2026-07-10", "2026-07-10");
  return row;
}

describe("confirmReconciliationAsReceivable", () => {
  beforeEach(() => {
    resetStonePersistenceRepositoryForTests();
    resetFinanceRepositoryForTests();
  });

  it("probable_match de alta confiança confirmado manualmente cria recebível em aberto (Stone ainda não liquidou)", async () => {
    const match = await seedMatch();
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    expect(result.status).toBe("created");
    expect(result.settled).toBe(false);

    const receivable = await getFinanceRepository().getAccountsReceivable(result.accountsReceivableId!);
    expect(receivable?.expectedAmount).toBe(100);
    expect(receivable?.status).toBe("open");
    expect(receivable?.financialAccountId).toBe("conta-stone");
    expect(receivable?.paymentMethod).toBe("credito");
  });

  it("quando a Stone já reporta liquidação real, cria o recebível E registra a baixa (payment + cash_movement) sem redigitação", async () => {
    const match = await seedMatch({}, { receivableState: "settled_on_time", settledPaymentDate: "2026-08-09", settledAmount: 97 });
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    expect(result.status).toBe("created");
    expect(result.settled).toBe(true);

    const receivable = await getFinanceRepository().getAccountsReceivable(result.accountsReceivableId!);
    expect(receivable?.status).toBe("paid");
    expect(receivable?.receivedAmount).toBe(100);
    expect(receivable?.feeAmount).toBe(3);

    // recordReceivablePayment já cria a baixa (payments/settlement) atomicamente — reaproveitado,
    // não recriado; a criação de cash_movements real é responsabilidade do PostgresFinanceRepository
    // (verificado por leitura de código) — o repositório em memória usado neste teste não a espelha.
    const settlements = await getFinanceRepository().listReceivableSettlements(result.accountsReceivableId!);
    expect(settlements).toHaveLength(1);
    expect(settlements[0].amount).toBe(100);
    expect(settlements[0].financialAccountId).toBe("conta-stone");
  });

  it("exact_match também é elegível (mesma regra de confirmação humana explícita)", async () => {
    const match = await seedMatch({ matchType: "exact_match", naturalKey: "exact_match:tx-1:order-1" });
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    expect(result.status).toBe("created");
  });

  it("REVIEW/ambiguous nunca vira recebível, mesmo com confirmação explícita", async () => {
    const match = await seedMatch({ matchType: "ambiguous", confidence: "low", naturalKey: "ambiguous:tx-1:order-1" });
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    expect(result.status).toBe("not_eligible");
    expect(result.accountsReceivableId).toBeNull();
  });

  it("unmatched_jumppark (sem venda Stone vinculada) nunca vira recebível", async () => {
    const match = await seedMatch({ matchType: "unmatched_jumppark", stoneSaleExternalKey: null, naturalKey: "unmatched_jumppark:none:order-1" });
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    expect(result.status).toBe("not_eligible");
  });

  it("duplicate nunca vira recebível", async () => {
    const match = await seedMatch({ matchType: "duplicate", confidence: "medium", naturalKey: "duplicate:tx-1:order-1" });
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    expect(result.status).toBe("not_eligible");
  });

  it("transação Stone cancelada/estornada/chargeback nunca vira recebível mesmo com match probable_match", async () => {
    const match = await seedMatch({}, { receivableState: "chargeback" });
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    expect(result.status).toBe("not_eligible");
    expect(result.reason).toContain("chargeback");
  });

  it("idempotente: confirmar a mesma conciliação duas vezes nunca cria um segundo recebível", async () => {
    const match = await seedMatch();
    const first = await confirmReconciliationAsReceivable(match.id, "Robério");
    const second = await confirmReconciliationAsReceivable(match.id, "Robério");
    expect(first.status).toBe("created");
    expect(second.status).toBe("already_exists");
    expect(second.accountsReceivableId).toBe(first.accountsReceivableId);

    const all = await getFinanceRepository().listAccountsReceivable();
    expect(all.filter((r) => r.id === first.accountsReceivableId)).toHaveLength(1);
  });

  it("exige responsável informado — nunca confirma sem saber quem confirmou", async () => {
    const match = await seedMatch();
    const result = await confirmReconciliationAsReceivable(match.id, "  ");
    expect(result.status).toBe("not_eligible");
  });

  it("resultado de conciliação inexistente nunca lança, retorna not_eligible", async () => {
    const result = await confirmReconciliationAsReceivable("id-inexistente", "Robério");
    expect(result.status).toBe("not_eligible");
  });

  it("parcelamento: número da parcela aparece na descrição do recebível quando > 1", async () => {
    const match = await seedMatch({ naturalKey: "probable_match:tx-2:order-1", stoneSaleExternalKey: "tx-2" }, { externalKey: "tx-2", installmentNumber: 2 });
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    const receivable = await getFinanceRepository().getAccountsReceivable(result.accountsReceivableId!);
    expect(receivable?.description).toContain("parcela 2");
  });

  it("Pix Stone (quando existir na Stone) é registrado com o método real, nunca forçado para crédito/débito", async () => {
    const match = await seedMatch({}, { paymentMethod: "pix" });
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    const receivable = await getFinanceRepository().getAccountsReceivable(result.accountsReceivableId!);
    expect(receivable?.paymentMethod).toBe("pix");
  });

  it("forma de pagamento desconhecida da Stone nunca é inventada — cai em 'desconhecido'", async () => {
    const match = await seedMatch({}, { paymentMethod: "voucher_desconhecido" });
    const result = await confirmReconciliationAsReceivable(match.id, "Robério");
    const receivable = await getFinanceRepository().getAccountsReceivable(result.accountsReceivableId!);
    expect(receivable?.paymentMethod).toBe("desconhecido");
  });
});
