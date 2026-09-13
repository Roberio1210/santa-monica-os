import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/integrations/stone/service", () => ({ getConciliationFile: vi.fn() }));

// Missão 67 — nunca deve nem ser possível chamar isto: mocks que explodem se a rota algum dia
// importar/chamar qualquer camada de escrita. Não são "espiados" no sentido de esperar chamada —
// o objetivo é provar ausência (a suíte falharia imediatamente se a rota os invocasse).
vi.mock("@/lib/finance/bankStatement/repository-factory", () => ({
  getBankStatementRepository: () => {
    throw new Error("NUNCA deveria ser chamado pela rota de diagnóstico Stone.");
  },
}));
vi.mock("@/lib/integrations/stone/persistence/repository-factory", () => ({
  getStonePersistenceRepository: () => {
    throw new Error("NUNCA deveria ser chamado pela rota de diagnóstico Stone.");
  },
}));
vi.mock("@/lib/integrations/stone/persistence/importRun", () => ({
  syncStonePeriod: () => {
    throw new Error("NUNCA deveria ser chamado pela rota de diagnóstico Stone.");
  },
}));

import { GET } from "@/app/api/admin/stone-payload-diagnostic/route";
import { getCurrentUser } from "@/lib/auth/session";
import { getConciliationFile } from "@/lib/integrations/stone/service";
import type { StoneConciliationResult } from "@/lib/integrations/stone/types";

/**
 * Missão 67 — prova, por teste, de que a rota diagnóstica temporária (Missão 66) nunca expõe
 * secret/XML bruto, nunca aceita parâmetro além de `referenceDate`, nunca é alcançável sem sessão
 * admin real, e nunca toca em nenhuma camada de persistência (Stone, extrato, conciliação,
 * classificação, caixa, período contábil). `getConciliationFile` é sempre mockado — nenhum teste
 * aqui faz uma chamada de rede real à Stone.
 */

function request(url: string): Request {
  return new Request(url);
}

function fullMockResult(overrides: Partial<StoneConciliationResult> = {}): StoneConciliationResult {
  return {
    status: "ok",
    error: null,
    collectedAt: "2026-09-13T12:00:00.000Z",
    limitations: [],
    referenceDate: "2026-09-08",
    failureDiagnostics: null,
    file: {
      header: { generationDateTime: "20260908050000", stoneCode: "900000001", layoutVersion: "2.4", fileId: "f1", referenceDate: "20260908" },
      financialTransactions: [
        {
          events: {} as never,
          acquirerTransactionKey: "SALE-SECRET-KEY-0001",
          initiatorTransactionKey: null,
          authorizationDateTime: "20260908120000",
          captureLocalDateTime: "20260908120000",
          international: false,
          accountType: "1",
          installmentType: "1",
          numberOfInstallments: 1,
          authorizedAmount: 100,
          capturedAmount: 100,
          canceledAmount: 0,
          authorizationCurrencyCode: 986,
          issuerAuthorizationCode: "AUTH01",
          brandId: 1,
          cardNumber: "411111******1111",
          poi: { serialNumber: "TERM01" } as never,
          entryMode: "chip" as never,
          cancellations: [],
          installments: [
            { installmentNumber: 1, grossAmount: 100, netAmount: 97, previsionPaymentDate: "20260909", saleFee: null, mdrAmount: 3, originalPaymentDate: null, suspendedByChargeback: null, chargeback: null, chargebackRefund: null },
          ],
        },
      ],
      financialEvents: [],
      financialTransactionsAccounts: [
        {
          events: {} as never,
          acquirerTransactionKey: "SALE-SECRET-KEY-0001",
          initiatorTransactionKey: null,
          authorizationDateTime: "20260907120000",
          captureLocalDateTime: "20260907120000",
          poi: { serialNumber: "TERM01" } as never,
          cancellations: [],
          installments: [
            { installmentNumber: 1, grossAmount: 100, netAmount: 97, paymentDate: "20260908", advanceRateAmount: null, mdrAmount: 3, saleFee: null, advancedReceivableOriginalPaymentDate: null, paymentId: "PAY-SECRET-01", chargeback: null, chargebackRefund: null },
          ],
        },
      ],
      financialEventsAccounts: [],
      payments: [],
      walletPositions: [],
      trailer: {} as never,
      layout: "XML2_4",
    },
    ...overrides,
  };
}

describe("GET /api/admin/stone-payload-diagnostic — Missão 67", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(getConciliationFile).mockReset();
  });

  it("1) sem sessão -> 401, nunca consulta a Stone", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08"));
    expect(res.status).toBe(401);
    expect(getConciliationFile).not.toHaveBeenCalled();
  });

  it("2) sessão operacional -> 403, nunca consulta a Stone", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "v@example.com", name: "Vinicius", role: "operacional" });
    const res = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08"));
    expect(res.status).toBe(403);
    expect(getConciliationFile).not.toHaveBeenCalled();
  });

  it("3) sessão admin -> consulta permitida (200)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "r@example.com", name: "Robério", role: "admin" });
    vi.mocked(getConciliationFile).mockResolvedValue(fullMockResult());
    const res = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08"));
    expect(res.status).toBe(200);
    expect(getConciliationFile).toHaveBeenCalledWith("2026-09-08", "XML2_4");
  });

  it("4) referenceDate válida (YYYY-MM-DD) é aceita", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "r@example.com", name: "Robério", role: "admin" });
    vi.mocked(getConciliationFile).mockResolvedValue(fullMockResult());
    const res = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08"));
    expect(res.status).toBe(200);
  });

  it("5) referenceDate inválida -> 400, nunca consulta a Stone", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "r@example.com", name: "Robério", role: "admin" });
    const res = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=amanha"));
    expect(res.status).toBe(400);
    expect(getConciliationFile).not.toHaveBeenCalled();
  });

  it("referenceDate ausente -> 400", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "r@example.com", name: "Robério", role: "admin" });
    const res = await GET(request("https://x/api/admin/stone-payload-diagnostic"));
    expect(res.status).toBe(400);
  });

  it("6) fromDate/toDate (ou qualquer outro parâmetro) nunca ampliam a consulta -> 400", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "r@example.com", name: "Robério", role: "admin" });
    const res1 = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08&fromDate=2026-09-01"));
    expect(res1.status).toBe(400);
    const res2 = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08&toDate=2026-09-13"));
    expect(res2.status).toBe(400);
    const res3 = await GET(request("https://x/api/admin/stone-payload-diagnostic?fromDate=2026-09-01&toDate=2026-09-13"));
    expect(res3.status).toBe(400);
    expect(getConciliationFile).not.toHaveBeenCalled();
  });

  it("7/8/9/10) resposta nunca contém secret, Authorization, XML bruto ou qualquer chave fora do allowlist", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "r@example.com", name: "Robério", role: "admin" });
    vi.mocked(getConciliationFile).mockResolvedValue(fullMockResult());
    const res = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08"));
    const body = await res.json();
    const serialized = JSON.stringify(body);

    // nunca a chave real de venda/liquidação nem o id de pagamento, em nenhum lugar da resposta
    expect(serialized).not.toContain("SALE-SECRET-KEY-0001");
    expect(serialized).not.toContain("PAY-SECRET-01");
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized.toLowerCase()).not.toContain("stone_api_key");
    expect(serialized).not.toContain("<?xml");
    expect(serialized).not.toContain("<FinancialTransactions");

    const allowedTopLevel = new Set(["referenceDate", "status", "error", "hasFinancialTransactionsAccountsSection", "salesCount", "settlementsInstallmentCount", "expectedPayments", "settlements"]);
    for (const key of Object.keys(body)) expect(allowedTopLevel.has(key)).toBe(true);

    const allowedExpectedPaymentKeys = new Set(["acquirerTransactionKeyMasked", "installmentNumber", "grossAmount", "netAmount", "previsionPaymentDate", "originalPaymentDate"]);
    for (const ep of body.expectedPayments) for (const key of Object.keys(ep)) expect(allowedExpectedPaymentKeys.has(key)).toBe(true);

    const allowedSettlementKeys = new Set(["acquirerTransactionKeyMasked", "installmentNumber", "netAmount", "paymentDate", "advanceRateAmount", "advancedReceivableOriginalPaymentDate"]);
    for (const s of body.settlements) for (const key of Object.keys(s)) expect(allowedSettlementKeys.has(key)).toBe(true);

    // identificador mascarado: nunca igual ao valor real, mesmo comprimento curto e determinístico
    expect(body.expectedPayments[0].acquirerTransactionKeyMasked).not.toBe("SALE-SECRET-KEY-0001");
    expect(body.expectedPayments[0].acquirerTransactionKeyMasked).toBe(body.settlements[0].acquirerTransactionKeyMasked); // mesma chave real -> mesmo mascaramento, permite correlação
  });

  it("11) erro da Stone chega sanitizado (nunca upstreamMessage cru)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "r@example.com", name: "Robério", role: "admin" });
    vi.mocked(getConciliationFile).mockResolvedValue({
      status: "temporary_failure",
      error: "Não foi possível consultar a Stone agora — falha temporária de rede.",
      collectedAt: "2026-09-13T12:00:00.000Z",
      limitations: ["Categoria: temporary_network_failure (etapa: file_request, tentativas: 3)."],
      referenceDate: "2026-09-08",
      failureDiagnostics: null,
      file: null,
    });
    const res = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08"));
    const body = await res.json();
    expect(res.status).toBe(200); // a rota nunca lança — reflete o status sanitizado do próprio service.ts
    expect(body.status).toBe("temporary_failure");
    expect(body.error).toBe("Não foi possível consultar a Stone agora — falha temporária de rede.");
    expect(body.settlements).toEqual([]);
  });

  it("12) Cache-Control: no-store em toda resposta (sucesso, erro, 401, 403, 400)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res401 = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08"));
    expect(res401.headers.get("cache-control")).toBe("no-store");

    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "v@example.com", name: "Vinicius", role: "operacional" });
    const res403 = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08"));
    expect(res403.headers.get("cache-control")).toBe("no-store");

    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u2", email: "r@example.com", name: "Robério", role: "admin" });
    const res400 = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=invalida"));
    expect(res400.headers.get("cache-control")).toBe("no-store");

    vi.mocked(getConciliationFile).mockResolvedValue(fullMockResult());
    const res200 = await GET(request("https://x/api/admin/stone-payload-diagnostic?referenceDate=2026-09-08"));
    expect(res200.headers.get("cache-control")).toBe("no-store");
  });

  it("13/14) a rota nunca importa nem chama nenhuma camada de escrita (Stone, extrato, conciliação, caixa, período contábil)", async () => {
    // Prova estática, direta no arquivo-fonte: nenhum destes símbolos aparece como import na rota.
    const routeSourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "route.ts");
    const source = readFileSync(routeSourcePath, "utf8");

    const forbidden = [
      "persistence/repository-factory",
      "persistence/postgres-repository",
      "persistence/importRun",
      "bankStatement/repository-factory",
      "bankStatement/postgres-repository",
      "bankStatement/importService",
      "bankStatement/lineProcessingService",
      "bankStatement/classification",
      "upsertNormalizedTransactions",
      "createCashMovement",
      "accounting_periods",
      "startImportRun",
    ];
    for (const symbol of forbidden) expect(source).not.toContain(symbol);

    // E também em runtime: se por acaso a rota tentasse chamar qualquer uma dessas fábricas
    // mockadas no topo deste arquivo, elas lançam — o teste 3 (200 com sucesso) já prova que a
    // execução completa (RBAC -> validação -> Stone -> sanitização -> resposta) não passa por elas.
  });
});
