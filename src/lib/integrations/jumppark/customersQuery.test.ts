import { describe, expect, it } from "vitest";
import { fetchCustomerById, fetchCustomers, parseCustomersQueryFilters } from "@/lib/integrations/jumppark/customersQuery";

/**
 * Mesmo padrão de `ordersQuery.test.ts`: `fetchCustomers`/`fetchCustomerById` dependem de Postgres
 * real (Neon), então aqui travamos o comportamento determinístico "banco não configurado" (nunca
 * lança, nunca inventa dado). A validação real de filtro/paginação/ordenação/detalhe contra dado
 * real foi feita ao vivo contra o Neon de produção (ver relatório da Missão 26, terceira entrega).
 */
describe("parseCustomersQueryFilters", () => {
  it("aplica página 1 e ordenação por última visita desc por padrão", () => {
    const filters = parseCustomersQueryFilters({});
    expect(filters.page).toBe(1);
    expect(filters.sortBy).toBe("lastVisit");
    expect(filters.sortDir).toBe("desc");
    expect(filters.nameQuery).toBeNull();
  });

  it("nunca aceita página menor que 1", () => {
    expect(parseCustomersQueryFilters({ page: "0" }).page).toBe(1);
    expect(parseCustomersQueryFilters({ page: "-5" }).page).toBe(1);
    expect(parseCustomersQueryFilters({ page: "abc" }).page).toBe(1);
  });

  it("só aceita sort=totalSpent ou sort=visitCount como alternativa a lastVisit; qualquer outro valor cai em lastVisit", () => {
    expect(parseCustomersQueryFilters({ sort: "totalSpent" }).sortBy).toBe("totalSpent");
    expect(parseCustomersQueryFilters({ sort: "visitCount" }).sortBy).toBe("visitCount");
    expect(parseCustomersQueryFilters({ sort: "xyz" }).sortBy).toBe("lastVisit");
  });

  it("só aceita dir=asc como alternativa a desc", () => {
    expect(parseCustomersQueryFilters({ dir: "asc" }).sortDir).toBe("asc");
    expect(parseCustomersQueryFilters({ dir: "xyz" }).sortDir).toBe("desc");
  });

  it("campo de busca vazio ou só espaço vira null, nunca string vazia", () => {
    expect(parseCustomersQueryFilters({ cliente: "   " }).nameQuery).toBeNull();
    expect(parseCustomersQueryFilters({ cliente: "" }).nameQuery).toBeNull();
    expect(parseCustomersQueryFilters({ cliente: undefined }).nameQuery).toBeNull();
  });

  it("preserva valor real informado, com trim", () => {
    expect(parseCustomersQueryFilters({ cliente: "  Maria Silva  " }).nameQuery).toBe("Maria Silva");
  });
});

describe("fetchCustomers / fetchCustomerById sem banco configurado", () => {
  it("fetchCustomers nunca lança e retorna lista vazia com databaseConfigured=false", async () => {
    const result = await fetchCustomers(parseCustomersQueryFilters({}));
    expect(result.databaseConfigured).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("fetchCustomerById retorna null, nunca lança", async () => {
    await expect(fetchCustomerById("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
  });
});
