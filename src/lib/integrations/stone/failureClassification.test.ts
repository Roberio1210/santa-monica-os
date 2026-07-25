import { describe, expect, it } from "vitest";
import { classifyBlobHttpFailure, classifyFileHttpFailure, isWithinPublicationLag, sanitizedUrlParts } from "@/lib/integrations/stone/failureClassification";

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

  it("400 → unsupported_layout, nunca retryable", () => {
    expect(classifyFileHttpFailure(400, "20260725", NOW)).toEqual({ category: "unsupported_layout", retryable: false });
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
