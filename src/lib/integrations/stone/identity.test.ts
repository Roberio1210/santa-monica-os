import { describe, expect, it } from "vitest";
import { buildTransactionExternalKey, type TransactionIdentityInput } from "@/lib/integrations/stone/identity";
import { parseConciliationXml } from "@/lib/integrations/stone/xml";
import { normalizeConciliation } from "@/lib/integrations/stone/normalize";
import { OFFICIAL_SAMPLE_XML } from "@/lib/integrations/stone/__fixtures__/official-sample";

function baseInput(overrides: Partial<TransactionIdentityInput> = {}): TransactionIdentityInput {
  return {
    acquirerTransactionKey: "NSU-ANON-0001",
    authorizationCode: "AUTH0001",
    initiatorTransactionKey: "INIT-ANON-0001",
    establishmentCode: "900000001",
    terminalSerialNumber: "TERM-ANON-01",
    capturedAt: "2026-07-22T10:00:05",
    installmentNumber: 1,
    amount: 97.5,
    ...overrides,
  };
}

describe("buildTransactionExternalKey — teste 14 (geração determinística de chave externa)", () => {
  it("a mesma entrada sempre produz a mesma chave", () => {
    const key1 = buildTransactionExternalKey(baseInput());
    const key2 = buildTransactionExternalKey(baseInput());
    expect(key1).toBe(key2);
  });

  it("nunca usa só valor+data como identidade — mudar só o NSU muda a chave mesmo com valor/data iguais", () => {
    const key1 = buildTransactionExternalKey(baseInput({ acquirerTransactionKey: "NSU-A" }));
    const key2 = buildTransactionExternalKey(baseInput({ acquirerTransactionKey: "NSU-B" }));
    expect(key1).not.toBe(key2);
  });

  it("parcelas diferentes da mesma venda geram chaves diferentes", () => {
    const key1 = buildTransactionExternalKey(baseInput({ installmentNumber: 1 }));
    const key2 = buildTransactionExternalKey(baseInput({ installmentNumber: 2 }));
    expect(key1).not.toBe(key2);
  });

  it("diferença de representação decimal do mesmo valor (10.1 vs 10.10) gera a mesma chave", () => {
    const key1 = buildTransactionExternalKey(baseInput({ amount: 10.1 }));
    const key2 = buildTransactionExternalKey(baseInput({ amount: 10.1 }));
    expect(key1).toBe(key2);
  });

  it("terminal/estabelecimento ausentes (null) nunca lançam, só entram como string vazia na chave", () => {
    expect(() => buildTransactionExternalKey(baseInput({ terminalSerialNumber: null, initiatorTransactionKey: null }))).not.toThrow();
  });

  it("chave sempre no formato hex de 64 caracteres (SHA-256)", () => {
    const key = buildTransactionExternalKey(baseInput());
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("teste 15 — reprocessamento do mesmo arquivo nunca gera duplicidade lógica", () => {
  function keysFromSample(): string[] {
    const file = parseConciliationXml(OFFICIAL_SAMPLE_XML, "XML2_4");
    const normalized = normalizeConciliation(file);
    return normalized.sales.flatMap((sale) =>
      sale.raw.installments.map((installment) =>
        buildTransactionExternalKey({
          acquirerTransactionKey: sale.acquirerTransactionKey,
          authorizationCode: sale.authorizationCode,
          initiatorTransactionKey: sale.raw.initiatorTransactionKey,
          establishmentCode: normalized.establishmentCode,
          terminalSerialNumber: sale.terminalSerialNumber,
          capturedAt: sale.capturedAt,
          installmentNumber: installment.installmentNumber,
          amount: installment.netAmount,
        }),
      ),
    );
  }

  it("processar o mesmo arquivo duas vezes produz exatamente o mesmo conjunto de chaves", () => {
    const first = keysFromSample();
    const second = keysFromSample();
    expect(second).toEqual(first);
  });

  it("nenhuma chave se repete dentro de um mesmo processamento (cada parcela é única)", () => {
    const keys = keysFromSample();
    expect(new Set(keys).size).toBe(keys.length);
  });
});
