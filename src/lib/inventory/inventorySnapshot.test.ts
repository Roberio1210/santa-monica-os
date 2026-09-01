import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDefaultCaveat, closeInventorySnapshot, computeInventorySnapshotPayload, getOfficialInventoryClosedSnapshot, verifyInventorySnapshotIntegrityById } from "@/lib/inventory/inventorySnapshot";
import { computeInventorySnapshotHash, verifyInventorySnapshotIntegrity } from "@/lib/inventory/inventorySnapshotHash";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

const RESPONSIBLE = "Robério (teste)";
/** Item real do fixture estático (`initialCount20260710`) — mesmo padrão já usado por outros testes de estoque (ex.: manual-movement.test.ts). */
const KNOWN_ITEM_ID = "v-floc-shampoo-vonixx";
const KNOWN_ITEM_ID_2 = "blend-cera-carnauba-spray-vonixx";

/**
 * Não há reset de repositório para Estoque (ao contrário do financeiro) — mesmo padrão dos demais
 * testes deste módulo: cada `describe`/`it` usa competenceMonth sintética e única para nunca
 * colidir com fechamentos de outros testes no mesmo arquivo (índice único parcial de
 * `is_official` é por competência).
 */
let competenceCounter = 0;
function freshCompetence(): string {
  competenceCounter += 1;
  return `2099-${String(competenceCounter).padStart(2, "0")}`;
}

describe("computeInventorySnapshotPayload — snapshot não oficial (puro, nunca persistido)", () => {
  it("calcula um payload sem escrever nada — chamar duas vezes não altera nenhum estado", async () => {
    const repo = getInventoryRepository();
    const itemsBefore = await repo.listItems();
    const movementsBefore = await repo.listMovements();

    const payload1 = await computeInventorySnapshotPayload({ competenceMonth: "2099-00", cutoffAt: "2099-01-31", caveat: "teste" });
    const payload2 = await computeInventorySnapshotPayload({ competenceMonth: "2099-00", cutoffAt: "2099-01-31", caveat: "teste" });

    expect(payload1.totalProducts).toBe(payload2.totalProducts);
    expect(await repo.listItems()).toHaveLength(itemsBefore.length);
    expect(await repo.listMovements()).toHaveLength(movementsBefore.length);
  });

  it("produto sem custo permanece custo desconhecido — nunca vira 0", async () => {
    const repo = getInventoryRepository();
    await repo.updateItemDetails(KNOWN_ITEM_ID, { unitCost: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2099-01-31", caveat: "teste" });
    const entry = payload.products.find((p) => p.itemId === KNOWN_ITEM_ID)!;

    expect(entry.unitCost).toBeNull();
    expect(entry.estimatedValue).toBeNull();
  });

  it("total monetário é identificado como parcial quando algum produto não tem custo", async () => {
    const repo = getInventoryRepository();
    await repo.updateItemDetails(KNOWN_ITEM_ID, { unitCost: 10 });
    await repo.updateItemDetails(KNOWN_ITEM_ID_2, { unitCost: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2099-01-31", caveat: "teste" });

    expect(payload.productsWithCost).toBeGreaterThan(0);
    expect(payload.productsWithoutCost).toBeGreaterThan(0);
    expect(payload.isPartialValue).toBe(true);
    expect(payload.partialInventoryValue).not.toBeNull();

    // a soma parcial só considera os produtos com custo conhecido — nunca inclui os sem custo como 0
    const knownItem = payload.products.find((p) => p.itemId === KNOWN_ITEM_ID)!;
    expect(knownItem.estimatedValue).toBe(Math.round(knownItem.systemicQuantity * 10 * 100) / 100);
  });

  it("SYSTEM_THEORETICAL não é confundido com PHYSICAL_CONFIRMED — última contagem antes do corte, sem diferença inventada", async () => {
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId: KNOWN_ITEM_ID, countedQuantity: 500, date: "2099-01-18", responsible: RESPONSIBLE, reference: `CONTAGEM-${freshCompetence()}`, notes: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2099-01-31", caveat: "teste" });
    const entry = payload.products.find((p) => p.itemId === KNOWN_ITEM_ID)!;

    expect(entry.positionOrigin).toBe("SYSTEM_THEORETICAL");
    expect(entry.lastPhysicalCountDate).toBe("2099-01-18");
    // ausência de contagem física no corte (31/01) não gera diferença fictícia
    expect(entry.physicalVsTheoreticalDifference).toBeNull();
  });

  it("última contagem física permanece rastreável mesmo quando o corte é uma data posterior", async () => {
    const repo = getInventoryRepository();
    const ref = `CONTAGEM-${freshCompetence()}`;
    await repo.recordPhysicalCount({ itemId: KNOWN_ITEM_ID, countedQuantity: 321, date: "2099-02-18", responsible: RESPONSIBLE, reference: ref, notes: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2099-02-28", caveat: "teste" });
    const entry = payload.products.find((p) => p.itemId === KNOWN_ITEM_ID)!;

    expect(entry.lastPhysicalCountDate).toBe("2099-02-18");
    expect(entry.lastPhysicalCountQuantity).toBe(321);
  });

  it("quando a contagem física acontece EXATAMENTE na data de corte, a origem é PHYSICAL_CONFIRMED e a diferença vem da própria movimentação", async () => {
    const repo = getInventoryRepository();
    const before = await repo.getItem(KNOWN_ITEM_ID);
    const cutoff = "2099-03-31";
    await repo.recordPhysicalCount({ itemId: KNOWN_ITEM_ID, countedQuantity: 777, date: cutoff, responsible: RESPONSIBLE, reference: `CONTAGEM-${freshCompetence()}`, notes: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: cutoff, caveat: "teste" });
    const entry = payload.products.find((p) => p.itemId === KNOWN_ITEM_ID)!;

    expect(entry.positionOrigin).toBe("PHYSICAL_CONFIRMED");
    expect(entry.systemicQuantity).toBe(777);
    expect(entry.physicalVsTheoreticalDifference).toBe(round2(777 - (before?.currentQuantity ?? 0)));
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

describe("closeInventorySnapshot — fechamento oficial", () => {
  it("cria a versão 1, oficial, com hash e ressalva preenchidos", async () => {
    const competence = freshCompetence();
    const { snapshot } = await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE });

    expect(snapshot.version).toBe(1);
    expect(snapshot.isOfficial).toBe(true);
    expect(snapshot.payloadHash).toHaveLength(64); // sha256 hex
    expect(snapshot.caveat.length).toBeGreaterThan(0);
    expect(snapshot.methodology).toBe("SYSTEM_THEORETICAL"); // nenhuma contagem exatamente no corte neste cenário
  });

  it("segunda tentativa de fechamento oficial da mesma competência é bloqueada — nunca duas versões oficiais simultâneas", async () => {
    const competence = freshCompetence();
    await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE });

    await expect(closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE })).rejects.toThrow(/já possui um fechamento/i);

    const repo = getInventoryRepository();
    const versions = await repo.listInventorySnapshots(competence);
    expect(versions).toHaveLength(1);
    expect(versions.filter((v) => v.isOfficial)).toHaveLength(1);
  });

  it("hash é determinístico — mesmo payload lógico produz sempre o mesmo hash, independente da ordem de inserção das chaves", async () => {
    const competence = freshCompetence();
    const { snapshot } = await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE });

    const hashA = computeInventorySnapshotHash(snapshot.payload);

    function reverseKeyOrder(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(reverseKeyOrder);
      if (value !== null && typeof value === "object") {
        const rebuilt: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>).reverse()) rebuilt[key] = reverseKeyOrder(val);
        return rebuilt;
      }
      return value;
    }
    const reordered = reverseKeyOrder(JSON.parse(JSON.stringify(snapshot.payload)));
    const hashB = computeInventorySnapshotHash(reordered as typeof snapshot.payload);

    expect(hashA).toBe(snapshot.payloadHash);
    expect(hashB).toBe(hashA);
  });

  it("verificação de integridade funciona e detecta corrupção do payload", async () => {
    const competence = freshCompetence();
    await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE });

    const check = await verifyInventorySnapshotIntegrityById(competence, 1);
    expect(check?.isIntact).toBe(true);

    const tampered = { ...check!.snapshot.payload, totalProducts: 999999 };
    expect(verifyInventorySnapshotIntegrity(tampered, check!.snapshot.payloadHash)).toBe(false);
  });

  it("movimentação registrada DEPOIS do fechamento não altera o snapshot já congelado — só o cálculo ao vivo diverge", async () => {
    const competence = freshCompetence();
    const cutoff = "2099-01-31";
    const { snapshot: frozen } = await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: cutoff, createdBy: RESPONSIBLE });
    const frozenEntry = frozen.payload.products.find((p) => p.itemId === KNOWN_ITEM_ID_2)!;

    // simula uma movimentação posterior ao fechamento — item sem histórico prévio de movimentação nesta suíte, para nunca colidir com datas retroativas criadas por outros testes
    const repo = getInventoryRepository();
    await repo.recordMovement({ itemId: KNOWN_ITEM_ID_2, type: "entrada", quantity: 999, unit: frozenEntry.unit, date: cutoff, notes: null, responsible: RESPONSIBLE, reference: null });

    const stillFrozen = await getOfficialInventoryClosedSnapshot(competence);
    const stillFrozenEntry = stillFrozen!.payload.products.find((p) => p.itemId === KNOWN_ITEM_ID_2)!;
    expect(stillFrozenEntry.systemicQuantity).toBe(frozenEntry.systemicQuantity); // não mudou

    const liveNow = await computeInventorySnapshotPayload({ competenceMonth: competence, cutoffAt: cutoff, caveat: "teste" });
    const liveEntry = liveNow.products.find((p) => p.itemId === KNOWN_ITEM_ID_2)!;
    expect(liveEntry.systemicQuantity).toBe(round2(frozenEntry.systemicQuantity + 999)); // o cálculo ao vivo mudou — divergência esperada
  });

  it("fechamento não cria nenhuma movimentação nem altera inventory_items", async () => {
    const competence = freshCompetence();
    const repo = getInventoryRepository();
    const itemsBefore = await repo.listItems();
    const movementsBefore = await repo.listMovements();
    const knownItemBefore = await repo.getItem(KNOWN_ITEM_ID);

    await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE });

    expect(await repo.listMovements()).toHaveLength(movementsBefore.length);
    expect(await repo.listItems()).toHaveLength(itemsBefore.length);
    const knownItemAfter = await repo.getItem(KNOWN_ITEM_ID);
    expect(knownItemAfter?.currentQuantity).toBe(knownItemBefore?.currentQuantity);
    expect(knownItemAfter?.lastCountDate).toBe(knownItemBefore?.lastCountDate);
  });

  it("exige responsável não vazio", async () => {
    await expect(closeInventorySnapshot({ competenceMonth: freshCompetence(), cutoffAt: "2099-01-31", createdBy: "  " })).rejects.toThrow(/responsável/i);
  });

  it("buildDefaultCaveat produz o texto exigido pela missão quando a contagem é anterior ao corte", () => {
    const text = buildDefaultCaveat("2026-08-31", "2026-08-18");
    expect(text).toContain("18");
    expect(text).toContain("31");
    expect(text.toLowerCase()).toContain("não possui rastreamento completo");
  });
});

describe("Replay cronológico — Missão E5.1 (correção do achado real do APC)", () => {
  it("reproduz o caso real do APC Limpador Multifuncional: compra retroativa inserida DEPOIS de contagem/fusão não destrói o saldo correto de 13.750ml", async () => {
    const repo = getInventoryRepository();
    const itemId = "apc-limpador-multifuncional-farben"; // item real do fixture, mesmo produto do achado real

    // 1) saldo histórico anterior (equivalente à contagem de 10/07)
    await repo.recordPhysicalCount({ itemId, countedQuantity: 5000, date: "2026-07-10", responsible: RESPONSIBLE, reference: "STOCKTAKE-TESTE-07-10", notes: null });

    // 2) contagem/correção de 18/08 (acontece ANTES, no tempo real de inserção, da compra retroativa)
    await repo.recordPhysicalCount({ itemId, countedQuantity: 8750, date: "2026-08-18", responsible: RESPONSIBLE, reference: "CONTAGEM-TESTE-08-18", notes: null });

    // 3) consolidação posterior (fusão de cadastro duplicado) — entrada de 5.000ml em 19/08
    await repo.recordMovement({ itemId, type: "entrada", quantity: 5000, unit: "ml", date: "2026-08-19", notes: "recebido de item consolidado", responsible: RESPONSIBLE, reference: "CONSOLIDACAO-TESTE" });

    // 4) SÓ AGORA, depois de (2) e (3) já existirem, chega a compra Farben retroativa — date="2026-08-14", mas inserida por último
    await repo.recordMovement({ itemId, type: "compra", quantity: 5000, unit: "ml", date: "2026-08-14", notes: "compra Farben retroativa", responsible: RESPONSIBLE, reference: "COMPRA-FARBEN-TESTE" });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2026-08-31", caveat: "teste" });
    const entry = payload.products.find((p) => p.itemId === itemId)!;

    // resultado esperado: 5.000 (10/07) +5.000 (compra 14/08, reposicionada corretamente no replay) = 10.000,
    // corrigido para 8.750 pela contagem de 18/08, +5.000 pela fusão de 19/08 = 13.750ml
    expect(entry.systemicQuantity).toBe(13750);
  });

  it("A) compra normal soma sobre o saldo anterior", async () => {
    const itemId = "makker-vonixx";
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 100, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-A1", notes: null });
    await repo.recordMovement({ itemId, type: "compra", quantity: 50, unit: "ml", date: "2050-01-02", notes: null, responsible: RESPONSIBLE, reference: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2050-01-31", caveat: "t" });
    expect(payload.products.find((p) => p.itemId === itemId)!.systemicQuantity).toBe(150);
  });

  it("B) saída normal subtrai do saldo anterior", async () => {
    const itemId = "sio2-pro-vonixx";
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 100, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-B1", notes: null });
    await repo.recordMovement({ itemId, type: "saida", quantity: 30, unit: "ml", date: "2050-01-02", notes: null, responsible: RESPONSIBLE, reference: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2050-01-31", caveat: "t" });
    expect(payload.products.find((p) => p.itemId === itemId)!.systemicQuantity).toBe(70);
  });

  it("C) correção física SUBSTITUI o saldo (absoluto), nunca soma/subtrai como delta", async () => {
    const itemId = "top-cera-cera-liquida-cadillac";
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 100, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-C1", notes: null });
    await repo.recordMovement({ itemId, type: "compra", quantity: 900, unit: "ml", date: "2050-01-02", notes: null, responsible: RESPONSIBLE, reference: null });
    // saldo antes da correção seria 1000 (100+900) — a correção substitui por 250, não soma/subtrai 250
    await repo.recordPhysicalCount({ itemId, countedQuantity: 250, date: "2050-01-03", responsible: RESPONSIBLE, reference: "R-C2", notes: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2050-01-31", caveat: "t" });
    expect(payload.products.find((p) => p.itemId === itemId)!.systemicQuantity).toBe(250);
  });

  it("D) movimentação retroativa ocupa sua posição econômica correta, mesmo inserida por último", async () => {
    const itemId = "remox-removedor-cimento-desincrustante-escapamento-nobrecar";
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 100, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-D1", notes: null });
    // uma correção física em 01-10 é inserida ANTES da compra retroativa de 01-05
    await repo.recordPhysicalCount({ itemId, countedQuantity: 500, date: "2050-01-10", responsible: RESPONSIBLE, reference: "R-D2", notes: null });
    // compra retroativa (date 01-05, mas chega depois no tempo real) — não deve alterar o resultado, pois a correção de 01-10 é posterior e absoluta
    await repo.recordMovement({ itemId, type: "compra", quantity: 999, unit: "ml", date: "2050-01-05", notes: null, responsible: RESPONSIBLE, reference: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2050-01-31", caveat: "t" });
    // replay correto: 100 (01-01) -> +999 (01-05, reposicionada) = 1099 -> substituído por 500 (01-10, absoluto) = 500
    expect(payload.products.find((p) => p.itemId === itemId)!.systemicQuantity).toBe(500);
  });

  it("E) duas movimentações com a mesma data são ambas aplicadas, em ordem determinística (createdAt/id como desempate)", async () => {
    const itemId = "delet-limpador-pneus-borrachas-vonixx";
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 100, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-E1", notes: null });
    await repo.recordMovement({ itemId, type: "compra", quantity: 10, unit: "ml", date: "2050-01-02", notes: null, responsible: RESPONSIBLE, reference: null });
    await repo.recordMovement({ itemId, type: "saida", quantity: 5, unit: "ml", date: "2050-01-02", notes: null, responsible: RESPONSIBLE, reference: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2050-01-31", caveat: "t" });
    // ambas aplicadas independente da ordem relativa entre si: 100 +10 -5 = 105
    expect(payload.products.find((p) => p.itemId === itemId)!.systemicQuantity).toBe(105);
  });

  it("F) ordenação/cálculo é determinístico — computar duas vezes produz sempre o mesmo resultado", async () => {
    const itemId = "limpa-vidros-mills";
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 200, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-F1", notes: null });
    await repo.recordMovement({ itemId, type: "compra", quantity: 20, unit: "ml", date: "2050-01-02", notes: null, responsible: RESPONSIBLE, reference: null });

    const competence = freshCompetence();
    const payload1 = await computeInventorySnapshotPayload({ competenceMonth: competence, cutoffAt: "2050-01-31", caveat: "t" });
    const payload2 = await computeInventorySnapshotPayload({ competenceMonth: competence, cutoffAt: "2050-01-31", caveat: "t" });
    expect(payload1.products.find((p) => p.itemId === itemId)!.systemicQuantity).toBe(payload2.products.find((p) => p.itemId === itemId)!.systemicQuantity);
  });

  it("G) transferência de saída subtrai do item de origem", async () => {
    const itemId = "alumax-limpador-de-aluminio-vintex";
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 100, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-G1", notes: null });
    await repo.recordMovement({ itemId, type: "transferencia", quantity: 40, unit: "ml", date: "2050-01-02", notes: "transferido para outro item", responsible: RESPONSIBLE, reference: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2050-01-31", caveat: "t" });
    expect(payload.products.find((p) => p.itemId === itemId)!.systemicQuantity).toBe(60);
  });

  it("H) fusão/consolidação: cada lado do par transferência(saída)+entrada é calculado corretamente e de forma independente", async () => {
    const donorId = "removex-desengraxante-limpador-chassi-vintex";
    const receiverId = "sanitizante-fresh-vintex";
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId: donorId, countedQuantity: 300, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-H1", notes: null });
    await repo.recordPhysicalCount({ itemId: receiverId, countedQuantity: 100, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-H2", notes: null });
    // mesmo padrão real da fusão do APC: transferencia no doador, entrada no receptor
    await repo.recordMovement({ itemId: donorId, type: "transferencia", quantity: 300, unit: "ml", date: "2050-01-05", notes: "consolidado no item receptor", responsible: RESPONSIBLE, reference: "FUSAO-TESTE" });
    await repo.recordMovement({ itemId: receiverId, type: "entrada", quantity: 300, unit: "ml", date: "2050-01-05", notes: "recebido do item doador", responsible: RESPONSIBLE, reference: "FUSAO-TESTE" });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2050-01-31", caveat: "t" });
    expect(payload.products.find((p) => p.itemId === donorId)!.systemicQuantity).toBe(0);
    expect(payload.products.find((p) => p.itemId === receiverId)!.systemicQuantity).toBe(400);
  });

  it("I) cálculo com cutoff histórico ignora movimentações posteriores ao corte", async () => {
    const itemId = "izer-limpador-ferroso-vonixx";
    const repo = getInventoryRepository();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 100, date: "2050-01-01", responsible: RESPONSIBLE, reference: "R-I1", notes: null });
    await repo.recordMovement({ itemId, type: "compra", quantity: 50, unit: "ml", date: "2050-01-15", notes: null, responsible: RESPONSIBLE, reference: null });
    await repo.recordMovement({ itemId, type: "compra", quantity: 999, unit: "ml", date: "2050-02-15", notes: null, responsible: RESPONSIBLE, reference: null }); // depois do corte histórico usado abaixo

    const payload = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: "2050-01-31", caveat: "t" });
    expect(payload.products.find((p) => p.itemId === itemId)!.systemicQuantity).toBe(150); // 100+50, nunca +999
  });

  it("J) movimentação posterior ao cutoff não altera o cálculo de um cutoff anterior já usado", async () => {
    const itemId = "v-floc-shampoo-vonixx";
    const repo = getInventoryRepository();
    // este item já tem histórico de testes anteriores no arquivo (2099-xx) — usamos um cutoff bem anterior a tudo isso para isolar
    const cutoff = "2010-01-31";
    const payloadBefore = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: cutoff, caveat: "t" });
    const before = payloadBefore.products.find((p) => p.itemId === itemId)!.systemicQuantity;

    await repo.recordMovement({ itemId, type: "compra", quantity: 12345, unit: "ml", date: "2098-12-31", notes: null, responsible: RESPONSIBLE, reference: null });

    const payloadAfter = await computeInventorySnapshotPayload({ competenceMonth: freshCompetence(), cutoffAt: cutoff, caveat: "t" });
    const after = payloadAfter.products.find((p) => p.itemId === itemId)!.systemicQuantity;
    expect(after).toBe(before); // a nova movimentação é datada MUITO depois do cutoff de 2010 — não deve aparecer
  });
});

describe("Missão Estoque E6.2 — lastPhysicalCountAt nunca vem de cadastro de produto (item.lastCountDate)", () => {
  it("A) contagem física em 18/08 + compra posterior em 26/08 no mesmo item — a última contagem física do item e do resumo do snapshot continuam 18/08", async () => {
    const itemId = "v-floc-shampoo-vonixx";
    const repo = getInventoryRepository();
    const competence = freshCompetence();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 400, date: "2099-08-18", responsible: RESPONSIBLE, reference: `E62-A-${competence}`, notes: null });
    await repo.recordMovement({ itemId, type: "compra", quantity: 50, unit: "ml", date: "2099-08-26", notes: null, responsible: RESPONSIBLE, reference: null });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: competence, cutoffAt: "2099-08-31", caveat: "t" });
    const entry = payload.products.find((p) => p.itemId === itemId)!;
    expect(entry.lastPhysicalCountDate).toBe("2099-08-18");
    expect(entry.hasRealPhysicalCount).toBe(true);

    const { snapshot } = await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-08-31", createdBy: RESPONSIBLE });
    expect(snapshot.lastPhysicalCountAt).toBe("2099-08-18");
  });

  it("B) compra posterior à contagem não altera o lastPhysicalCountAt do fechamento oficial", async () => {
    const itemId = "sio2-pro-vonixx";
    const repo = getInventoryRepository();
    const competence = freshCompetence();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 200, date: "2099-09-18", responsible: RESPONSIBLE, reference: `E62-B-${competence}`, notes: null });
    await repo.recordMovement({ itemId, type: "compra", quantity: 999, unit: "ml", date: "2099-09-29", notes: null, responsible: RESPONSIBLE, reference: null });

    const { snapshot } = await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-09-30", createdBy: RESPONSIBLE });
    expect(snapshot.lastPhysicalCountAt).toBe("2099-09-18");
  });

  it("C) correção de inventário (contagem física real) posterior É reconhecida como a nova última contagem — ao contrário da compra (caso B), uma contagem real posterior sempre atualiza a referência", async () => {
    const itemId = "makker-vonixx";
    const repo = getInventoryRepository();
    const competence = freshCompetence();
    await repo.recordPhysicalCount({ itemId, countedQuantity: 100, date: "2099-10-18", responsible: RESPONSIBLE, reference: `E62-C1-${competence}`, notes: null });
    await repo.recordPhysicalCount({ itemId, countedQuantity: 120, date: "2099-10-26", responsible: RESPONSIBLE, reference: `E62-C2-${competence}`, notes: null });

    const { snapshot } = await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-10-31", createdBy: RESPONSIBLE });
    expect(snapshot.lastPhysicalCountAt).toBe("2099-10-26"); // contagem real de 26/10 é legitimamente mais recente que a de 18/10
  });

  it("D) produto recém-cadastrado (sem nenhuma movimentação de contagem física real, só item.lastCountDate herdado do cadastro) não altera o resumo global do fechamento", async () => {
    const itemWithRealCount = "top-cera-cera-liquida-cadillac";
    // item nunca tocado por nenhum outro teste deste arquivo (nenhuma movimentação de contagem física real em nenhuma data)
    const freshlyRegisteredItem = "bactran-vonixx";
    const repo = getInventoryRepository();
    const competence = freshCompetence();

    await repo.recordPhysicalCount({ itemId: itemWithRealCount, countedQuantity: 300, date: "2099-11-18", responsible: RESPONSIBLE, reference: `E62-D-${competence}`, notes: null });
    // simula exatamente o caminho real do bug: um produto "criado" com lastCountDate = data de cadastro (posterior à contagem real), zero movimentações de contagem física
    await repo.updateItemDetails(freshlyRegisteredItem, { lastCountDate: "2099-11-26" });

    const payload = await computeInventorySnapshotPayload({ competenceMonth: competence, cutoffAt: "2099-11-30", caveat: "t" });
    const freshEntry = payload.products.find((p) => p.itemId === freshlyRegisteredItem)!;
    expect(freshEntry.hasRealPhysicalCount).toBe(false);
    expect(freshEntry.lastPhysicalCountDate).toBe("2099-11-26"); // ainda exposto por item, mas marcado como não-real

    const { snapshot } = await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-11-30", createdBy: RESPONSIBLE });
    // o resumo do fechamento NUNCA pula para 26/11 (data de cadastro do produto novo) — permanece na única contagem física real, 18/11
    expect(snapshot.lastPhysicalCountAt).toBe("2099-11-18");
  });

  it("um item isolado, nunca contado fisicamente, tem hasRealPhysicalCount=false mesmo tendo item.lastCountDate preenchido (prova unitária do fallback nunca fabricar uma contagem)", async () => {
    // item nunca tocado por nenhum outro teste deste arquivo — garante isolamento total desta asserção
    const itemId = "black-boost-verniz-motor-dub";
    const repo = getInventoryRepository();
    const competence = freshCompetence();
    const before = await repo.getItem(itemId);
    expect(before?.lastCountDate).toBeTruthy(); // todo item do fixture já nasce com lastCountDate — nunca vazio

    const payload = await computeInventorySnapshotPayload({ competenceMonth: competence, cutoffAt: "2099-12-31", caveat: "t" });
    const entry = payload.products.find((p) => p.itemId === itemId)!;
    expect(entry.hasRealPhysicalCount).toBe(false);
    expect(entry.lastPhysicalCountDate).toBe(before!.lastCountDate); // ainda exposto por item (nunca omitido), só marcado como não-real
  });
});

describe("Missão Estoque E6.2 — correção controlada e auditável de um fechamento oficial (correctionOf)", () => {
  it("sem correctionOf, uma segunda tentativa de fechamento continua bloqueada exatamente como antes", async () => {
    const competence = freshCompetence();
    await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE });
    await expect(closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE })).rejects.toThrow(/já possui um fechamento/i);
  });

  it("correctionOf com officialSnapshotId errado é rejeitado — nunca substitui a versão vigente sem prova de que o chamador releu o estado atual", async () => {
    const competence = freshCompetence();
    await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE });

    await expect(
      closeInventorySnapshot({
        competenceMonth: competence,
        cutoffAt: "2099-01-31",
        createdBy: RESPONSIBLE,
        correctionOf: { officialSnapshotId: "id-inventado-nao-existe", reason: "teste" },
      }),
    ).rejects.toThrow(/não corresponde ao vigente/i);
  });

  it("correctionOf com motivo vazio é rejeitado", async () => {
    const competence = freshCompetence();
    const { snapshot } = await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE });

    await expect(
      closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE, correctionOf: { officialSnapshotId: snapshot.id, reason: "   " } }),
    ).rejects.toThrow(/motivo da correção/i);
  });

  it("correctionOf válido cria a versão 2, supera a versão 1 com rastro completo (supersededAt/supersededByVersionId/notes) e nunca apaga a anterior", async () => {
    const competence = freshCompetence();
    const { snapshot: v1 } = await closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE, caveat: "ressalva errada v1" });

    const { snapshot: v2 } = await closeInventorySnapshot({
      competenceMonth: competence,
      cutoffAt: "2099-01-31",
      createdBy: RESPONSIBLE,
      caveat: "ressalva corrigida v2",
      correctionOf: { officialSnapshotId: v1.id, reason: "V1 continha metadado factualmente incorreto — teste E6.2" },
    });

    expect(v2.version).toBe(2);
    expect(v2.isOfficial).toBe(true);
    expect(v2.caveat).toBe("ressalva corrigida v2");
    expect(v2.notes).toContain("V1 continha metadado factualmente incorreto");

    const repo = getInventoryRepository();
    const versions = await repo.listInventorySnapshots(competence);
    expect(versions).toHaveLength(2); // v1 nunca é apagada, só desmarcada
    const v1Reloaded = versions.find((v) => v.id === v1.id)!;
    expect(v1Reloaded.isOfficial).toBe(false);
    expect(v1Reloaded.supersededAt).not.toBeNull();
    expect(v1Reloaded.supersededByVersionId).toBe(v2.id);

    const official = await getOfficialInventoryClosedSnapshot(competence);
    expect(official?.id).toBe(v2.id);
    expect(official?.version).toBe(2);

    // uma terceira tentativa sem correctionOf continua bloqueada normalmente sobre a v2
    await expect(closeInventorySnapshot({ competenceMonth: competence, cutoffAt: "2099-01-31", createdBy: RESPONSIBLE })).rejects.toThrow(/já possui um fechamento/i);
  });
});

describe("Isolamento arquitetural — nunca acoplado ao financeiro nem ao JumpPark", () => {
  const files = ["inventorySnapshot.ts", "inventorySnapshotHash.ts"];

  it("nenhum arquivo do fechamento de estoque importa código do módulo financeiro", () => {
    for (const file of files) {
      const content = readFileSync(join(process.cwd(), "src/lib/inventory", file), "utf8");
      expect(content).not.toMatch(/from ["']@\/lib\/finance/);
    }
  });

  it("nenhum arquivo do fechamento de estoque importa/chama a integração JumpPark", () => {
    for (const file of files) {
      const content = readFileSync(join(process.cwd(), "src/lib/inventory", file), "utf8");
      expect(content).not.toMatch(/from ["']@\/lib\/jumppark/i);
      expect(content).not.toMatch(/from ["']@\/lib\/integrations\/jumppark/i);
    }
  });
});
