import { describe, expect, it } from "vitest";
import { fetchOrderById, fetchOrders, listDistinctStatuses, parseOrdersQueryFilters } from "@/lib/integrations/jumppark/ordersQuery";

/**
 * `fetchOrders`/`fetchOrderById`/`listDistinctStatuses` dependem de Postgres real (Neon) — vitest
 * nunca carrega `.env.local` (mesma decisão já documentada em `zezinho/tools/executor.test.ts`),
 * então aqui travamos o comportamento determinístico "banco não configurado" (nunca lança, nunca
 * inventa dado). A validação real de filtro/paginação/ordenação contra dado real foi feita ao
 * vivo contra o Neon de produção (ver relatório da missão) — mockar Postgres só para simular
 * filtro SQL não agregaria confiança real.
 */
describe("parseOrdersQueryFilters", () => {
  it("aplica página 1 e ordenação por data desc por padrão", () => {
    const filters = parseOrdersQueryFilters({});
    expect(filters.page).toBe(1);
    expect(filters.sortBy).toBe("date");
    expect(filters.sortDir).toBe("desc");
    expect(filters.dateFrom).toBeNull();
  });

  it("nunca aceita página menor que 1", () => {
    expect(parseOrdersQueryFilters({ page: "0" }).page).toBe(1);
    expect(parseOrdersQueryFilters({ page: "-5" }).page).toBe(1);
    expect(parseOrdersQueryFilters({ page: "abc" }).page).toBe(1);
  });

  it("aceita página válida", () => {
    expect(parseOrdersQueryFilters({ page: "3" }).page).toBe(3);
  });

  it("só aceita sort=amount como alternativa a date; qualquer outro valor cai em date", () => {
    expect(parseOrdersQueryFilters({ sort: "amount" }).sortBy).toBe("amount");
    expect(parseOrdersQueryFilters({ sort: "xyz" }).sortBy).toBe("date");
  });

  it("só aceita dir=asc como alternativa a desc", () => {
    expect(parseOrdersQueryFilters({ dir: "asc" }).sortDir).toBe("asc");
    expect(parseOrdersQueryFilters({ dir: "xyz" }).sortDir).toBe("desc");
  });

  it("campos de busca vazios ou só espaço viram null, nunca string vazia", () => {
    const filters = parseOrdersQueryFilters({ cliente: "   ", placa: "", veiculo: undefined });
    expect(filters.clientQuery).toBeNull();
    expect(filters.plateQuery).toBeNull();
    expect(filters.vehicleQuery).toBeNull();
  });

  it("preserva valores reais informados, com trim", () => {
    const filters = parseOrdersQueryFilters({ cliente: "  Maria Silva  ", from: "2026-08-01", to: "2026-08-05", status: "Pago" });
    expect(filters.clientQuery).toBe("Maria Silva");
    expect(filters.dateFrom).toBe("2026-08-01");
    expect(filters.dateTo).toBe("2026-08-05");
    expect(filters.status).toBe("Pago");
  });
});

describe("fetchOrders / fetchOrderById / listDistinctStatuses sem banco configurado", () => {
  it("fetchOrders nunca lança e retorna lista vazia com databaseConfigured=false", async () => {
    const result = await fetchOrders(parseOrdersQueryFilters({}));
    expect(result.databaseConfigured).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("fetchOrderById retorna null, nunca lança", async () => {
    await expect(fetchOrderById("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
  });

  it("listDistinctStatuses retorna lista vazia, nunca inventa status", async () => {
    await expect(listDistinctStatuses()).resolves.toEqual([]);
  });
});
