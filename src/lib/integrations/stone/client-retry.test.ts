import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoneCache } from "@/lib/integrations/stone/cache";
import { OFFICIAL_SAMPLE_XML } from "@/lib/integrations/stone/__fixtures__/official-sample";

const ORIGINAL_ENV = { ...process.env };
const FILE_URL = "https://conciliation.stone.com.br/v2/merchant/900000001/conciliation-file/20260722";

function bufferOf(text: string) {
  const buf = Buffer.from(text, "utf-8");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function gzipHttpResponse(status: number) {
  const gzipped = gzipSync(Buffer.from(OFFICIAL_SAMPLE_XML, "utf-8"));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    url: FILE_URL,
    redirected: false,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/gzip" : null) },
    arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength),
  };
}

function errorHttpResponse(status: number) {
  return {
    ok: false,
    status,
    statusText: String(status),
    url: FILE_URL,
    redirected: false,
    headers: { get: () => null },
    arrayBuffer: async () => bufferOf(""),
  };
}

function jsonPointerResponse(blobUrl: string) {
  return {
    ok: true,
    status: 200,
    statusText: "200",
    url: FILE_URL,
    redirected: false,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null) },
    arrayBuffer: async () => bufferOf(JSON.stringify({ url: blobUrl })),
  };
}

function blobErrorResponse(status: number, url: string) {
  return {
    ok: false,
    status,
    statusText: String(status),
    url,
    redirected: false,
    headers: { get: () => null },
    arrayBuffer: async () => bufferOf(""),
  };
}

function invalidXmlHttpResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "200",
    url: FILE_URL,
    redirected: false,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/xml" : null) },
    arrayBuffer: async () => bufferOf("<NotAConciliationFile><Foo>bar</Foo></NotAConciliationFile>"),
  };
}

describe("client.ts — retry seguro e classificação de falha (Sprint 7.1, Etapa 6 e 8)", () => {
  beforeEach(() => {
    clearStoneCache();
    process.env = { ...ORIGINAL_ENV, STONE_API_KEY: "test-key", STONE_ACCOUNT_ID: "900000001" };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("HTTP 429 seguido de sucesso → nova tentativa automática, resultado ok", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errorHttpResponse(429)).mockResolvedValueOnce(gzipHttpResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("HTTP 503 duas vezes seguido de sucesso na 3ª tentativa (limite MAX_ATTEMPTS=3) → resultado ok", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errorHttpResponse(503)).mockResolvedValueOnce(errorHttpResponse(503)).mockResolvedValueOnce(gzipHttpResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("HTTP 401 nunca tenta de novo — falha imediata classificada como authentication_failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorHttpResponse(401));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.status).toBe("insufficient_permission");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.failureDiagnostics?.category).toBe("authentication_failure");
    expect(result.failureDiagnostics?.attemptCount).toBe(1);
  });

  it("HTTP 403 nunca tenta de novo — falha imediata classificada como insufficient_permission", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorHttpResponse(403));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.status).toBe("insufficient_permission");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.failureDiagnostics?.category).toBe("insufficient_permission");
    expect(result.failureDiagnostics?.attemptCount).toBe(1);
  });

  it("URL de blob expirada (403 no download do blob) nunca tenta de novo — blob_download_failure", async () => {
    const blobUrl = "https://stoneblob.blob.core.windows.net/files/mock.xml.gz?sig=EXPIRED";
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonPointerResponse(blobUrl)).mockResolvedValueOnce(blobErrorResponse(403, blobUrl));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.failureDiagnostics?.category).toBe("blob_download_failure");
    expect(result.failureDiagnostics?.attemptCount).toBe(1);
  });

  it("XML inválido (sem Header reconhecível) nunca tenta de novo — classificado como invalid_xml", async () => {
    const fetchMock = vi.fn().mockResolvedValue(invalidXmlHttpResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.failureDiagnostics?.category).toBe("invalid_xml");
    expect(result.failureDiagnostics?.stage).toBe("xml_parsing");
  });

  it("nunca loga a API key nem a query string (SAS) da URL de blob, mesmo com retry", async () => {
    const blobUrl = "https://stoneblob.blob.core.windows.net/files/mock.xml.gz?sig=SUPER_SECRET_TOKEN";
    const fetchMock = vi.fn().mockResolvedValueOnce(errorHttpResponse(429)).mockResolvedValueOnce(jsonPointerResponse(blobUrl)).mockResolvedValueOnce(gzipHttpResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    await getConciliationFile("2026-07-22");

    const allLoggedText = [...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].map((args) => args.join(" ")).join("\n");
    expect(allLoggedText).not.toContain("test-key");
    expect(allLoggedText).not.toContain("SUPER_SECRET_TOKEN");
    expect(allLoggedText).not.toContain("Authorization");
  });
});
