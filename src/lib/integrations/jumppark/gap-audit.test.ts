import { readFileSync } from "node:fs";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  compareApiWithNeon,
  extractPageMeta,
  loadNeonOrdersReadOnly,
  mergeApiOrders,
  runJumpParkGapAudit,
  toApiSnapshot,
  type NeonOrderSnapshot,
  type ReadOnlyExecutor,
} from "./gap-audit";
import type { JumpParkServiceOrder } from "./types";

function order(over: Partial<JumpParkServiceOrder> = {}): JumpParkServiceOrder {
  return {
    serviceOrderId: "so-1",
    serviceOrderCode: "100",
    entryDateTime: "2026-09-22 10:00:00",
    exitDateTime: "2026-09-22 12:00:00",
    plate: "ABC1D23",
    vehicleModel: "GOL",
    clientName: "CLIENTE REAL",
    clientPhone: "48999990000",
    amount: "20.00",
    amountServices: "0.00",
    totalAmount: 20,
    paymentMethodName: "PIX",
    financialSituationName: "Pago",
    userName: "OPERADOR",
    services: [],
    ...over,
  };
}

function neonFrom(o: JumpParkServiceOrder, over: Partial<NeonOrderSnapshot> = {}): NeonOrderSnapshot {
  const s = toApiSnapshot(o, "x");
  return {
    externalId: s.externalId,
    code: s.code,
    orderDate: s.orderDate,
    entryTime: s.entryTime,
    exitTime: s.exitTime,
    plateMasked: s.plateMasked,
    parkingAmount: s.parkingAmount,
    servicesAmount: s.servicesAmount,
    totalAmount: s.totalAmount,
    discountAmount: s.discountAmount,
    paymentMethod: s.paymentMethod,
    situation: s.situation,
    items: s.items,
    ...over,
  };
}

const merge = (orders: JumpParkServiceOrder[], day = "2026-09-22") => mergeApiOrders([{ day, orders }]).orders;

describe("compareApiWithNeon", () => {
  it("separa ausentes por dia de SAÍDA, com estacionamento e lavação/serviços separados", () => {
    const parking = order({ serviceOrderId: "p1", amount: "25.00", amountServices: "0", totalAmount: 25 });
    const wash = order({ serviceOrderId: "w1", amount: "10.00", amountServices: "180.00", totalAmount: 190, services: [{ description: "SILVER", amount: "180.00" }] });
    const present = order({ serviceOrderId: "ok1" });
    const r = compareApiWithNeon({ from: "2026-09-22", to: "2026-09-22", apiOrders: merge([parking, wash, present]), neonOrders: [neonFrom(present)] });
    expect(r.days).toEqual([
      expect.objectContaining({ day: "2026-09-22", apiOrders: 3, neonOrders: 1, missingOrders: 2, missingParkingAmount: 35, missingServicesAmount: 180, missingTotalAmount: 215, missingWashOrders: 1, divergentOrders: 0 }),
    ]);
    expect(r.missing.map((m) => m.externalId).sort()).toEqual(["p1", "w1"]);
  });

  it("pagamento depois da meia-noite pertence ao dia da saída, com data/hora completas preservadas", () => {
    const late = order({ serviceOrderId: "late", entryDateTime: "2026-09-25 21:47:00", exitDateTime: "2026-09-26 00:30:00" });
    const r = compareApiWithNeon({ from: "2026-09-25", to: "2026-09-26", apiOrders: merge([late], "2026-09-26"), neonOrders: [] });
    expect(r.days.find((d) => d.day === "2026-09-25")!.apiOrders).toBe(0);
    expect(r.days.find((d) => d.day === "2026-09-26")).toEqual(expect.objectContaining({ apiOrders: 1, missingOrders: 1, crossMidnightOrders: 1 }));
    expect(r.missing[0]).toEqual(expect.objectContaining({ entryDateTime: "2026-09-25 21:47:00", exitDateTime: "2026-09-26 00:30:00", exitDate: "2026-09-26", orderDate: "2026-09-25" }));
  });

  it("aponta divergências de valor, itens, forma de pagamento e datas pelo identificador externo", () => {
    const api = order({ serviceOrderId: "d1", amountServices: "200.00", totalAmount: 220, paymentMethodName: "CRÉDITO", services: [{ description: "GOLD", amount: "200.00" }] });
    const neon = neonFrom(order({ serviceOrderId: "d1", amountServices: "180.00", totalAmount: 200, services: [{ description: "SILVER", amount: "180.00" }] }));
    const r = compareApiWithNeon({ from: "2026-09-22", to: "2026-09-22", apiOrders: merge([api]), neonOrders: [neon] });
    expect(r.divergent).toHaveLength(1);
    expect(r.divergent[0].diffs.map((d) => d.field).sort()).toEqual(["items", "paymentMethod", "servicesAmount", "totalAmount"]);
    expect(r.consolidated.divergentOrders).toBe(1);
    expect(r.missing).toEqual([]);
  });

  it("ordem idêntica nas duas fontes não é ausente nem divergente (itens em outra ordem e valores em string/number)", () => {
    const api = order({ services: [{ description: "B", amount: "10" }, { description: "A", amount: 5 }] });
    const neon = neonFrom(order({ services: [{ description: "A", amount: "5.00" }, { description: "B", amount: 10 }] }));
    const r = compareApiWithNeon({ from: "2026-09-22", to: "2026-09-22", apiOrders: merge([api]), neonOrders: [neon] });
    expect(r.consolidated).toEqual(expect.objectContaining({ apiOrders: 1, neonOrders: 1, missingOrders: 0, divergentOrders: 0 }));
  });

  it("ignora ordens em aberto (como a sincronização), lista as fora do período e as que só existem no Neon", () => {
    const open = order({ serviceOrderId: "open", exitDateTime: undefined });
    const outside = order({ serviceOrderId: "out", exitDateTime: "2026-10-05 10:00:00" });
    const neonOnly = neonFrom(order({ serviceOrderId: "only-neon" }));
    const r = compareApiWithNeon({ from: "2026-09-22", to: "2026-09-22", apiOrders: merge([open, outside]), neonOrders: [neonOnly] });
    expect(r.consolidated.openOrdersIgnored).toBe(1);
    expect(r.outsidePeriod).toEqual([{ externalId: "out", exitDateTime: "2026-10-05 10:00:00", inNeon: false }]);
    expect(r.neonOnly.map((o) => o.externalId)).toEqual(["only-neon"]);
  });
});

describe("mergeApiOrders", () => {
  it("não duplica a mesma ordem devolvida em mais de uma consulta diária", () => {
    const o = order({ serviceOrderId: "dup" });
    const { orders, sameIdInSeveralDays } = mergeApiOrders([{ day: "2026-09-22", orders: [o] }, { day: "2026-09-23", orders: [o] }]);
    expect(orders.size).toBe(1);
    expect(orders.get("dup")!.queriedDays).toEqual(["2026-09-22", "2026-09-23"]);
    expect(sameIdInSeveralDays).toBe(1);
  });
});

describe("extractPageMeta", () => {
  it("detecta paginação/limite e guarda só metadados escalares", () => {
    const content = [order(), order({ serviceOrderId: "2" })];
    const meta = extractPageMeta("2026-09-22", { data: { content, totalElements: 5, totalPages: 3, size: 2, last: false, label: "x".repeat(80) } });
    expect(meta.returned).toBe(2);
    expect(meta.possibleTruncation).toBe(true);
    expect(meta.truncationReason).toMatch(/totalElements 5/);
    expect(meta.meta).toEqual({ "data.totalElements": 5, "data.totalPages": 3, "data.size": 2, "data.last": false });
  });

  it("resposta sem metadados de paginação não é marcada como truncada", () => {
    expect(extractPageMeta("d", { data: { content: [order()] } }).possibleTruncation).toBe(false);
  });
});

/** Executor falso: registra cada SQL (texto) na ordem e responde conforme o comando. */
function fakeDb(readOnly: "on" | "off", rows: Record<string, unknown>[] = [], items: Record<string, unknown>[] = []) {
  const dialect = new PgDialect();
  const statements: string[] = [];
  const db: ReadOnlyExecutor = {
    async transaction(fn) {
      return fn({
        async execute(query: SQL) {
          const text = dialect.sqlToQuery(query).sql.replace(/\s+/g, " ").trim().toLowerCase();
          statements.push(text);
          if (text.startsWith("show transaction_read_only")) return [{ transaction_read_only: readOnly }];
          if (text.includes("from jumppark_service_order_items")) return items;
          if (text.includes("from jumppark_service_orders")) return rows;
          return [];
        },
      });
    },
  };
  return { db, statements };
}

describe("loadNeonOrdersReadOnly", () => {
  it("abre READ ONLY, confere antes de ler e só executa SELECT", async () => {
    const { db, statements } = fakeDb("on", [
      { id: "11111111-1111-1111-1111-111111111111", external_id: "so-1", code: "100", order_date: "2026-09-22", entry_time: "10:00", exit_time: "12:00", plate: "ABC1D23", parking_amount: "20.00", services_amount: "0.00", total_amount: "20.00", discount_amount: null, payment_method: "PIX", situation: "Pago" },
    ], [{ service_order_id: "11111111-1111-1111-1111-111111111111", description: "SILVER", amount: "180.00" }]);
    const r = await loadNeonOrdersReadOnly(db, ["so-1"], "2026-09-22", "2026-09-22");
    expect(statements[0]).toBe("set transaction read only");
    expect(statements[1]).toBe("show transaction_read_only");
    for (const s of statements.slice(2)) expect(s.startsWith("select")).toBe(true);
    for (const s of statements) expect(s).not.toMatch(/\b(insert|update|delete|truncate|alter|drop|create)\b/);
    expect(r.transactionReadOnly).toBe("on");
    expect(r.orders[0]).toEqual(expect.objectContaining({ externalId: "so-1", plateMasked: "AB***23", parkingAmount: 20, items: [{ description: "SILVER", amount: 180 }] }));
  });

  it("aborta sem ler nada se o banco não confirmar READ ONLY", async () => {
    const { db, statements } = fakeDb("off");
    await expect(loadNeonOrdersReadOnly(db, ["so-1"], "2026-09-22", "2026-09-22")).rejects.toThrow(/READ ONLY/);
    expect(statements).toEqual(["set transaction read only", "show transaction_read_only"]);
  });
});

describe("runJumpParkGapAudit", () => {
  it("consulta a API só por dia + período, compara e nunca expõe dado pessoal", async () => {
    const calls: Array<[string, string]> = [];
    const missingOrder = order({ serviceOrderId: "m1" });
    const fetchPage = async (start: string, end: string) => {
      calls.push([start, end]);
      return { data: { content: start === "2026-09-22" ? [missingOrder] : [] } };
    };
    const { db } = fakeDb("on");
    const report = await runJumpParkGapAudit("2026-09-21", "2026-09-22", { db, fetchPage, now: () => new Date("2026-10-10T12:00:00Z") });
    expect(calls).toEqual([
      ["2026-09-21", "2026-09-21"],
      ["2026-09-22", "2026-09-22"],
      ["2026-09-21", "2026-09-22"],
    ]);
    expect(report.neonTransactionReadOnly).toBe("on");
    expect(report.consolidated.missingOrders).toBe(1);
    expect(report.pagination.note).toMatch(/menos ordens/); // período devolveu 0 e as diárias, 1
    const json = JSON.stringify(report);
    expect(json).not.toContain("CLIENTE REAL");
    expect(json).not.toContain("48999990000");
    expect(json).not.toContain("ABC1D23");
    expect(json).not.toContain("OPERADOR");
  });

  it("acusa quando a consulta do período traz ordem que as diárias não trouxeram", async () => {
    const fetchPage = async (start: string, end: string) => ({ data: { content: start !== end ? [order({ serviceOrderId: "so-extra" })] : [] } });
    const report = await runJumpParkGapAudit("2026-09-21", "2026-09-22", { db: fakeDb("on").db, fetchPage });
    expect(report.pagination.anyPossibleTruncation).toBe(true);
    expect(report.pagination.note).toMatch(/só apareceram na consulta do período/);
  });
});

describe("guarda estrutural — auditoria é somente leitura", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const files = ["src/lib/integrations/jumppark/gap-audit.ts", "src/app/api/admin/jumppark-auditoria/route.ts"].map((f) => [f, readFileSync(path.join(repoRoot, f), "utf-8")] as const);

  it.each(files)("%s não grava nada nem aciona sincronização/consumo/clientes/financeiro", (_name, source) => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.(insert|update|delete)\s*\(/);
    expect(code).not.toMatch(/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|on\s+conflict|truncate)\b/i);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
    for (const forbidden of ["/sync", "/backfill", "customersRefresh", "automatic-consumption", "eligible-orders", "service-mapping", "confirmation", "@/lib/finance", "@/lib/inventory", "revalidatePath"]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });
});
