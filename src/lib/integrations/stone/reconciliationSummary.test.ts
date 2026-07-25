import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoneCache } from "@/lib/integrations/stone/cache";
import { isPositionStale } from "@/lib/integrations/stone/reconciliationSummary";
import { OFFICIAL_SAMPLE_XML } from "@/lib/integrations/stone/__fixtures__/official-sample";

const ORIGINAL_ENV = { ...process.env };

const EMPTY_FILE_XML = `<Conciliation><Header><GenerationDateTime>20260723053000</GenerationDateTime><StoneCode>900000001</StoneCode><LayoutVersion>2.4</LayoutVersion><FileId>1</FileId><ReferenceDate>20260722</ReferenceDate></Header><WalletPosition><Wallets><Wallet><WalletTypeId>3</WalletTypeId><WalletNatureId>1</WalletNatureId><Category>Default</Category><Amount>0.00</Amount></Wallet></Wallets></WalletPosition><Trailer><CapturedTransactionsQuantity>0</CapturedTransactionsQuantity><CanceledTransactionsQuantity>0</CanceledTransactionsQuantity><PaidInstallmentsQuantity>0</PaidInstallmentsQuantity><ChargedCancellationsQuantity>0</ChargedCancellationsQuantity><ChargebacksQuantity>0</ChargebacksQuantity><ChargebacksRefundQuantity>0</ChargebacksRefundQuantity><ChargedChargebacksQuantity>0</ChargedChargebacksQuantity><PaidChargebacksRefundQuantity>0</PaidChargebacksRefundQuantity><PaidEventsQuantity>0</PaidEventsQuantity><ChargedEventsQuantity>0</ChargedEventsQuantity></Trailer></Conciliation>`;

const NO_WALLET_XML = `<Conciliation><Header><GenerationDateTime>20260723053000</GenerationDateTime><StoneCode>900000001</StoneCode><LayoutVersion>2.2</LayoutVersion><FileId>1</FileId><ReferenceDate>20260722</ReferenceDate></Header><FinancialTransactions><Transaction><Events><CancellationCharges>0</CancellationCharges><Cancellation>0</Cancellation><Captures>1</Captures><ChargebackRefunds>0</ChargebackRefunds><Chargebacks>0</Chargebacks><Payments>1</Payments></Events><AcquirerTransactionKey>NSU-ANON-9001</AcquirerTransactionKey><AuthorizationDateTime>20260722100000</AuthorizationDateTime><CaptureLocalDateTime>20260722100005</CaptureLocalDateTime><International>false</International><AccountType>1</AccountType><InstallmentType>1</InstallmentType><NumberOfInstallments>1</NumberOfInstallments><AuthorizedAmount>10.00</AuthorizedAmount><CapturedAmount>10.00</CapturedAmount><CanceledAmount>0</CanceledAmount><AuthorizationCurrencyCode>986</AuthorizationCurrencyCode><IssuerAuthorizationCode>AUTH9001</IssuerAuthorizationCode><BrandId>1</BrandId><CardNumber>411111******9001</CardNumber><Poi><PoiType>1</PoiType></Poi><EntryMode>1</EntryMode><Installments><Installment><InstallmentNumber>1</InstallmentNumber><GrossAmount>10.00</GrossAmount><NetAmount>9.70</NetAmount><PrevisionPaymentDate>20260723</PrevisionPaymentDate><MdrAmount>0.30</MdrAmount></Installment></Installments></Transaction></FinancialTransactions><Trailer><CapturedTransactionsQuantity>1</CapturedTransactionsQuantity><CanceledTransactionsQuantity>0</CanceledTransactionsQuantity><PaidInstallmentsQuantity>1</PaidInstallmentsQuantity><ChargedCancellationsQuantity>0</ChargedCancellationsQuantity><ChargebacksQuantity>0</ChargebacksQuantity><ChargebacksRefundQuantity>0</ChargebacksRefundQuantity><ChargedChargebacksQuantity>0</ChargedChargebacksQuantity><PaidChargebacksRefundQuantity>0</PaidChargebacksRefundQuantity><PaidEventsQuantity>0</PaidEventsQuantity><ChargedEventsQuantity>0</ChargedEventsQuantity></Trailer></Conciliation>`;

function gzipResponse(status: number, xml: string) {
  const gzipped = gzipSync(Buffer.from(xml, "utf-8"));
  return { ok: status >= 200 && status < 300, status, statusText: String(status), url: "https://conciliation.stone.com.br/mock", redirected: false, headers: { get: () => "application/gzip" }, arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) };
}

function rawBufferResponse(status: number, raw: string) {
  const buf = Buffer.from(raw, "utf-8");
  return { ok: status >= 200 && status < 300, status, statusText: String(status), url: "https://conciliation.stone.com.br/mock", redirected: false, headers: { get: () => null }, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}

function jsonResponse(status: number) {
  return { ok: status >= 200 && status < 300, status, statusText: String(status), url: "https://conciliation.stone.com.br/mock", redirected: false, headers: { get: () => null }, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
}

describe("isPositionStale — pura, sem I/O", () => {
  it("posição de 1 dia atrás não é considerada antiga", () => {
    expect(isPositionStale("2026-07-23", new Date("2026-07-24T12:00:00.000Z"))).toBe(false);
  });

  it("posição de mais de 3 dias é considerada antiga (stale)", () => {
    expect(isPositionStale("2026-07-10", new Date("2026-07-24T12:00:00.000Z"))).toBe(true);
  });
});

describe("buildReconciliationSummary — Sprint 7.0, Z2", () => {
  beforeEach(() => {
    vi.resetModules();
    clearStoneCache();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.STONE_API_KEY;
    delete process.env.STONE_ACCOUNT_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("teste 1 — arquivo oficial completo agrega todos os fatos pedidos corretamente", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary("2026-07-22");
    expect(summary.status).toBe("ok");
    expect(summary.transactionCount).toBe(4);
    expect(summary.grossAmountTotal).toBe(650); // 100+200+300+50
    expect(summary.debitTransactionCount).toBe(2);
    expect(summary.creditTransactionCount).toBe(2);
    expect(summary.installmentSaleCount).toBe(1);
    expect(summary.installmentCount).toBe(6);
    expect(summary.cancellationCount).toBe(1);
    expect(summary.refundCount).toBe(1);
    expect(summary.chargebackCount).toBe(1);
    expect(summary.advanceCount).toBe(1);
    expect(summary.realizedPaymentsCount).toBe(1);
    expect(summary.realizedPaymentsAmountTotal).toBe(397.5);
    expect(summary.pixIncluded).toBe(false);
    expect(summary.transactionExternalKeys).toHaveLength(6);
    expect(summary.terminalSerialNumbers.sort()).toEqual(["TERM-ANON-01", "TERM-ANON-02"]);
  });

  it("teste 2 — arquivo sem WalletPosition devolve financialPosition com status no_data, nunca estimado", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, NO_WALLET_XML)));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary("2026-07-22");
    expect(summary.status).toBe("ok"); // o arquivo em si é válido — só a posição está ausente
    expect(summary.financialPosition.status).toBe("no_data");
    expect(summary.financialPosition.amount).toBeNull();
  });

  it("teste 3 — arquivo vazio (zero transações) é status ok com contagens reais zeradas, nunca no_data", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, EMPTY_FILE_XML)));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary("2026-07-22");
    expect(summary.status).toBe("ok");
    expect(summary.transactionCount).toBe(0);
    expect(summary.grossAmountTotal).toBe(0);
  });

  it("teste 4 — XML inválido (não é XML de verdade) nunca lança, devolve temporary_failure", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, "isto não é xml nem um pouco { } < >")));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary("2026-07-22");
    expect(summary.status).toBe("temporary_failure");
    expect(summary.transactionCount).toBe(0);
  });

  it("teste 5 — gzip inválido (corpo não é um gzip de verdade) nunca lança, devolve temporary_failure", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rawBufferResponse(200, "isto não está gzipado")));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary("2026-07-22");
    expect(summary.status).toBe("temporary_failure");
  });

  it("teste 12 — pagamento previsto sem pagamento realizado (arquivo sem Payments)", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, NO_WALLET_XML)));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary("2026-07-22");
    expect(summary.expectedPaymentsCount).toBeGreaterThan(0);
    expect(summary.realizedPaymentsCount).toBe(0);
  });

  it("teste 13 — pagamento realizado é contado quando Payment.Id está presente", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary("2026-07-22");
    expect(summary.realizedPaymentsCount).toBe(1);
  });

  it("teste 16/17 — posição financeira sempre rotulada honestamente, nunca 'saldo disponível'/'tempo real'", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    // Data de referência = hoje, para testar o rótulo "ok" (não-stale) especificamente —
    // staleness já tem seu próprio teste dedicado logo abaixo.
    const today = new Date().toISOString().slice(0, 10);
    const todayCompact = today.replaceAll("-", "");
    const freshXml = OFFICIAL_SAMPLE_XML.replace("<ReferenceDate>20260722</ReferenceDate>", `<ReferenceDate>${todayCompact}</ReferenceDate>`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, freshXml)));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary(today);
    const serialized = JSON.stringify(summary).toLowerCase();
    // Nunca uma afirmação positiva enganosa — só a negação explícita ("não é.../nunca representa...") é permitida e esperada.
    expect(serialized).not.toContain("saldo disponível");
    expect(serialized).not.toContain("saldo atual");
    expect(serialized).not.toContain("saldo para saque");
    expect(summary.financialPosition.status).toBe("ok");
    expect(summary.financialPosition.limitation.toLowerCase()).toContain("tempo real");
    expect(summary.financialPosition.amount).toBe(5000);
  });

  it("teste 18 — sem credenciais configuradas, devolve not_configured", async () => {
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");
    const summary = await buildReconciliationSummary("2026-07-22");
    expect(summary.status).toBe("not_configured");
    expect(summary.financialPosition.status).toBe("not_configured");
  });

  it("teste 19 — falha da Stone (500) devolve temporary_failure, nunca lança", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500)));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");
    const summary = await buildReconciliationSummary("2026-07-22");
    expect(summary.status).toBe("temporary_failure");
  });

  it("teste 20 — layout não suportado é rejeitado explicitamente, nunca uma chamada inventada", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary("2026-07-22", "XML3_0");
    expect(summary.status).toBe("temporary_failure");
    expect(summary.error).toContain("XML3_0");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("arquivo com data de referência antiga (>3 dias) marca a posição financeira como stale_data, nunca esconde o dado", async () => {
    process.env.STONE_API_KEY = "test-key";
    process.env.STONE_ACCOUNT_ID = "900000001";
    const oldXml = OFFICIAL_SAMPLE_XML.replace("<ReferenceDate>20260722</ReferenceDate>", "<ReferenceDate>20260101</ReferenceDate>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, oldXml)));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");

    const summary = await buildReconciliationSummary("2026-01-01");
    expect(summary.financialPosition.status).toBe("stale_data");
    expect(summary.financialPosition.amount).toBe(5000); // o dado continua visível, só sinalizado
  });

  it("nunca vaza a credencial no resultado", async () => {
    process.env.STONE_API_KEY = "super-secret-stone-key-z2";
    process.env.STONE_ACCOUNT_ID = "900000001";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, OFFICIAL_SAMPLE_XML)));
    const { buildReconciliationSummary } = await import("@/lib/integrations/stone/reconciliationSummary");
    const summary = await buildReconciliationSummary("2026-07-22");
    expect(JSON.stringify(summary)).not.toContain("super-secret-stone-key-z2");
  });
});
