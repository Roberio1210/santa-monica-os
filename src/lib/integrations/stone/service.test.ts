import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoneCache } from "@/lib/integrations/stone/cache";

const ORIGINAL_ENV = { ...process.env };

const MINIMAL_XML = `<Conciliation><Header><GenerationDateTime>20260721053000</GenerationDateTime><StoneCode>1</StoneCode><LayoutVersion>2.4</LayoutVersion><FileId>1</FileId><ReferenceDate>20260720</ReferenceDate></Header><WalletPosition><Wallets><Wallet><WalletTypeId>3</WalletTypeId><WalletNatureId>1</WalletNatureId><Category>Default</Category><Amount>1000.00</Amount></Wallet></Wallets></WalletPosition><Trailer><CapturedTransactionsQuantity>0</CapturedTransactionsQuantity><CanceledTransactionsQuantity>0</CanceledTransactionsQuantity><PaidInstallmentsQuantity>0</PaidInstallmentsQuantity><ChargedCancellationsQuantity>0</ChargedCancellationsQuantity><ChargebacksQuantity>0</ChargebacksQuantity><ChargebacksRefundQuantity>0</ChargebacksRefundQuantity><ChargedChargebacksQuantity>0</ChargedChargebacksQuantity><PaidChargebacksRefundQuantity>0</PaidChargebacksRefundQuantity><PaidEventsQuantity>0</PaidEventsQuantity><ChargedEventsQuantity>0</ChargedEventsQuantity></Trailer></Conciliation>`;

const NO_WALLET_XML = `<Conciliation><Header><GenerationDateTime>20260721053000</GenerationDateTime><StoneCode>1</StoneCode><LayoutVersion>2.2</LayoutVersion><FileId>1</FileId><ReferenceDate>20260720</ReferenceDate></Header><Trailer><CapturedTransactionsQuantity>0</CapturedTransactionsQuantity><CanceledTransactionsQuantity>0</CanceledTransactionsQuantity><PaidInstallmentsQuantity>0</PaidInstallmentsQuantity><ChargedCancellationsQuantity>0</ChargedCancellationsQuantity><ChargebacksQuantity>0</ChargebacksQuantity><ChargebacksRefundQuantity>0</ChargebacksRefundQuantity><ChargedChargebacksQuantity>0</ChargedChargebacksQuantity><PaidChargebacksRefundQuantity>0</PaidChargebacksRefundQuantity><PaidEventsQuantity>0</PaidEventsQuantity><ChargedEventsQuantity>0</ChargedEventsQuantity></Trailer></Conciliation>`;

function gzipResponse(status: number, xml: string) {
  const gzipped = gzipSync(Buffer.from(xml, "utf-8"));
  return { ok: status >= 200 && status < 300, status, statusText: String(status), arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) };
}

function jsonResponse(status: number) {
  return { ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
}

describe("Stone service — Sprint 7.0, Z1 (mesmo padrão de weather/service.test.ts)", () => {
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

  describe("getConciliationFile", () => {
    it("sem credenciais configuradas, devolve not_configured — nunca inventa dado", async () => {
      const { getConciliationFile } = await import("@/lib/integrations/stone/service");
      const result = await getConciliationFile("2026-07-20");
      expect(result.status).toBe("not_configured");
      expect(result.file).toBeNull();
    });

    it("com credenciais e resposta ok, devolve o arquivo parseado e cacheia (dia fechado nunca refaz a chamada)", async () => {
      process.env.STONE_API_KEY = "test-key";
      process.env.STONE_ACCOUNT_ID = "123456789";
      const fetchMock = vi.fn().mockResolvedValue(gzipResponse(200, MINIMAL_XML));
      vi.stubGlobal("fetch", fetchMock);

      const { getConciliationFile } = await import("@/lib/integrations/stone/service");
      const first = await getConciliationFile("2020-01-01");
      expect(first.status).toBe("ok");
      expect(first.file?.header.stoneCode).toBe("1");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const second = await getConciliationFile("2020-01-01");
      expect(second.status).toBe("ok");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("401/403 devolve insufficient_permission", async () => {
      process.env.STONE_API_KEY = "test-key";
      process.env.STONE_ACCOUNT_ID = "123456789";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401)));
      const { getConciliationFile } = await import("@/lib/integrations/stone/service");
      const result = await getConciliationFile("2020-01-01");
      expect(result.status).toBe("insufficient_permission");
    });

    it("404 (arquivo ainda não gerado) devolve no_data", async () => {
      process.env.STONE_API_KEY = "test-key";
      process.env.STONE_ACCOUNT_ID = "123456789";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404)));
      const { getConciliationFile } = await import("@/lib/integrations/stone/service");
      const result = await getConciliationFile("2026-07-24");
      expect(result.status).toBe("no_data");
    });

    it("429/500/503 devolve temporary_failure, nunca lança", async () => {
      process.env.STONE_API_KEY = "test-key";
      process.env.STONE_ACCOUNT_ID = "123456789";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(503)));
      const { getConciliationFile } = await import("@/lib/integrations/stone/service");
      const result = await getConciliationFile("2020-01-01");
      expect(result.status).toBe("temporary_failure");
      expect(result.file).toBeNull();
    });

    it("nunca expõe a chave de API no resultado", async () => {
      process.env.STONE_API_KEY = "super-secret-stone-key";
      process.env.STONE_ACCOUNT_ID = "123456789";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, MINIMAL_XML)));
      const { getConciliationFile } = await import("@/lib/integrations/stone/service");
      const result = await getConciliationFile("2020-01-01");
      expect(JSON.stringify(result)).not.toContain("super-secret-stone-key");
    });
  });

  describe("getWalletPosition — nunca chamado de saldo em tempo real", () => {
    it("sem credenciais, devolve not_configured", async () => {
      const { getWalletPosition } = await import("@/lib/integrations/stone/service");
      const result = await getWalletPosition("2026-07-20");
      expect(result.status).toBe("not_configured");
      expect(result.positions).toEqual([]);
    });

    it("com posição no arquivo, devolve ok com referenceDate/processedAt e a limitação explícita sobre não ser saldo em tempo real", async () => {
      process.env.STONE_API_KEY = "test-key";
      process.env.STONE_ACCOUNT_ID = "123456789";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, MINIMAL_XML)));
      const { getWalletPosition } = await import("@/lib/integrations/stone/service");
      const result = await getWalletPosition("2026-07-20");
      expect(result.status).toBe("ok");
      expect(result.positions).toEqual([{ walletTypeId: 3, walletNatureId: 1, category: "Default", amount: 1000 }]);
      expect(result.referenceDate).toBe("2026-07-20");
      expect(result.processedAt).not.toBeNull();
      expect(result.limitations.some((l) => l.toLowerCase().includes("tempo real"))).toBe(true);
    });

    it("arquivo sem WalletPosition (ex.: Layout 2.2) devolve no_data, nunca estima saldo", async () => {
      process.env.STONE_API_KEY = "test-key";
      process.env.STONE_ACCOUNT_ID = "123456789";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(gzipResponse(200, NO_WALLET_XML)));
      const { getWalletPosition } = await import("@/lib/integrations/stone/service");
      const result = await getWalletPosition("2026-07-20");
      expect(result.status).toBe("no_data");
      expect(result.positions).toEqual([]);
    });
  });

  describe("requestPixFile — fluxo assíncrono, só o pedido nesta checkpoint", () => {
    it("sem credenciais, devolve not_configured", async () => {
      const { requestPixFile } = await import("@/lib/integrations/stone/service");
      const result = await requestPixFile("12345678000199", "2026-07-20");
      expect(result.status).toBe("not_configured");
    });

    it("202 aceito devolve status requested", async () => {
      process.env.STONE_API_KEY = "test-key";
      process.env.STONE_ACCOUNT_ID = "123456789";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(202)));
      const { requestPixFile } = await import("@/lib/integrations/stone/service");
      const result = await requestPixFile("12345678000199", "2026-07-20");
      expect(result.status).toBe("requested");
    });

    it("falha da Stone devolve temporary_failure, nunca lança", async () => {
      process.env.STONE_API_KEY = "test-key";
      process.env.STONE_ACCOUNT_ID = "123456789";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500)));
      const { requestPixFile } = await import("@/lib/integrations/stone/service");
      const result = await requestPixFile("12345678000199", "2026-07-20");
      expect(result.status).toBe("temporary_failure");
    });
  });
});
