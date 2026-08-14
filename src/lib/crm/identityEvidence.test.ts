import { describe, expect, it } from "vitest";
import { classifyPhoneValue, classifyPlateValue, comparePhoneValues, comparePlateValues, compareModels, compareNames, deriveCustomerIdentityBasis } from "@/lib/crm/identityEvidence";

describe("classifyPhoneValue", () => {
  it("null/vazio vira MISSING", () => {
    expect(classifyPhoneValue(null).classification).toBe("MISSING");
    expect(classifyPhoneValue("").classification).toBe("MISSING");
    expect(classifyPhoneValue("   ").classification).toBe("MISSING");
  });

  it("máscara real com sufixo (7 asteriscos + 2 dígitos) vira MASKED com sufixo conhecido", () => {
    const e = classifyPhoneValue("*******34");
    expect(e.classification).toBe("MASKED");
    expect(e.knownSuffix).toBe("34");
  });

  it("máscara real sem sufixo (7 asteriscos só) vira MASKED sem sufixo conhecido", () => {
    const e = classifyPhoneValue("*******");
    expect(e.classification).toBe("MASKED");
    expect(e.knownSuffix).toBeNull();
  });

  it("telefone completo (8+ dígitos) vira FULL", () => {
    const e = classifyPhoneValue("48999991234");
    expect(e.classification).toBe("FULL");
    expect(e.fullDigits).toBe("48999991234");
    expect(e.knownSuffix).toBe("34");
  });

  it("telefone completo com formatação (parênteses/hífen) ainda vira FULL, dígitos extraídos", () => {
    const e = classifyPhoneValue("(48) 99999-1234");
    expect(e.classification).toBe("FULL");
    expect(e.fullDigits).toBe("48999991234");
  });

  it("dígitos abaixo do mínimo (sem máscara) vira PARTIAL — dado real incompleto, não confundir com máscara", () => {
    const e = classifyPhoneValue("991734");
    expect(e.classification).toBe("PARTIAL");
  });

  it("asterisco em formato não reconhecido vira INVALID — nunca inventa interpretação", () => {
    expect(classifyPhoneValue("**34**99").classification).toBe("INVALID");
  });

  it("texto sem dígito nenhum e sem asterisco vira INVALID", () => {
    expect(classifyPhoneValue("abc").classification).toBe("INVALID");
  });
});

describe("classifyPlateValue", () => {
  it("null/vazio vira MISSING", () => {
    expect(classifyPlateValue(null).classification).toBe("MISSING");
    expect(classifyPlateValue("").classification).toBe("MISSING");
  });

  it("literal 'Não informado' (saída de maskPlate para placa ausente) vira MISSING, não INVALID", () => {
    expect(classifyPlateValue("Não informado").classification).toBe("MISSING");
  });

  it("máscara real (2 + *** + 2) vira MASKED com prefixo/sufixo conhecidos", () => {
    const e = classifyPlateValue("AB***23");
    expect(e.classification).toBe("MASKED");
    expect(e.knownPrefix).toBe("AB");
    expect(e.knownSuffix).toBe("23");
  });

  it("máscara curta ('***' — saída de maskPlate para placa <5 chars) vira MASKED sem caracteres conhecidos", () => {
    const e = classifyPlateValue("***");
    expect(e.classification).toBe("MASKED");
    expect(e.knownPrefix).toBeNull();
  });

  it("placa completa Mercosul vira FULL", () => {
    const e = classifyPlateValue("abc1d23");
    expect(e.classification).toBe("FULL");
    expect(e.fullPlate).toBe("ABC1D23");
  });

  it("placa completa padrão antigo vira FULL", () => {
    const e = classifyPlateValue("ABC-1234");
    expect(e.classification).toBe("FULL");
    expect(e.fullPlate).toBe("ABC1234");
  });

  it("placa curta demais sem máscara vira PARTIAL", () => {
    expect(classifyPlateValue("AB1C").classification).toBe("PARTIAL");
  });

  it("asterisco em formato não reconhecido vira INVALID", () => {
    expect(classifyPlateValue("A*B*C*D").classification).toBe("INVALID");
  });
});

describe("comparePhoneValues", () => {
  it("completo × completo igual: match strong", () => {
    const r = comparePhoneValues(classifyPhoneValue("48999991234"), classifyPhoneValue("48999991234"));
    expect(r).toEqual({ verdict: "match", strength: "strong" });
  });

  it("completo × completo diferente: mismatch strong", () => {
    const r = comparePhoneValues(classifyPhoneValue("48999991234"), classifyPhoneValue("48988888734"));
    expect(r).toEqual({ verdict: "mismatch", strength: "strong" });
  });

  it("completo × mascarado com sufixo compatível: match weak (só 2 dígitos — colisão plausível)", () => {
    const r = comparePhoneValues(classifyPhoneValue("48999991234"), classifyPhoneValue("*******34"));
    expect(r).toEqual({ verdict: "match", strength: "weak" });
  });

  it("completo × mascarado com sufixo incompatível: mismatch strong — sufixo real conhecido dos dois lados, diferente é contradição determinística", () => {
    const r = comparePhoneValues(classifyPhoneValue("48999991299"), classifyPhoneValue("*******34"));
    expect(r).toEqual({ verdict: "mismatch", strength: "strong" });
  });

  it("mascarado × mascarado com mesmo sufixo: match weak", () => {
    const r = comparePhoneValues(classifyPhoneValue("*******34"), classifyPhoneValue("*******34"));
    expect(r).toEqual({ verdict: "match", strength: "weak" });
  });

  it("mascarado × mascarado com sufixo diferente: mismatch strong", () => {
    const r = comparePhoneValues(classifyPhoneValue("*******34"), classifyPhoneValue("*******99"));
    expect(r).toEqual({ verdict: "mismatch", strength: "strong" });
  });

  it("parcial × completo: unknown — sem base real para comparar formato parcial ainda não visto nos dados", () => {
    const r = comparePhoneValues(classifyPhoneValue("991734"), classifyPhoneValue("48999991734"));
    expect(r.verdict).toBe("unknown");
  });

  it("ausente × qualquer coisa: unknown", () => {
    expect(comparePhoneValues(classifyPhoneValue(null), classifyPhoneValue("48999991234")).verdict).toBe("unknown");
    expect(comparePhoneValues(classifyPhoneValue(null), classifyPhoneValue("*******34")).verdict).toBe("unknown");
  });

  it("máscara sem sufixo (7 asteriscos só) × qualquer coisa: unknown — nenhum dígito real conhecido", () => {
    expect(comparePhoneValues(classifyPhoneValue("*******"), classifyPhoneValue("48999991234")).verdict).toBe("unknown");
  });

  it("é determinístico — mesma entrada, mesmo resultado, sempre", () => {
    const results = Array.from({ length: 5 }, () => comparePhoneValues(classifyPhoneValue("*******34"), classifyPhoneValue("48999991234")));
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });
});

describe("comparePlateValues", () => {
  it("completa × completa igual: match strong", () => {
    const r = comparePlateValues(classifyPlateValue("ABC1D23"), classifyPlateValue("ABC1D23"));
    expect(r).toEqual({ verdict: "match", strength: "strong" });
  });

  it("completa × completa diferente: mismatch strong", () => {
    const r = comparePlateValues(classifyPlateValue("ABC1D23"), classifyPlateValue("XYZ9A99"));
    expect(r).toEqual({ verdict: "mismatch", strength: "strong" });
  });

  it("completa × mascarada compatível: match moderate", () => {
    const r = comparePlateValues(classifyPlateValue("ABC1D23"), classifyPlateValue("AB***23"));
    expect(r).toEqual({ verdict: "match", strength: "moderate" });
  });

  it("completa × mascarada contraditória no prefixo: mismatch strong", () => {
    const r = comparePlateValues(classifyPlateValue("XYZ9A99"), classifyPlateValue("AB***23"));
    expect(r).toEqual({ verdict: "mismatch", strength: "strong" });
  });

  it("mascarada × mascarada compatível: match moderate", () => {
    const r = comparePlateValues(classifyPlateValue("AB***23"), classifyPlateValue("AB***23"));
    expect(r).toEqual({ verdict: "match", strength: "moderate" });
  });

  it("mascarada × mascarada com sufixo diferente: mismatch strong", () => {
    const r = comparePlateValues(classifyPlateValue("AB***23"), classifyPlateValue("AB***99"));
    expect(r).toEqual({ verdict: "mismatch", strength: "strong" });
  });

  it("parcial × completa: unknown", () => {
    expect(comparePlateValues(classifyPlateValue("AB1C"), classifyPlateValue("ABC1D23")).verdict).toBe("unknown");
  });

  it("ausente × qualquer coisa: unknown", () => {
    expect(comparePlateValues(classifyPlateValue(null), classifyPlateValue("ABC1D23")).verdict).toBe("unknown");
  });
});

describe("compareNames", () => {
  it("nomes iguais após normalização conservadora (trim/case/espaços): match", () => {
    expect(compareNames("José da Silva", "  JOSÉ   DA SILVA ")).toBe("match");
  });

  it("nomes diferentes: mismatch", () => {
    expect(compareNames("José da Silva", "José Pereira")).toBe("mismatch");
  });

  it("nome ausente de um dos lados: unknown", () => {
    expect(compareNames(null, "José")).toBe("unknown");
    expect(compareNames("José", null)).toBe("unknown");
  });
});

describe("compareModels", () => {
  it("modelos iguais após normalização conservadora: match", () => {
    expect(compareModels("hyundai tucson", "HYUNDAI TUCSON")).toBe("match");
  });

  it("modelos com formatos reais diferentes da base ('HB20' vs 'Hyundai HB20') NÃO são unificados — sem fuzzy/substring", () => {
    expect(compareModels("HB20", "Hyundai HB20")).toBe("mismatch");
  });

  it("modelo ausente de um dos lados: unknown", () => {
    expect(compareModels(null, "Tucson")).toBe("unknown");
  });
});

describe("deriveCustomerIdentityBasis — Missão CRM V2 Final, regra especial dos clientes sem telefone", () => {
  it("telefone completo → base 'telefone'", () => {
    expect(deriveCustomerIdentityBasis("48999991234", true)).toBe("telefone");
  });

  it("telefone mascarado com sufixo real → ainda conta como base 'telefone' (sinal utilizável)", () => {
    expect(deriveCustomerIdentityBasis("*******34", false)).toBe("telefone");
  });

  it("sem telefone (nunca informado), mas com veículo vinculado → 'veiculo_sem_telefone', cliente continua válido", () => {
    expect(deriveCustomerIdentityBasis(null, true)).toBe("veiculo_sem_telefone");
  });

  it("máscara vazia (7 asteriscos sem dígito real) conta como 'sem telefone', não como sinal utilizável", () => {
    expect(deriveCustomerIdentityBasis("*******", true)).toBe("veiculo_sem_telefone");
  });

  it("sem telefone e sem veículo → 'sem_evidencia'", () => {
    expect(deriveCustomerIdentityBasis(null, false)).toBe("sem_evidencia");
  });
});
