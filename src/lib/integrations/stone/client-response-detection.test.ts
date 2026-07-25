import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoneCache } from "@/lib/integrations/stone/cache";
import { OFFICIAL_SAMPLE_XML } from "@/lib/integrations/stone/__fixtures__/official-sample";

const ORIGINAL_ENV = { ...process.env };

function bufferOf(text: string) {
  const buf = Buffer.from(text, "utf-8");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function jsonPointerResponse(blobUrl: string) {
  return {
    ok: true,
    status: 200,
    statusText: "200",
    url: "https://conciliation.stone.com.br/v2/merchant/900000001/conciliation-file/20260722",
    redirected: false,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null) },
    arrayBuffer: async () => bufferOf(JSON.stringify({ url: blobUrl })),
  };
}

function blobGzipResponse(xml: string) {
  const gzipped = gzipSync(Buffer.from(xml, "utf-8"));
  return {
    ok: true,
    status: 200,
    statusText: "200",
    url: "https://stoneblob.blob.core.windows.net/files/mock.xml.gz?sig=SECRET",
    redirected: false,
    headers: { get: () => "application/octet-stream" },
    arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength),
  };
}

function blobXmlResponse(xml: string) {
  return {
    ok: true,
    status: 200,
    statusText: "200",
    url: "https://stoneblob.blob.core.windows.net/files/mock.xml?sig=SECRET",
    redirected: false,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/xml" : null) },
    arrayBuffer: async () => bufferOf(xml),
  };
}

function directGzipResponse(xml: string) {
  const gzipped = gzipSync(Buffer.from(xml, "utf-8"));
  return {
    ok: true,
    status: 200,
    statusText: "200",
    url: "https://conciliation.stone.com.br/v2/merchant/900000001/conciliation-file/20260722",
    redirected: false,
    headers: { get: () => "application/gzip" },
    arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength),
  };
}

function directXmlResponse(xml: string) {
  return {
    ok: true,
    status: 200,
    statusText: "200",
    url: "https://conciliation.stone.com.br/v2/merchant/900000001/conciliation-file/20260722",
    redirected: false,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/xml; charset=utf-8" : null) },
    arrayBuffer: async () => bufferOf(xml),
  };
}

function unrecognizedResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "200",
    url: "https://conciliation.stone.com.br/v2/merchant/900000001/conciliation-file/20260722",
    redirected: false,
    headers: { get: () => null },
    arrayBuffer: async () => bufferOf("nem gzip nem xml nem json"),
  };
}

describe("client.ts — detecção robusta do formato de resposta (achado do diagnóstico de produção)", () => {
  beforeEach(() => {
    clearStoneCache();
    process.env = { ...ORIGINAL_ENV, STONE_API_KEY: "test-key", STONE_ACCOUNT_ID: "900000001" };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("resposta JSON com ponteiro de blob → segunda requisição → blob gzip → sucesso", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonPointerResponse("https://stoneblob.blob.core.windows.net/files/mock.xml.gz?sig=SECRET"))
      .mockResolvedValueOnce(blobGzipResponse(OFFICIAL_SAMPLE_XML));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.status).toBe("ok");
    expect(result.file).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // A segunda chamada deve ir para a URL do blob, sem cabeçalho Authorization da Stone.
    const secondCallHeaders = fetchMock.mock.calls[1][1]?.headers;
    expect(secondCallHeaders).toBeUndefined();
  });

  it("resposta JSON com ponteiro de blob → segunda requisição → blob XML direto (sem gzip) → sucesso", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonPointerResponse("https://stoneblob.blob.core.windows.net/files/mock.xml?sig=SECRET"))
      .mockResolvedValueOnce(blobXmlResponse(OFFICIAL_SAMPLE_XML));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");
    expect(result.status).toBe("ok");
    expect(result.file).not.toBeNull();
  });

  it("compatibilidade preservada: resposta gzip direta (comportamento documentado original) continua funcionando", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(directGzipResponse(OFFICIAL_SAMPLE_XML)));
    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");
    expect(result.status).toBe("ok");
  });

  it("XML direto sem compressão (content-type xml) é aceito sem tentar descompactar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(directXmlResponse(OFFICIAL_SAMPLE_XML)));
    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");
    expect(result.status).toBe("ok");
  });

  it("JSON sem nenhum campo de URL reconhecível nunca lança — vira temporary_failure honesto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonPointerResponse("")));
    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    // URL vazia: extractBlobUrl exige length > 0, então cai no "não encontrou URL"
    const result = await getConciliationFile("2026-07-22");
    expect(result.status).toBe("temporary_failure");
    expect(result.file).toBeNull();
  });

  it("URL de blob não-HTTPS é rejeitada, nunca seguida", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonPointerResponse("http://stoneblob.blob.core.windows.net/files/mock.xml.gz")));
    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");
    expect(result.status).toBe("temporary_failure");
  });

  it("ponteiro de blob apontando para outro ponteiro de blob é recusado (nunca segue indefinidamente)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonPointerResponse("https://stoneblob.blob.core.windows.net/files/pointer2.json"))
      .mockResolvedValueOnce(jsonPointerResponse("https://stoneblob.blob.core.windows.net/files/pointer3.json"));
    vi.stubGlobal("fetch", fetchMock);
    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");
    expect(result.status).toBe("temporary_failure");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("formato não reconhecido (nem gzip, nem xml, nem json) nunca lança, vira temporary_failure honesto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unrecognizedResponse()));
    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");
    expect(result.status).toBe("temporary_failure");
  });

  it("Content-Type ausente/genérico ainda é detectado como gzip por assinatura de bytes (magic number)", async () => {
    const gzipped = gzipSync(Buffer.from(OFFICIAL_SAMPLE_XML, "utf-8"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "200",
        url: "https://conciliation.stone.com.br/v2/merchant/900000001/conciliation-file/20260722",
        redirected: false,
        headers: { get: () => null },
        arrayBuffer: async () => gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength),
      }),
    );
    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");
    expect(result.status).toBe("ok");
  });
});
