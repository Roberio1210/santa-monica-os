import { describe, expect, it } from "vitest";
import {
  classifyBadRequestBody,
  classifyBlobHttpFailure,
  classifyFileHttpFailure,
  isWithinPublicationLag,
  parseErrorBodyEvidence,
  sanitizedUrlParts,
  MAX_ERROR_BODY_BYTES,
} from "@/lib/integrations/stone/failureClassification";

describe("isWithinPublicationLag — Sprint 7.1", () => {
  it("hoje (mesmo dia, poucas horas depois) está dentro da defasagem — arquivo esperado ainda não publicado", () => {
    const now = new Date("2026-07-25T16:16:00.000Z");
    expect(isWithinPublicationLag("20260725", now)).toBe(true);
  });

  it("um dia fechado há mais de 29h não está mais dentro da defasagem", () => {
    const now = new Date("2026-07-25T16:16:00.000Z");
    expect(isWithinPublicationLag("20260701", now)).toBe(false);
  });

  it("referenceDate em formato inválido nunca lança, devolve false", () => {
    expect(isWithinPublicationLag("2026-07-25")).toBe(false);
    expect(isWithinPublicationLag("")).toBe(false);
  });
});

describe("classifyFileHttpFailure — Sprint 7.1, taxonomia de 13 categorias", () => {
  const NOW = new Date("2026-07-25T16:16:00.000Z");

  it("401 → authentication_failure, nunca retryable", () => {
    expect(classifyFileHttpFailure(401, "20260725", NOW)).toEqual({ category: "authentication_failure", retryable: false });
  });

  it("403 → insufficient_permission, nunca retryable", () => {
    expect(classifyFileHttpFailure(403, "20260725", NOW)).toEqual({ category: "insufficient_permission", retryable: false });
  });

  it("400 nunca é classificado aqui (Sprint 7.2) — cai honestamente em unknown_failure, nunca reintroduz a suposição fixa antiga", () => {
    expect(classifyFileHttpFailure(400, "20260725", NOW)).toEqual({ category: "unknown_failure", retryable: false });
  });

  it("404 para o dia de hoje → file_not_published_yet (dentro da defasagem), nunca no_data_expected", () => {
    expect(classifyFileHttpFailure(404, "20260725", NOW)).toEqual({ category: "file_not_published_yet", retryable: false });
  });

  it("404 para um dia antigo já fechado → no_data_expected, nunca file_not_published_yet", () => {
    expect(classifyFileHttpFailure(404, "20260601", NOW)).toEqual({ category: "no_data_expected", retryable: false });
  });

  it("429/500/502/503/504 → temporary_network_failure, sempre retryable", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(classifyFileHttpFailure(status, "20260725", NOW)).toEqual({ category: "temporary_network_failure", retryable: true });
    }
  });

  it("status não mapeado → unknown_failure, nunca retryable", () => {
    expect(classifyFileHttpFailure(418, "20260725", NOW)).toEqual({ category: "unknown_failure", retryable: false });
  });
});

describe("classifyBlobHttpFailure — Sprint 7.1", () => {
  it("429/5xx no blob → blob_download_failure, retryable", () => {
    expect(classifyBlobHttpFailure(503)).toEqual({ category: "blob_download_failure", retryable: true });
  });

  it("401/403/404 no blob (SAS expirado/inválido) → blob_download_failure, nunca retryable", () => {
    expect(classifyBlobHttpFailure(403)).toEqual({ category: "blob_download_failure", retryable: false });
    expect(classifyBlobHttpFailure(404)).toEqual({ category: "blob_download_failure", retryable: false });
  });
});

describe("sanitizedUrlParts — nunca inclui query string (onde vive o token SAS)", () => {
  it("extrai host e path, descarta a query", () => {
    expect(sanitizedUrlParts("https://stoneblob.blob.core.windows.net/files/mock.xml.gz?sig=SECRET&se=2026")).toEqual({
      host: "stoneblob.blob.core.windows.net",
      path: "/files/mock.xml.gz",
    });
  });

  it("URL inválida nunca lança, devolve nulls", () => {
    expect(sanitizedUrlParts("não é uma url")).toEqual({ host: null, path: null });
  });
});

describe("parseErrorBodyEvidence — Sprint 7.2, captura segura do corpo de erro", () => {
  it("JSON com campo 'message' e 'code' reconhecíveis", () => {
    const body = Buffer.from(JSON.stringify({ code: "LAYOUT_NOT_SUPPORTED", message: "Layout XML2_4 not supported for this merchant." }));
    const evidence = parseErrorBodyEvidence("application/json; charset=utf-8", body);
    expect(evidence.upstreamErrorCode).toBe("LAYOUT_NOT_SUPPORTED");
    expect(evidence.upstreamMessage).toBe("Layout XML2_4 not supported for this merchant.");
    expect(evidence.truncated).toBe(false);
  });

  it("JSON ilegível (malformado) nunca lança — evidência vazia", () => {
    const body = Buffer.from("{not valid json");
    const evidence = parseErrorBodyEvidence("application/json", body);
    expect(evidence.upstreamErrorCode).toBeNull();
    expect(evidence.upstreamMessage).toBeNull();
  });

  it("XML com <Message>/<Code> reconhecíveis", () => {
    const body = Buffer.from("<Error><Code>INVALID_DATE</Code><Message>Reference date out of range.</Message></Error>");
    const evidence = parseErrorBodyEvidence("text/xml", body);
    expect(evidence.upstreamErrorCode).toBe("INVALID_DATE");
    expect(evidence.upstreamMessage).toBe("Reference date out of range.");
  });

  it("text/plain usa o próprio texto sanitizado como mensagem", () => {
    const body = Buffer.from("Bad request: invalid parameter");
    const evidence = parseErrorBodyEvidence("text/plain", body);
    expect(evidence.upstreamMessage).toBe("Bad request: invalid parameter");
    expect(evidence.upstreamErrorCode).toBeNull();
  });

  it("body vazio → evidência vazia (upstreamMessage null, bodyPreview vazio)", () => {
    const evidence = parseErrorBodyEvidence("application/json", Buffer.from(""));
    expect(evidence.upstreamMessage).toBeNull();
    expect(evidence.upstreamErrorCode).toBeNull();
    expect(evidence.bodyPreview).toBe("");
  });

  it("body acima de MAX_ERROR_BODY_BYTES é truncado — nunca interpreta além do limite", () => {
    const big = Buffer.from("a".repeat(MAX_ERROR_BODY_BYTES + 5000));
    const evidence = parseErrorBodyEvidence("text/plain", big);
    expect(evidence.truncated).toBe(true);
    expect(evidence.bodyPreview.length).toBeLessThanOrEqual(MAX_ERROR_BODY_BYTES);
  });

  it("token, query string assinada e JWT-like no corpo nunca aparecem em bodyPreview — sempre redigidos", () => {
    const body = Buffer.from("Falha ao validar Authorization=Basic abc123secret; blob=https://x.blob.core.windows.net/f.xml?sig=SUPERSECRETTOKEN&se=2026");
    const evidence = parseErrorBodyEvidence("text/plain", body);
    expect(evidence.bodyPreview).not.toContain("abc123secret");
    expect(evidence.bodyPreview).not.toContain("SUPERSECRETTOKEN");
  });
});

describe("classifyBadRequestBody — Sprint 7.2, classificação de HTTP 400 baseada em evidência real", () => {
  it("mensagem menciona 'layout' → unsupported_layout", () => {
    const evidence = { contentType: "application/json", bodyPreview: "layout not supported", upstreamErrorCode: null, upstreamMessage: "Layout XML2_4 not supported.", truncated: false };
    expect(classifyBadRequestBody(evidence)).toEqual({ category: "unsupported_layout", retryable: false });
  });

  it("mensagem menciona arquivo ainda não publicado/gerado → file_not_published_yet", () => {
    const evidence = { contentType: "application/json", bodyPreview: "", upstreamErrorCode: null, upstreamMessage: "File not yet generated for this reference date.", truncated: false };
    expect(classifyBadRequestBody(evidence)).toEqual({ category: "file_not_published_yet", retryable: false });
  });

  it("mensagem menciona data inválida/fora do intervalo → invalid_reference_date", () => {
    const evidence = { contentType: "application/json", bodyPreview: "", upstreamErrorCode: null, upstreamMessage: "Reference date is invalid.", truncated: false };
    expect(classifyBadRequestBody(evidence)).toEqual({ category: "invalid_reference_date", retryable: false });
  });

  it("mensagem genérica de parâmetro inválido → invalid_request", () => {
    const evidence = { contentType: "application/json", bodyPreview: "", upstreamErrorCode: null, upstreamMessage: "Invalid parameter: affiliationCode.", truncated: false };
    expect(classifyBadRequestBody(evidence)).toEqual({ category: "invalid_request", retryable: false });
  });

  it("corpo vazio/ilegível, sem nenhuma palavra-chave → upstream_bad_request, nunca inventa uma causa mais específica", () => {
    const evidence = { contentType: null, bodyPreview: "", upstreamErrorCode: null, upstreamMessage: null, truncated: false };
    expect(classifyBadRequestBody(evidence)).toEqual({ category: "upstream_bad_request", retryable: false });
  });

  it("corpo com texto sem nenhuma palavra-chave reconhecível → upstream_bad_request", () => {
    const evidence = { contentType: "text/plain", bodyPreview: "algo deu errado por aqui", upstreamErrorCode: null, upstreamMessage: "algo deu errado por aqui", truncated: false };
    expect(classifyBadRequestBody(evidence)).toEqual({ category: "upstream_bad_request", retryable: false });
  });

  it("HTTP 400 nunca é retryable, em nenhuma categoria", () => {
    const evidences = [
      { contentType: null, bodyPreview: "layout", upstreamErrorCode: null, upstreamMessage: "layout invalid", truncated: false },
      { contentType: null, bodyPreview: "", upstreamErrorCode: null, upstreamMessage: null, truncated: false },
    ];
    for (const e of evidences) expect(classifyBadRequestBody(e).retryable).toBe(false);
  });
});
