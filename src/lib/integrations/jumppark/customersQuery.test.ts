import { describe, expect, it } from "vitest";
import { fetchCustomerById, fetchCustomers, parseCustomersQueryFilters } from "@/lib/integrations/jumppark/customersQuery";

/**
 * Mesmo padrão de `ordersQuery.test.ts`: `fetchCustomers`/`fetchCustomerById` dependem de Postgres
 * real (Neon), então aqui travamos o comportamento determinístico "banco não configurado" (nunca
 * lança, nunca inventa dado). A validação real de filtro/paginação/ordenação/detalhe/segmentos
 * contra dado real foi feita ao vivo contra o Neon de produção (ver relatórios das Missões 26 e 29).
 */
const SEGMENT_PERIOD = { from: "2026-07-01", to: "2026-07-31" };

describe("parseCustomersQueryFilters", () => {
  it("aplica página 1 e ordenação por última visita desc por padrão", () => {
    const filters = parseCustomersQueryFilters({}, SEGMENT_PERIOD);
    expect(filters.page).toBe(1);
    expect(filters.sortBy).toBe("lastVisit");
    expect(filters.sortDir).toBe("desc");
    expect(filters.nameQuery).toBeNull();
    expect(filters.segment).toBeNull();
    expect(filters.segmentPeriod).toEqual(SEGMENT_PERIOD);
  });

  it("nunca aceita página menor que 1", () => {
    expect(parseCustomersQueryFilters({ page: "0" }, SEGMENT_PERIOD).page).toBe(1);
    expect(parseCustomersQueryFilters({ page: "-5" }, SEGMENT_PERIOD).page).toBe(1);
    expect(parseCustomersQueryFilters({ page: "abc" }, SEGMENT_PERIOD).page).toBe(1);
  });

  it("aceita totalSpent/visitCount/averageTicket/vehicleCount como sort; qualquer outro valor cai em lastVisit", () => {
    expect(parseCustomersQueryFilters({ sort: "totalSpent" }, SEGMENT_PERIOD).sortBy).toBe("totalSpent");
    expect(parseCustomersQueryFilters({ sort: "visitCount" }, SEGMENT_PERIOD).sortBy).toBe("visitCount");
    expect(parseCustomersQueryFilters({ sort: "averageTicket" }, SEGMENT_PERIOD).sortBy).toBe("averageTicket");
    expect(parseCustomersQueryFilters({ sort: "vehicleCount" }, SEGMENT_PERIOD).sortBy).toBe("vehicleCount");
    expect(parseCustomersQueryFilters({ sort: "xyz" }, SEGMENT_PERIOD).sortBy).toBe("lastVisit");
  });

  it("só aceita dir=asc como alternativa a desc", () => {
    expect(parseCustomersQueryFilters({ dir: "asc" }, SEGMENT_PERIOD).sortDir).toBe("asc");
    expect(parseCustomersQueryFilters({ dir: "xyz" }, SEGMENT_PERIOD).sortDir).toBe("desc");
  });

  it("campo de busca vazio ou só espaço vira null, nunca string vazia", () => {
    expect(parseCustomersQueryFilters({ cliente: "   " }, SEGMENT_PERIOD).nameQuery).toBeNull();
    expect(parseCustomersQueryFilters({ cliente: "" }, SEGMENT_PERIOD).nameQuery).toBeNull();
    expect(parseCustomersQueryFilters({ cliente: undefined }, SEGMENT_PERIOD).nameQuery).toBeNull();
  });

  it("preserva valor real informado, com trim", () => {
    expect(parseCustomersQueryFilters({ cliente: "  Maria Silva  " }, SEGMENT_PERIOD).nameQuery).toBe("Maria Silva");
  });

  it("aceita um segmento válido conhecido", () => {
    expect(parseCustomersQueryFilters({ segmento: "vip" }, SEGMENT_PERIOD).segment).toBe("vip");
    expect(parseCustomersQueryFilters({ segmento: "sem_retorno_45" }, SEGMENT_PERIOD).segment).toBe("sem_retorno_45");
  });

  it("segmento desconhecido ou ausente vira null, nunca inventa um segmento", () => {
    expect(parseCustomersQueryFilters({ segmento: "inexistente" }, SEGMENT_PERIOD).segment).toBeNull();
    expect(parseCustomersQueryFilters({}, SEGMENT_PERIOD).segment).toBeNull();
  });
});

describe("fetchCustomers / fetchCustomerById sem banco configurado", () => {
  it("fetchCustomers nunca lança e retorna lista vazia com databaseConfigured=false", async () => {
    const result = await fetchCustomers(parseCustomersQueryFilters({}, SEGMENT_PERIOD));
    expect(result.databaseConfigured).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("fetchCustomerById retorna null, nunca lança", async () => {
    await expect(fetchCustomerById("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
  });
});
