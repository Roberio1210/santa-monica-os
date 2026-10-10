import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GAP_RECOVERY_ALLOWED_ID_HASHES, GAP_RECOVERY_EXPECTED, GAP_RECOVERY_WINDOW } from "./gap-recovery-allowlist";
import {
  applyRecoveryPlan,
  buildRecoveryPlan,
  hashExternalId,
  RecoveryAbortedError,
  toItemRows,
  toOrderRow,
  type RecoveryPlan,
  type RecoveryTotals,
  type RecoveryWriter,
} from "./gap-recovery";
import { mapServiceOrderForPersistence } from "./service";
import type { JumpParkServiceOrder } from "./types";

function order(id: string, over: Partial<JumpParkServiceOrder> = {}): JumpParkServiceOrder {
  return {
    serviceOrderId: id,
    serviceOrderCode: `C-${id}`,
    entryDateTime: "2026-09-22 10:00:00",
    exitDateTime: "2026-09-22 12:00:00",
    plate: "ABC1D23",
    vehicleModel: "GOL",
    clientName: "CLIENTE REAL",
    clientPhone: "48999990000",
    amount: "20.00",
    amountServices: "0.00",
    totalAmount: 20,
    paymentMethodName: "Crédito",
    financialSituationName: "Pago",
    operationSituationName: "Fora do pátio",
    userName: "OPERADOR",
    services: [],
    ...over,
  };
}

// Cenário de teste: 3 ordens na lista fixa (uma de lavação, uma após a meia-noite).
const A = order("A");
const B = order("B", { amount: "0", amountServices: "180.00", totalAmount: 180, services: [{ description: "Lavação Silver", amount: "180.00", quantity: 1 }] });
const C = order("C", { entryDateTime: "2026-09-22 22:00:00", exitDateTime: "2026-09-23 00:30:00", amount: "40.00", totalAmount: 40 });
const ALLOW = new Set([A, B, C].map((o) => hashExternalId(o.serviceOrderId!)));
const EXPECTED = {
  orders: 3,
  items: 1,
  parkingAmountCents: 6_000,
  servicesAmountCents: 18_000,
  totalAmountCents: 24_000,
  itemsAmountCents: 18_000,
  ordersByExitDate: { "2026-09-22": 2, "2026-09-23": 1 },
} as unknown as typeof GAP_RECOVERY_EXPECTED;
const WINDOW = { from: "2026-09-22", to: "2026-09-23" };

function plan(perDayOrders: Record<string, JumpParkServiceOrder[]>, existing: string[] = [], truncated = false): RecoveryPlan {
  return buildRecoveryPlan({
    perDay: Object.entries(perDayOrders).map(([day, orders]) => ({ day, orders, truncated })),
    existingExternalIds: new Set(existing),
    allowlist: ALLOW,
    expected: EXPECTED,
    window: WINDOW,
  });
}
const happy = () => plan({ "2026-09-22": [A, B, order("FORA-DA-LISTA")], "2026-09-23": [C] });

describe("lista fixa validada pela auditoria", () => {
  it("tem exatamente 46 hashes SHA-256 distintos e totais coerentes", () => {
    expect(GAP_RECOVERY_ALLOWED_ID_HASHES.size).toBe(46);
    for (const h of GAP_RECOVERY_ALLOWED_ID_HASHES) expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(GAP_RECOVERY_EXPECTED.orders).toBe(46);
    expect(GAP_RECOVERY_EXPECTED.parkingAmountCents + GAP_RECOVERY_EXPECTED.servicesAmountCents).toBe(GAP_RECOVERY_EXPECTED.totalAmountCents);
    expect(GAP_RECOVERY_EXPECTED.totalAmountCents).toBe(824_200);
    expect(Object.values(GAP_RECOVERY_EXPECTED.ordersByExitDate).reduce((a, b) => a + b, 0)).toBe(46);
    expect(GAP_RECOVERY_WINDOW).toEqual({ from: "2026-09-21", to: "2026-09-25" });
  });

  it("não guarda identificador em claro (o id do JumpPark embute a placa)", () => {
    const source = readFileSync(path.join(__dirname, "gap-recovery-allowlist.ts"), "utf-8");
    expect(source).not.toMatch(/\b\d{5}[A-Z]{3}\d[A-Z0-9]\d{2}\d{14}\b/);
  });
});

describe("buildRecoveryPlan", () => {
  it("seleciona só as ordens da lista fixa, sem bloqueios, com totais por dia de saída", () => {
    const p = happy();
    expect(p.blockers).toEqual([]);
    expect(p.orders.map((o) => o.persist.externalId)).toEqual(["A", "B", "C"]);
    expect(p.totals).toEqual({ orders: 3, items: 1, parkingAmountCents: 6_000, servicesAmountCents: 18_000, totalAmountCents: 24_000, itemsAmountCents: 18_000 });
    expect(p.ordersByExitDate["2026-09-23"]).toEqual({ orders: 1, parkingAmount: 40, servicesAmount: 0, totalAmount: 40 });
  });

  it("preserva os valores exatamente como o mapeamento da sincronização (sem reclassificar)", () => {
    const p = happy();
    for (const raw of [A, B, C]) expect(p.orders.find((o) => o.persist.externalId === raw.serviceOrderId)!.persist).toEqual(mapServiceOrderForPersistence(raw));
  });

  it("pagamento após a meia-noite: data/hora completas preservadas; order_date segue a regra da sincronização", () => {
    const c = happy().orders.find((o) => o.persist.externalId === "C")!;
    expect(c.entryDateTime).toBe("2026-09-22 22:00:00");
    expect(c.exitDateTime).toBe("2026-09-23 00:30:00");
    expect(c.exitDate).toBe("2026-09-23");
    expect(c.persist.orderDate).toBe("2026-09-22");
    expect(toOrderRow(c).rawPayloadSanitized).toEqual({ entryDateTime: "2026-09-22 22:00:00", exitDateTime: "2026-09-23 00:30:00", origem: "recuperacao-lacuna-2026-09" });
  });

  it("ordem repetida em mais de uma consulta conta uma vez só", () => {
    expect(plan({ "2026-09-22": [A, B], "2026-09-23": [C, A] }).totals.orders).toBe(3);
  });

  it.each([
    ["ordem da lista ausente na API", () => plan({ "2026-09-22": [A, B] }), /2 das 3/],
    ["ordem já existente no Neon", () => plan({ "2026-09-22": [A, B], "2026-09-23": [C] }, ["B"]), /JÁ EXISTE/],
    ["valor diferente do validado", () => plan({ "2026-09-22": [A, { ...B, amountServices: "200.00", totalAmount: 200 }], "2026-09-23": [C] }), /servicesAmountCents/],
    ["saída fora da janela", () => plan({ "2026-09-22": [A, B], "2026-09-23": [{ ...C, exitDateTime: "2026-09-27 10:00:00" }] }), /fora de/],
    ["ordem ainda no pátio", () => plan({ "2026-09-22": [A, B], "2026-09-23": [{ ...C, exitDateTime: undefined }] }), /sem data de saída/],
    ["paginação/limite na API", () => plan({ "2026-09-22": [A, B], "2026-09-23": [C] }, [], true), /paginação/],
    ["conteúdo diferente entre consultas", () => plan({ "2026-09-22": [A, B], "2026-09-23": [C, { ...A, totalAmount: 99 }] }), /conteúdo diferente/],
  ])("bloqueia: %s", (_name, build, msg) => {
    const p = build();
    expect(p.blockers.join(" | ")).toMatch(msg);
  });

  it("hash do plano é determinístico e muda se qualquer valor da API mudar", () => {
    expect(happy().planHash).toBe(plan({ "2026-09-23": [C], "2026-09-22": [B, A] }).planHash);
    expect(happy().planHash).not.toBe(plan({ "2026-09-22": [A, { ...B, paymentMethodName: "Pix" }], "2026-09-23": [C] }).planHash);
  });

  it("prévia não expõe nome, telefone, placa completa nem operador", () => {
    const json = JSON.stringify(happy().preview);
    for (const secret of ["CLIENTE REAL", "48999990000", "ABC1D23", "OPERADOR"]) expect(json).not.toContain(secret);
  });
});

/** Writer falso: registra tudo; nunca há UPDATE/DELETE porque a interface nem oferece. */
function fakeWriter(opts: { existing?: string[]; conflictOn?: string; itemsShort?: boolean; readBack?: Partial<RecoveryTotals> } = {}) {
  const calls: string[] = [];
  const orders: Array<{ id: string; row: ReturnType<typeof toOrderRow> }> = [];
  const items: Array<ReturnType<typeof toItemRows>[number]> = [];
  const audit: unknown[] = [];
  const writer: RecoveryWriter = {
    async findExistingExternalIds(ids) {
      calls.push(`find:${ids.length}`);
      return (opts.existing ?? []).filter((id) => ids.includes(id));
    },
    async insertOrder(row) {
      calls.push(`insertOrder:${row.externalId}`);
      if (row.externalId === opts.conflictOn) return null;
      const id = `uuid-${row.externalId}`;
      orders.push({ id, row });
      return { id };
    },
    async insertItems(rows) {
      calls.push(`insertItems:${rows.length}`);
      items.push(...rows);
      return opts.itemsShort ? rows.length - 1 : rows.length;
    },
    async readBackTotals() {
      calls.push("readBack");
      const cents = (s: string | null) => Math.round(Number(s ?? 0) * 100);
      return {
        orders: orders.length,
        items: items.length,
        parkingAmountCents: orders.reduce((a, o) => a + cents(o.row.parkingAmount), 0),
        servicesAmountCents: orders.reduce((a, o) => a + cents(o.row.servicesAmount), 0),
        totalAmountCents: orders.reduce((a, o) => a + cents(o.row.totalAmount), 0),
        itemsAmountCents: items.reduce((a, i) => a + cents(i.amount), 0),
        ...opts.readBack,
      };
    },
    async insertAuditLog(entry) {
      calls.push("audit");
      audit.push(entry);
    },
  };
  return { writer, calls, orders, items, audit };
}

describe("applyRecoveryPlan", () => {
  it("insere as ordens e itens do plano, confere os totais e registra em audit_logs", async () => {
    const p = happy();
    const f = fakeWriter();
    const result = await applyRecoveryPlan(f.writer, p, p.planHash, "admin-1", EXPECTED);
    expect(result).toEqual(expect.objectContaining({ insertedOrders: 3, insertedItems: 1, planHash: p.planHash }));
    expect(f.calls).toEqual(["find:3", "insertOrder:A", "insertOrder:B", "insertItems:1", "insertOrder:C", "readBack", "audit"]);
    expect(f.orders.map((o) => o.row.externalId)).toEqual(["A", "B", "C"]);
    expect(f.items[0]).toEqual(expect.objectContaining({ serviceOrderId: "uuid-B", description: "Lavação Silver", amount: "180", quantity: 1, source: "jumppark" }));
    expect(f.audit).toEqual([expect.objectContaining({ actorUserId: "admin-1" })]);
  });

  it("linha gravada = exatamente o que a sincronização gravaria (mesmos campos e valores), sem vínculo de cliente", () => {
    const row = toOrderRow(happy().orders.find((o) => o.persist.externalId === "B")!);
    const p = mapServiceOrderForPersistence(B);
    expect(row).toEqual(expect.objectContaining({ externalId: "B", code: p.code, orderDate: p.orderDate, entryTime: p.entryTime, exitTime: p.exitTime, parkingAmount: "0", servicesAmount: "180", totalAmount: "180", paymentMethod: "Crédito", situation: "Pago", source: "jumppark" }));
    expect(row).not.toHaveProperty("customerId");
    expect(row).not.toHaveProperty("vehicleId");
    expect(row).not.toHaveProperty("partnerId");
  });

  it("hash diferente do aprovado: nada é gravado", async () => {
    const f = fakeWriter();
    await expect(applyRecoveryPlan(f.writer, happy(), "0".repeat(64), "admin-1", EXPECTED)).rejects.toBeInstanceOf(RecoveryAbortedError);
    expect(f.calls).toEqual([]);
  });

  it("plano com bloqueio: nada é gravado", async () => {
    const p = plan({ "2026-09-22": [A, B] });
    const f = fakeWriter();
    await expect(applyRecoveryPlan(f.writer, p, p.planHash, "admin-1", EXPECTED)).rejects.toThrow(/bloqueios/);
    expect(f.calls).toEqual([]);
  });

  it("idempotência: segunda execução encontra as ordens já gravadas e não insere nada", async () => {
    const p = happy();
    const f = fakeWriter({ existing: ["A", "B", "C"] });
    await expect(applyRecoveryPlan(f.writer, p, p.planHash, "admin-1", EXPECTED)).rejects.toThrow(/já existem/);
    expect(f.calls).toEqual(["find:3"]);
  });

  it("conflito no INSERT (ordem criada por outro processo no meio): aborta — o chamador desfaz a transação", async () => {
    const p = happy();
    const f = fakeWriter({ conflictOn: "B" });
    await expect(applyRecoveryPlan(f.writer, p, p.planHash, "admin-1", EXPECTED)).rejects.toThrow(/Conflito/);
    expect(f.calls).not.toContain("audit");
  });

  it("itens gravados parcialmente: aborta", async () => {
    const p = happy();
    await expect(applyRecoveryPlan(fakeWriter({ itemsShort: true }).writer, p, p.planHash, "admin-1", EXPECTED)).rejects.toThrow(/parcialmente/);
  });

  it("conferência pós-gravação divergente: aborta antes do registro de auditoria", async () => {
    const p = happy();
    const f = fakeWriter({ readBack: { totalAmountCents: 1 } });
    await expect(applyRecoveryPlan(f.writer, p, p.planHash, "admin-1", EXPECTED)).rejects.toThrow(/Conferência/);
    expect(f.calls).not.toContain("audit");
  });
});

describe("guarda estrutural — recuperação só insere e não aciona efeitos colaterais", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const files = ["src/lib/integrations/jumppark/gap-recovery.ts", "src/lib/integrations/jumppark/gap-recovery-allowlist.ts", "src/app/api/admin/jumppark-recuperacao/route.ts"].map((f) => [f, readFileSync(path.join(repoRoot, f), "utf-8")] as const);

  it.each(files)("%s", (_name, source) => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // `.update(` de createHash (cálculo de hash) é permitido; UPDATE/DELETE de banco, nunca.
    expect(code).not.toMatch(/\b(tx|db|database|client)\s*\.\s*(update|delete)\s*\(/);
    expect(code).not.toMatch(/\.delete\s*\(/);
    expect(code).not.toMatch(/\.update\s*\(\s*(jumpPark|auditLogs|customers|vehicles|inventory)/);
    expect(code).not.toMatch(/onConflictDoUpdate|\b(update\s+\w+\s+set|delete\s+from|truncate|drop\s+table|alter\s+table)\b/i);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
    for (const forbidden of ["/sync\"", "/backfill", "customersRefresh", "automatic-consumption", "eligible-orders", "service-mapping", "confirmation", "jumpparkPartnerLinking", "historical-theoretical", "@/lib/finance", "@/lib/inventory", "jumpParkSyncLogs", "jumppark_sync_logs", "revalidatePath"]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it("a única tabela de negócio gravada é jumppark_service_orders/itens (+ audit_logs)", () => {
    const code = files[0][1];
    const inserted = [...code.matchAll(/\.insert\((\w+)\)/g)].map((m) => m[1]).sort();
    expect(inserted).toEqual(["auditLogs", "jumpParkServiceOrderItems", "jumpParkServiceOrders"]);
  });
});

describe("simulateGapRecovery / executeGapRecovery (banco falso)", () => {
  // Banco falso no formato do Drizzle: registra cada operação; INSERT explode na simulação.
  function fakeDb(readOnly: "on" | "off" = "on") {
    const log: string[] = [];
    let txOptions: unknown;
    const tx = {
      execute: async (q: { queryChunks?: unknown[] }) => {
        const text = JSON.stringify(q.queryChunks ?? q).toLowerCase();
        if (text.includes("set transaction read only")) { log.push("set read only"); return []; }
        if (text.includes("show transaction_read_only")) { log.push("show"); return [{ transaction_read_only: readOnly }]; }
        log.push("execute");
        return [];
      },
      select: () => ({ from: () => ({ where: async () => { log.push("select"); return []; } }) }),
      insert: () => { log.push("INSERT"); throw new Error("não deveria inserir"); },
    };
    const db = {
      transaction: async (fn: (t: typeof tx) => Promise<unknown>, options?: unknown) => { txOptions = options; return fn(tx); },
    } as unknown as Parameters<typeof import("./gap-recovery").simulateGapRecovery>[0];
    return { db, log, options: () => txOptions };
  }
  const days = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];
  const fetchPage = async (start: string) => ({ data: { content: start === "2026-09-22" ? [A, B] : [] } });

  it("simulação: só GET por dia da janela fixa, Neon READ ONLY conferido, nenhum INSERT", async () => {
    const { simulateGapRecovery } = await import("./gap-recovery");
    const calls: string[] = [];
    const f = fakeDb();
    const p = await simulateGapRecovery(f.db, async (s, e) => { calls.push(`${s}|${e}`); return fetchPage(s); });
    expect(calls).toEqual(days.map((d) => `${d}|${d}`));
    expect(f.log[0]).toBe("set read only");
    expect(f.log[1]).toBe("show");
    expect(f.log).not.toContain("INSERT");
    expect(p.blockers.join(" ")).toMatch(/0 das 46/); // A e B não estão na lista real
  });

  it("simulação aborta se o Neon não confirmar READ ONLY", async () => {
    const { simulateGapRecovery } = await import("./gap-recovery");
    await expect(simulateGapRecovery(fakeDb("off").db, fetchPage)).rejects.toThrow(/READ ONLY/);
  });

  it("gravação: transação SERIALIZABLE e, com ordens fora da lista fixa real, nada é inserido", async () => {
    const { executeGapRecovery } = await import("./gap-recovery");
    const f = fakeDb();
    await expect(executeGapRecovery(f.db, "a".repeat(64), "admin-1", fetchPage)).rejects.toBeInstanceOf(RecoveryAbortedError);
    expect(f.options()).toEqual({ isolationLevel: "serializable" });
    expect(f.log).not.toContain("INSERT");
  });
});
