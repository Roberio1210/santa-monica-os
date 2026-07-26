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

function badRequestResponse(contentType: string | null, body: string, arrayBufferOverride?: () => Promise<ArrayBuffer>) {
  let readCount = 0;
  return {
    ok: false,
    status: 400,
    statusText: "400",
    url: FILE_URL,
    redirected: false,
    headers: { get: (name: string) => (contentType && name.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: arrayBufferOverride ?? (async () => {
      readCount += 1;
      if (readCount > 1) throw new Error("body already consumed — response.arrayBuffer() lido mais de uma vez");
      return bufferOf(body);
    }),
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

describe("client.ts — HTTP 400 com evidência real do corpo (Sprint 7.2, decisão do usuário)", () => {
  beforeEach(() => {
    clearStoneCache();
    process.env = { ...ORIGINAL_ENV, STONE_API_KEY: "test-key", STONE_ACCOUNT_ID: "900000001" };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("HTTP 400 JSON com layout inválido → unsupported_layout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(badRequestResponse("application/json", JSON.stringify({ code: "LAYOUT_NOT_SUPPORTED", message: "Layout XML2_4 not supported." })));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.failureDiagnostics?.category).toBe("unsupported_layout");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("HTTP 400 JSON indicando arquivo ainda não publicado → file_not_published_yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(badRequestResponse("application/json", JSON.stringify({ message: "File not yet generated for this reference date." })));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.failureDiagnostics?.category).toBe("file_not_published_yet");
  });

  it("HTTP 400 JSON com data inválida → invalid_reference_date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(badRequestResponse("application/json", JSON.stringify({ message: "Reference date is invalid." })));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.failureDiagnostics?.category).toBe("invalid_reference_date");
  });

  it("HTTP 400 texto simples → interpretado como mensagem, classificado pela evidência", async () => {
    const fetchMock = vi.fn().mockResolvedValue(badRequestResponse("text/plain", "Invalid parameter: affiliationCode"));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.failureDiagnostics?.category).toBe("invalid_request");
  });

  it("HTTP 400 XML → código/mensagem extraídos das tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(badRequestResponse("text/xml", "<Error><Code>LAYOUT</Code><Message>layout inválido para este merchant</Message></Error>"));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.failureDiagnostics?.category).toBe("unsupported_layout");
  });

  it("HTTP 400 com body vazio → upstream_bad_request, nunca inventa uma causa mais específica", async () => {
    const fetchMock = vi.fn().mockResolvedValue(badRequestResponse(null, ""));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.failureDiagnostics?.category).toBe("upstream_bad_request");
    expect(result.error).toBe("A Stone recusou a consulta para este dia. O motivo detalhado não foi informado.");
  });

  it("HTTP 400 com corpo acima de 8 KB nunca lança — trunca e ainda assim classifica pela evidência disponível", async () => {
    const bigMessage = "layout ".repeat(2000); // bem acima de 8KB, sempre contém "layout" perto do início
    const fetchMock = vi.fn().mockResolvedValue(badRequestResponse("application/json", JSON.stringify({ message: bigMessage })));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.status).not.toBe("not_configured");
    expect(result.failureDiagnostics?.category).toBe("unsupported_layout");
  });

  it("HTTP 400 nunca é retryable — uma única chamada, mesmo com corpo indicando falha genérica", async () => {
    const fetchMock = vi.fn().mockResolvedValue(badRequestResponse(null, ""));
    vi.stubGlobal("fetch", fetchMock);

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    await getConciliationFile("2026-07-22");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("o corpo da resposta de erro é lido apenas uma vez — response.arrayBuffer() lançaria na 2ª chamada, então uma classificação bem-sucedida prova leitura única", async () => {
    const response = badRequestResponse("application/json", JSON.stringify({ message: "Invalid parameter" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const { getConciliationFile } = await import("@/lib/integrations/stone/service");
    const result = await getConciliationFile("2026-07-22");

    expect(result.failureDiagnostics?.category).toBe("invalid_request");
  });
});
