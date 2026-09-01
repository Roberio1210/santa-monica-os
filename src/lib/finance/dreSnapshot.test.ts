import { beforeEach, describe, expect, it } from "vitest";
import {
  closeAccountingPeriodWithSnapshot,
  DRE_METHODOLOGY_VERSION,
  fetchFinancialPeriodOverview,
  getOfficialClosedDre,
  resolveFinancialPeriodSourceStatus,
  verifyDreSnapshotIntegrityById,
} from "@/lib/finance/dreSnapshot";
import { computeDreSnapshotHash, verifyDreSnapshotIntegrity } from "@/lib/finance/dreSnapshotHash";
import { fetchDreReport } from "@/lib/finance/service";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";

const STONE_ACCOUNT_ID = "conta-stone";
const RESPONSIBLE = "Robério (teste)";

let custoDespesaSeeded = new Set<string>();

/**
 * `computeDreReport` segue "ausência de dado ≠ zero": resultadoLiquido só sai não-nulo quando
 * receita, custos diretos E despesas operacionais têm pelo menos 1 lançamento real cada (ver
 * `dre.ts`). Para um mês de teste fechável de verdade, semeia também um custo/despesa token — uma
 * vez por competência — usando categorias reais já existentes no seed (nunca inventadas).
 */
async function ensureCustoEDespesa(competenceMonth: string): Promise<void> {
  if (custoDespesaSeeded.has(competenceMonth)) return;
  custoDespesaSeeded.add(competenceMonth);
  const repo = getFinanceRepository();
  await repo.createCashMovement({
    date: `${competenceMonth}-05`,
    type: "saida",
    amount: 1,
    description: `Custo direto token — Fase C7 (${competenceMonth})`,
    financialAccountId: STONE_ACCOUNT_ID,
    categoryId: "despesa-produtos-e-insumos",
    competenceDate: `${competenceMonth}-05`,
  });
  await repo.createCashMovement({
    date: `${competenceMonth}-05`,
    type: "saida",
    amount: 1,
    description: `Despesa operacional token — Fase C7 (${competenceMonth})`,
    financialAccountId: STONE_ACCOUNT_ID,
    categoryId: "despesa-outras-despesas",
    competenceDate: `${competenceMonth}-05`,
  });
}

/** Cria uma receita real e classificada (nature="receita") para dar à competência um DreReport não-nulo, controlado e isolado por teste. */
async function seedReceita(competenceMonth: string, amount: number, day = "15"): Promise<string> {
  await ensureCustoEDespesa(competenceMonth);
  const repo = getFinanceRepository();
  const movement = await repo.createCashMovement({
    date: `${competenceMonth}-${day}`,
    type: "entrada",
    nature: "receita",
    amount,
    description: `Receita de teste — Fase C7 (${competenceMonth})`,
    financialAccountId: STONE_ACCOUNT_ID,
    competenceDate: `${competenceMonth}-${day}`,
  });
  return movement.id;
}

/** Lançamento sem categoria reconhecida → cai em naoClassificados (pendente), de propósito. */
async function seedUnclassified(competenceMonth: string): Promise<void> {
  const repo = getFinanceRepository();
  await repo.createCashMovement({
    date: `${competenceMonth}-10`,
    type: "saida",
    amount: 50,
    description: "Lançamento sem categoria — Fase C7 (propositalmente não classificado)",
    financialAccountId: STONE_ACCOUNT_ID,
    competenceDate: `${competenceMonth}-10`,
  });
}

describe("closeAccountingPeriodWithSnapshot — Fase C7", () => {
  beforeEach(() => {
    resetFinanceRepositoryForTests();
    custoDespesaSeeded = new Set<string>();
  });

  it("fechamento cria um snapshot (versão 1, oficial)", async () => {
    await seedReceita("2026-10", 1000);
    const { accountingPeriod, snapshot } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    expect(accountingPeriod.status).toBe("fechado");
    expect(snapshot.version).toBe(1);
    expect(snapshot.isOfficial).toBe(true);
    expect(snapshot.competenceMonth).toBe("2026-10");
    expect(snapshot.methodologyVersion).toBe(DRE_METHODOLOGY_VERSION);
  });

  it("snapshot contém o DreReport completo (não só os totais)", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    expect(snapshot.reportPayload.receitaBruta).toBe(1000);
    expect(snapshot.reportPayload.receitaBrutaOutras.items).toHaveLength(1);
    expect(snapshot.reportPayload.naoClassificados).toEqual([]);
    expect(snapshot.pendingCount).toBe(0);
    expect(snapshot.lineItemCount).toBeGreaterThan(0);
  });

  it("hash é determinístico — mesmo relatório lógico produz sempre o mesmo hash, independente da ordem de inserção das chaves", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    const hashA = computeDreSnapshotHash(snapshot.reportPayload);

    // reconstrói o mesmo objeto lógico inserindo as chaves de trás para frente (ordem de inserção
    // diferente, mesmo conteúdo) — prova que a canonicalização ordena antes de gerar o hash.
    function reverseKeyOrder(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(reverseKeyOrder);
      if (value !== null && typeof value === "object") {
        const reversedEntries = Object.entries(value as Record<string, unknown>).reverse();
        const rebuilt: Record<string, unknown> = {};
        for (const [key, val] of reversedEntries) rebuilt[key] = reverseKeyOrder(val);
        return rebuilt;
      }
      return value;
    }
    const reordered = reverseKeyOrder(JSON.parse(JSON.stringify(snapshot.reportPayload)));
    const hashB = computeDreSnapshotHash(reordered as typeof snapshot.reportPayload);

    expect(hashA).toBe(snapshot.payloadHash);
    expect(hashB).toBe(hashA);
  });

  it("verificação de hash funciona — payload intacto confere", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });
    expect(verifyDreSnapshotIntegrity(snapshot.reportPayload, snapshot.payloadHash)).toBe(true);

    const check = await verifyDreSnapshotIntegrityById("2026-10", 1);
    expect(check?.isIntact).toBe(true);
    expect(check?.recomputedHash).toBe(snapshot.payloadHash);
  });

  it("alteração do payload invalida o hash — detecta corrupção/edição posterior", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    const tampered = { ...snapshot.reportPayload, receitaBruta: 999999 };
    expect(verifyDreSnapshotIntegrity(tampered, snapshot.payloadHash)).toBe(false);
  });

  it("naoClassificados > 0 impede o fechamento — nenhum estado parcial é criado", async () => {
    await seedReceita("2026-11", 1000);
    await seedUnclassified("2026-11");

    await expect(closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-11", closedBy: RESPONSIBLE })).rejects.toThrow(/não classificado/);

    // nem o período fecha, nem um snapshot é criado — prova de "tudo ou nada" no nível observável
    const period = await getFinanceRepository().getAccountingPeriod("2026-11");
    expect(period?.status).not.toBe("fechado");
    const snapshots = await getFinanceRepository().listDreSnapshots("2026-11");
    expect(snapshots).toHaveLength(0);
  });

  it("competência sem nenhum dado real (receita/resultado indisponível) também bloqueia o fechamento", async () => {
    await expect(closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-12", closedBy: RESPONSIBLE })).rejects.toThrow(/dado suficiente/);
    expect(await getOfficialClosedDre("2026-12")).toBeNull();
  });

  it("chamada repetida de fechamento não cria um segundo snapshot silenciosamente", async () => {
    await seedReceita("2026-10", 1000);
    await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    await expect(closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE })).rejects.toThrow(/já está fechada/);

    const snapshots = await getFinanceRepository().listDreSnapshots("2026-10");
    expect(snapshots).toHaveLength(1);
  });

  it("período fechado é servido pelo snapshot oficial (getOfficialClosedDre), nunca recalculado", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    const official = await getOfficialClosedDre("2026-10");
    expect(official?.id).toBe(snapshot.id);
    expect(official?.reportPayload.receitaBruta).toBe(1000);
  });

  it("computeDreReport ao vivo continua disponível separadamente do snapshot (fetchDreReport nunca é substituído)", async () => {
    await seedReceita("2026-10", 1000);
    await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    const live = await fetchDreReport("gerencial", "2026-10-01", "2026-10-31");
    expect(live.receitaBruta).toBe(1000);
  });

  it("sincronização/lançamento posterior nas fontes NÃO altera o snapshot já fechado — só o cálculo ao vivo diverge", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot: v1 } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });
    expect(v1.reportPayload.receitaBruta).toBe(1000);

    // simula uma sincronização posterior (ex.: JumpPark/Stone trazendo dado novo para o mesmo mês já fechado)
    await seedReceita("2026-10", 300, "20");

    const stillFrozen = await getOfficialClosedDre("2026-10");
    expect(stillFrozen?.reportPayload.receitaBruta).toBe(1000); // snapshot não mudou

    const liveNow = await fetchDreReport("gerencial", "2026-10-01", "2026-10-31");
    expect(liveNow.receitaBruta).toBe(1300); // o cálculo ao vivo mudou — divergência esperada e correta
  });

  it("reabertura exige justificativa não vazia", async () => {
    await seedReceita("2026-10", 1000);
    await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    await expect(getFinanceRepository().reopenAccountingPeriod({ competenceMonth: "2026-10", reopenedBy: RESPONSIBLE, reopenJustification: "" })).rejects.toThrow(/[Jj]ustificativa/);
  });

  it("reabertura preserva o snapshot anterior intacto (nunca apaga/edita o payload) e o desmarca como não-oficial", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot: v1 } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    await getFinanceRepository().reopenAccountingPeriod({ competenceMonth: "2026-10", reopenedBy: RESPONSIBLE, reopenJustification: "Encontrado lançamento faltante" });

    const versions = await getFinanceRepository().listDreSnapshots("2026-10");
    expect(versions).toHaveLength(1);
    const v1After = versions.find((v) => v.id === v1.id)!;
    expect(v1After.isOfficial).toBe(false);
    expect(v1After.supersededAt).not.toBeNull();
    expect(v1After.reportPayload).toEqual(v1.reportPayload); // payload intacto, byte a byte
    expect(computeDreSnapshotHash(v1After.reportPayload)).toBe(v1.payloadHash); // hash ainda confere
  });

  it("novo fechamento após reabertura gera a versão seguinte — a anterior permanece histórica e consultável", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot: v1 } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });
    await getFinanceRepository().reopenAccountingPeriod({ competenceMonth: "2026-10", reopenedBy: RESPONSIBLE, reopenJustification: "Correção de lançamento" });
    await seedReceita("2026-10", 200, "22"); // a correção que motivou a reabertura

    const { snapshot: v2 } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    expect(v2.version).toBe(2);
    expect(v2.isOfficial).toBe(true);
    expect(v2.reportPayload.receitaBruta).toBe(1200);

    const versions = await getFinanceRepository().listDreSnapshots("2026-10");
    expect(versions).toHaveLength(2);
    const v1After = versions.find((v) => v.id === v1.id)!;
    expect(v1After.isOfficial).toBe(false);
    expect(v1After.reportPayload.receitaBruta).toBe(1000); // v1 continua consultável com o valor ORIGINAL, não o corrigido
  });

  it("somente uma versão é oficial por competência, mesmo depois de vários ciclos de reabertura/refechamento", async () => {
    await seedReceita("2026-10", 1000);
    await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });
    await getFinanceRepository().reopenAccountingPeriod({ competenceMonth: "2026-10", reopenedBy: RESPONSIBLE, reopenJustification: "r1" });
    await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });
    await getFinanceRepository().reopenAccountingPeriod({ competenceMonth: "2026-10", reopenedBy: RESPONSIBLE, reopenJustification: "r2" });
    await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    const versions = await getFinanceRepository().listDreSnapshots("2026-10");
    expect(versions).toHaveLength(3);
    expect(versions.filter((v) => v.isOfficial)).toHaveLength(1);
    expect(versions.find((v) => v.isOfficial)?.version).toBe(3);
  });

  it("competência correta — competenceFrom/competenceTo do payload cobrem exatamente o mês, incluindo fevereiro (28/29 dias)", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot: october } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });
    expect(october.reportPayload.competenceFrom).toBe("2026-10-01");
    expect(october.reportPayload.competenceTo).toBe("2026-10-31");

    await seedReceita("2026-02", 500);
    const { snapshot: february } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-02", closedBy: RESPONSIBLE });
    expect(february.reportPayload.competenceFrom).toBe("2026-02-01");
    expect(february.reportPayload.competenceTo).toBe("2026-02-28"); // 2026 não é bissexto
  });

  it("timestamps gravados são ISO com timezone (computedAt/closedAt válidos e coerentes)", async () => {
    await seedReceita("2026-10", 1000);
    const before = Date.now();
    const { snapshot } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });
    const after = Date.now();

    const computedAtMs = new Date(snapshot.computedAt).getTime();
    const closedAtMs = new Date(snapshot.closedAt).getTime();
    expect(computedAtMs).toBeGreaterThanOrEqual(before);
    expect(computedAtMs).toBeLessThanOrEqual(after);
    expect(closedAtMs).toBeGreaterThanOrEqual(before);
    expect(closedAtMs).toBeLessThanOrEqual(after);
  });

  it("proveniência preservada — o DreLineItem do payload aponta de volta para o cash_movement real de origem", async () => {
    const movementId = await seedReceita("2026-10", 1000);
    const { snapshot } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    const item = snapshot.reportPayload.receitaBrutaOutras.items[0];
    expect(item.sourceKind).toBe("cash_movement");
    expect(item.sourceId).toBe(movementId);
  });

  it("período fechado sem snapshot (fechamento legado, fora deste fluxo) não quebra a leitura oficial — retorna null em vez de inventar dado", async () => {
    // simula o estado ANTIGO (Fase C6): closeAccountingPeriod cru, sem passar por closeAccountingPeriodWithSnapshot
    await getFinanceRepository().closeAccountingPeriod({ competenceMonth: "2026-09", closedBy: RESPONSIBLE });

    const period = await getFinanceRepository().getAccountingPeriod("2026-09");
    expect(period?.status).toBe("fechado");
    expect(await getOfficialClosedDre("2026-09")).toBeNull(); // estado inconsistente detectável, nunca mascarado
  });
});

describe("resolveFinancialPeriodSourceStatus — parte pura, Missão UX/Navegação 2", () => {
  it("snapshot oficial sempre tem precedência sobre qualquer outro sinal, mesmo com receita disponível por outra via", () => {
    const info = resolveFinancialPeriodSourceStatus({
      competenceFrom: "2026-08-01",
      competenceTo: "2026-08-31",
      officialSnapshot: { version: 3 },
      hasRevenueData: true,
      officialSnapshotMonthsInRange: ["2026-08"],
    });
    expect(info.status).toBe("fechado_oficial");
    expect(info.officialSnapshotVersion).toBe(3);
  });

  it("sem snapshot, sem receita → parcial (nunca zero silencioso)", () => {
    const info = resolveFinancialPeriodSourceStatus({
      competenceFrom: "2026-01-01",
      competenceTo: "2026-01-31",
      officialSnapshot: null,
      hasRevenueData: false,
      officialSnapshotMonthsInRange: [],
    });
    expect(info.status).toBe("parcial");
  });

  it("intervalo inteiramente anterior a DATA_CORTE_JUMPPARK, com receita → fonte_historica", () => {
    const info = resolveFinancialPeriodSourceStatus({
      competenceFrom: "2026-02-01",
      competenceTo: "2026-02-28",
      officialSnapshot: null,
      hasRevenueData: true,
      officialSnapshotMonthsInRange: [],
    });
    expect(info.status).toBe("fonte_historica");
    expect(info.crossesHistoricalCutoff).toBe(false);
  });

  it("intervalo inteiramente a partir de DATA_CORTE_JUMPPARK, com receita → calculado", () => {
    const info = resolveFinancialPeriodSourceStatus({
      competenceFrom: "2026-06-01",
      competenceTo: "2026-06-30",
      officialSnapshot: null,
      hasRevenueData: true,
      officialSnapshotMonthsInRange: [],
    });
    expect(info.status).toBe("calculado");
    expect(info.crossesHistoricalCutoff).toBe(false);
  });

  it("intervalo que cruza DATA_CORTE_JUMPPARK é sinalizado com crossesHistoricalCutoff, mas ainda classificado (calculado quando há receita)", () => {
    const info = resolveFinancialPeriodSourceStatus({
      competenceFrom: "2026-04-15",
      competenceTo: "2026-05-15",
      officialSnapshot: null,
      hasRevenueData: true,
      officialSnapshotMonthsInRange: [],
    });
    expect(info.status).toBe("calculado");
    expect(info.crossesHistoricalCutoff).toBe(true);
  });
});

describe("fetchFinancialPeriodOverview — Missão UX/Navegação 2 (integração, repositório em memória)", () => {
  beforeEach(() => {
    resetFinanceRepositoryForTests();
    custoDespesaSeeded = new Set<string>();
  });

  it("6) mês com fechamento oficial: status fechado_oficial, número vem do snapshot congelado (agosto continua íntegro depois de fechado)", async () => {
    await seedReceita("2026-10", 1000);
    const { snapshot } = await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    const overview = await fetchFinancialPeriodOverview("2026-10-01", "2026-10-31");
    expect(overview.status.status).toBe("fechado_oficial");
    expect(overview.status.officialSnapshotVersion).toBe(snapshot.version);
    expect(overview.report.receitaBruta).toBe(1000);
  });

  it("12) snapshot oficial tem precedência mesmo com lançamento novo depois do fechamento — número nunca muda (prova de imutabilidade)", async () => {
    await seedReceita("2026-10", 1000);
    await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });
    await seedReceita("2026-10", 500, "20"); // lançamento posterior ao fechamento

    const overview = await fetchFinancialPeriodOverview("2026-10-01", "2026-10-31");
    expect(overview.status.status).toBe("fechado_oficial");
    expect(overview.report.receitaBruta).toBe(1000); // nunca 1500 — snapshot congelado, nunca recalculado
  });

  it("9) período sem nenhuma receita reconhecível é status parcial, nunca zero silencioso", async () => {
    const overview = await fetchFinancialPeriodOverview("2026-01-01", "2026-01-31");
    expect(overview.status.status).toBe("parcial");
    expect(overview.report.receitaBruta).toBeNull();
  });

  it("mês inteiro com dado real mas sem fechamento é calculado ao vivo, nunca finge ser oficial", async () => {
    await seedReceita("2026-11", 400);
    const overview = await fetchFinancialPeriodOverview("2026-11-01", "2026-11-30");
    expect(overview.status.status).toBe("calculado");
    expect(overview.status.officialSnapshotVersion).toBeNull();
    expect(overview.report.receitaBruta).toBe(400);
  });

  it("intervalo personalizado que é só um RECORTE de um mês oficialmente fechado nunca herda o status oficial — é sempre calculado ao vivo, mas o mês fechado é listado em metadata", async () => {
    await seedReceita("2026-10", 1000);
    await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });

    const overview = await fetchFinancialPeriodOverview("2026-10-01", "2026-10-15");
    expect(overview.status.status).not.toBe("fechado_oficial");
    expect(overview.status.officialSnapshotMonthsInRange).toEqual([]); // 01→15 não contém o mês INTEIRO
  });

  it("intervalo personalizado que CONTÉM por completo um mês fechado sinaliza esse mês em officialSnapshotMonthsInRange, mesmo sem ser elegível a fechado_oficial sozinho", async () => {
    await seedReceita("2026-10", 1000);
    await closeAccountingPeriodWithSnapshot({ competenceMonth: "2026-10", closedBy: RESPONSIBLE });
    await seedReceita("2026-11", 200);

    const overview = await fetchFinancialPeriodOverview("2026-09-01", "2026-11-30");
    expect(overview.status.status).not.toBe("fechado_oficial");
    expect(overview.status.officialSnapshotMonthsInRange).toEqual(["2026-10"]);
  });
});
