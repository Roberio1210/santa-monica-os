import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { confirmGroup } from "@/lib/finance/bankStatement/batchActionsService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";
import { resolveClassification } from "@/lib/finance/dre";

/**
 * Missão Financeiro V2.7 — fecha as 8 últimas decisões gerenciais desta rodada de investigação:
 * devoluções de empréstimo TES Training, Jorge Cauã confirmado nas 2 linhas Rodrigues, reposição
 * de caixa do Ismael, Leonardo Azambuja como cliente (não freelancer) numa transação específica, e
 * a correção do CONFLICT SulAmérica/Seguro Saúde.
 */
const STONE_ACCOUNT_ID = "conta-stone";

async function seed(csv: string) {
  await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
  return getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
}

beforeEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
});
afterEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
});

describe("TES Training — devolução de empréstimo de parte relacionada", () => {
  it("nunca despesa operacional; fora do DRE; nature permanece null", async () => {
    const lines = await seed(
      ["data,descricao,valor,tipo", '2026-03-02,Transferência | Pix / TES TRAINING LTDA,"450,00",saida', '2026-03-06,Transferência | Pix / TES TRAINING LTDA,"2550,00",saida'].join("\n"),
    );
    for (const line of lines) {
      await confirmGroup({ lineIds: [line.id], resultingType: "pix_enviado", performedBy: "Gestor", notes: "DEVOLUÇÃO DE EMPRÉSTIMO DE PARTE RELACIONADA — TES Training." }, STONE_ACCOUNT_ID);
    }
    const movements = await getFinanceRepository().listCashMovements();
    const tesMovements = movements.filter((m) => m.amount === 450 || m.amount === 2550);
    expect(tesMovements).toHaveLength(2);
    expect(tesMovements.every((m) => m.nature !== "despesa")).toBe(true);
    expect(tesMovements.every((m) => m.nature === null)).toBe(true);
    expect(tesMovements.every((m) => m.categoryId === null)).toBe(true);

    const dre = resolveClassification({ description: "devolução empréstimo TES Training", categoryName: null, supplierId: null, partnerId: null }, undefined, []);
    expect(dre.includeInDre).toBe(false);
  });

  it("ausência de entrada correspondente no extrato Stone não bloqueia a classificação confirmada pelo gestor", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-02,Transferência | Pix / TES TRAINING LTDA,"450,00",saida'].join("\n"));
    const result = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pix_enviado", performedBy: "Gestor", notes: "Devolução confirmada mesmo sem entrada Stone visível." }, STONE_ACCOUNT_ID);
    expect(result.processedLineIds).toHaveLength(1);
  });
});

describe("Jorge Caua de Moraes Rodrigues — confirmado nas duas linhas 'RODRIGUES'", () => {
  it("classificado como prestador/freelancer, nunca atribuído a Josué", async () => {
    const lines = await seed(["data,descricao,valor,tipo", '2026-07-25,RODRIGUES / Transferência | Pix,"270,00",saida', '2026-08-01,RODRIGUES / Transferência | Pix,"870,00",saida'].join("\n"));
    for (const line of lines) {
      await confirmGroup({ lineIds: [line.id], resultingType: "pagamento", categoryId: "despesa-prestadores-pj", performedBy: "Gestor", notes: "Jorge Caua de Moraes Rodrigues — freelance." }, STONE_ACCOUNT_ID);
    }
    const movements = await getFinanceRepository().listCashMovements();
    const jorgeMovements = movements.filter((m) => m.amount === 270 || m.amount === 870);
    expect(jorgeMovements).toHaveLength(2);
    expect(jorgeMovements.every((m) => m.categoryId === "despesa-prestadores-pj")).toBe(true);
    expect(jorgeMovements.every((m) => m.notes?.includes("Jorge Caua"))).toBe(true);
  });
});

describe("Ismael — R$10 reposição de caixa (nunca receita)", () => {
  it("nature permanece null, nunca faturamento", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-02,Transferência | Pix / Ismael Machado Bonato,"10,00",entrada'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pix_recebido", performedBy: "Gestor", notes: "REPOSIÇÃO DE CAIXA — Ismael devolveu valor retirado do caixa." }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 10 && m.description.includes("Ismael"))!;
    expect(movement.nature).not.toBe("receita");
    expect(movement.nature).toBeNull();
  });
});

describe("Ismael — R$1.080 continua REVIEW (gestor não reconheceu)", () => {
  it("nunca classificado sem evidência; reconciliationNote registra a consulta ao gestor", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-13,Transferência | Pix / Ismael Machado Bonato,"1080,00",entrada'].join("\n"));
    const bankRepo = getBankStatementRepository();
    await bankRepo.updateLine({ id: lines[0].id, reconciliationNote: "Gestor consultado em 15/08/2026 e não reconheceu a origem/motivo da transferência de R$1.080 recebida de Ismael Machado Bonato." });
    const updated = await bankRepo.getLine(lines[0].id);
    expect(updated?.status).toBe("a_classificar");
    expect(updated?.categoryId).toBeNull();
    expect(updated?.linkedCashMovementId).toBeNull();
    expect(updated?.reconciliationNote).toContain("não reconheceu");
  });
});

describe("Leonardo Azambuja Bruno — cliente numa transação, freelancer histórico em outras (papel depende da transação)", () => {
  it("R$250+R$100 tratados como recebimento de cliente não conciliado, nunca receita nova sem lastro operacional", async () => {
    const lines = await seed(
      ["data,descricao,valor,tipo", '2026-05-14,LEONARDO     AZAMBUJA BRUNO / Transferência | Pix,"250,00",entrada', '2026-05-14,LEONARDO     AZAMBUJA BRUNO / Transferência | Pix,"100,00",entrada'].join(
        "\n",
      ),
    );
    for (const line of lines) {
      await confirmGroup(
        { lineIds: [line.id], resultingType: "pix_recebido", performedBy: "Gestor", notes: "Leonardo atuou como CLIENTE nesta transação — pagamento em duas parcelas, sem OS correspondente no JumpPark." },
        STONE_ACCOUNT_ID,
      );
    }
    const movements = await getFinanceRepository().listCashMovements();
    const leoMovements = movements.filter((m) => m.amount === 250 || m.amount === 100);
    expect(leoMovements).toHaveLength(2);
    expect(leoMovements.reduce((s, m) => s + m.amount, 0)).toBe(350);
    // conciliar recebimento != criar receita nova: nature nunca "receita" sem OS/registro correspondente
    expect(leoMovements.every((m) => m.nature !== "receita")).toBe(true);
  });

  it("nenhuma regra global 'Leonardo Azambuja = cliente' nem '= freelancer' é criada — natureza depende da transação", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-14,LEONARDO     AZAMBUJA BRUNO / Transferência | Pix,"250,00",entrada'].join("\n"));
    const result = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pix_recebido", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(result.createdRuleId).toBeNull();
    const rules = await getBankStatementRepository().listClassificationRules(true);
    expect(rules.some((r) => r.criteriaCounterpartyPattern?.includes("AZAMBUJA"))).toBe(false);
  });
});

describe("SulAmérica/Seguro Saúde — pagamento complementar em atraso não gera CONFLICT nem dupla despesa", () => {
  it("classificado como plano de saúde, reconciliationNote explica a ausência de evidência de beneficiário", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-18,SEGURO SAUDE / SEGURO SAUDE / Pagamento / SUL AMERICA COMPANHIA DE,"140,24",saida'].join("\n"));
    const bankRepo = getBankStatementRepository();
    await confirmGroup(
      {
        lineIds: [lines[0].id],
        resultingType: "pagamento",
        categoryId: "despesa-outras-despesas",
        performedBy: "Gestor",
        notes: "Gestor confirmou que, quando o plano é pago em atraso, são emitidos dois boletos, sendo normalmente um de menor valor. Este lançamento corresponde ao pagamento complementar relacionado ao atraso.",
      },
      STONE_ACCOUNT_ID,
    );
    await bankRepo.updateLine({
      id: lines[0].id,
      reconciliationNote:
        "Gestor confirmou que, quando o plano é pago em atraso, são emitidos dois boletos, sendo normalmente um de menor valor. Este lançamento corresponde ao pagamento complementar relacionado ao atraso. Não há evidência suficiente nesta linha para distinguir beneficiários.",
    });
    const updated = await bankRepo.getLine(lines[0].id);
    expect(updated?.status).toBe("conciliado");
    expect(updated?.categoryId).toBe("despesa-outras-despesas");
    expect(updated?.reconciliationNote).toContain("dois boletos");

    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 140.24)!;
    expect(movement.nature).not.toBe("despesa"); // categoria fora_dre já carrega a natureza
    expect(movement.categoryId).toBe("despesa-outras-despesas");
  });
});

describe("idempotência — nenhuma das classificações desta missão duplica movimento", () => {
  it("reprocessar uma linha já confirmada falha graciosamente", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-02,Transferência | Pix / TES TRAINING LTDA,"450,00",saida'].join("\n"));
    const first = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pix_enviado", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(first.processedLineIds).toHaveLength(1);
    const second = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pix_enviado", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(second.processedLineIds).toHaveLength(0);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.filter((m) => m.amount === 450)).toHaveLength(1);
  });
});
