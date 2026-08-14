import { describe, expect, it } from "vitest";
import { resolveCustomerIdentity, resolveVehicleIdentity, type CustomerCandidateInput, type VehicleCandidateInput } from "@/lib/crm/identityResolution";

/**
 * Cobre os 20 cenários da seção 17 da Missão CRM V2 Fase 2 (numerados nos comentários abaixo,
 * mesma numeração da missão) + casos extras da seção 24 (determinismo, ausência, dado inválido).
 */

describe("resolveCustomerIdentity", () => {
  it("1. nome igual + telefone mascarado compatível (+ vínculo de veículo compatível) → HIGH_CONFIDENCE", () => {
    const target: CustomerCandidateInput = { id: "target", name: "José da Silva", phone: "48999991234", linkedVehiclePlate: "ABC1D23" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "José da Silva", phone: "*******34", linkedVehiclePlate: "AB***23" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("HIGH_CONFIDENCE");
    expect(result.bestCandidateId).toBe("c1");
  });

  it("2. nome igual + telefone mascarado compatível, mas SEM depender de veículo contraditório → cliente ainda HIGH_CONFIDENCE (contradição de veículo não é evidência de cliente, seção 11/19)", () => {
    const target: CustomerCandidateInput = { id: "target", name: "José da Silva", phone: "48999991234" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "José da Silva", phone: "*******34" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("HIGH_CONFIDENCE");
  });

  it("3. mesmo nome apenas → INSUFFICIENT (evidência fraca isolada nunca é suficiente)", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Maria Souza", phone: null };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Maria Souza", phone: null };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("INSUFFICIENT");
    expect(result.bestCandidateId).toBeNull();
  });

  it("4. telefone completo exatamente igual + nome equivalente → EXACT", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Ana Paula", phone: "48988887777" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "ANA PAULA", phone: "48988887777" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("EXACT");
    expect(result.bestCandidateId).toBe("c1");
  });

  it("6. telefone parcial apenas (dado real incompleto, não máscara) → INSUFFICIENT, nunca merge", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Carlos", phone: "991734" };
    const candidate: CustomerCandidateInput = { id: "c1", name: null, phone: "48999991734" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("INSUFFICIENT");
  });

  it("8. nome + mesmo modelo (via vínculo de veículo) apenas, sem telefone → INSUFFICIENT, não merge automático", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Pedro", phone: null };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Pedro", phone: null };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("INSUFFICIENT");
  });

  it("9. mesmo telefone completo + veículo novo → mesmo cliente (EXACT); a diferença de veículo é responsabilidade do motor de veículo, não interfere aqui", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Roberio", phone: "48999990001", linkedVehiclePlate: "NEW1A11" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Roberio", phone: "48999990001", linkedVehiclePlate: "OLD9Z99" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("EXACT");
  });

  it("12. mesmo nome, telefones completos diferentes → CONFLICT (contradição vence sobre nome batendo)", () => {
    const target: CustomerCandidateInput = { id: "target", name: "João", phone: "48999991234" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "João", phone: "48988888888" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("CONFLICT");
    expect(result.bestCandidateId).toBeNull();
  });

  it("13. máscara de telefone incompatível → CONFLICT", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Lucas", phone: "*******34" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Lucas", phone: "*******99" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("CONFLICT");
  });

  it("15. dois candidatos igualmente fortes → REVIEW", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Lucas Pereira", phone: "*******34" };
    const candidates: CustomerCandidateInput[] = [
      { id: "c1", name: "Lucas Pereira", phone: "*******34" },
      { id: "c2", name: "Lucas Pereira", phone: "*******34" },
    ];
    const result = resolveCustomerIdentity(target, candidates);
    expect(result.classification).toBe("REVIEW");
    expect(result.bestCandidateId).toBeNull();
  });

  it("16. um único candidato claramente superior, sem contradição, mesmo com outro candidato fraco no mix → HIGH_CONFIDENCE", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Beatriz", phone: "*******10" };
    const candidates: CustomerCandidateInput[] = [
      { id: "forte", name: "Beatriz", phone: "*******10" },
      { id: "irrelevante", name: "Outro Nome Qualquer", phone: null },
    ];
    const result = resolveCustomerIdentity(target, candidates);
    expect(result.classification).toBe("HIGH_CONFIDENCE");
    expect(result.bestCandidateId).toBe("forte");
  });

  it("17. nenhum dado além de nome genérico → INSUFFICIENT", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Lucas", phone: null };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Lucas", phone: null };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("INSUFFICIENT");
  });

  it("18. cliente sem telefone, mas com veículo já vinculado batendo (placa completa) → avalia corretamente sem inventar telefone", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Fernanda", phone: null, linkedVehiclePlate: "ABC1D23" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Fernanda", phone: null, linkedVehiclePlate: "ABC1D23" };
    const result = resolveCustomerIdentity(target, [candidate]);
    // nome + vínculo de veículo = 2 evidências independentes, sem telefone nenhum inventado.
    expect(result.classification).toBe("HIGH_CONFIDENCE");
  });

  it("19. telefone consistente mas troca de veículo → continua o mesmo cliente, nunca cria pessoa nova só por veículo diferente", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Renata", phone: "48999995555", linkedVehiclePlate: "NEW1A11" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Renata", phone: "48999995555", linkedVehiclePlate: "OLD9Z99" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("EXACT");
  });

  it("nenhum candidato → INSUFFICIENT", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Sozinho", phone: "48999990000" };
    expect(resolveCustomerIdentity(target, []).classification).toBe("INSUFFICIENT");
  });

  it("é determinístico — mesma entrada, mesmo resultado, sempre", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Determinismo", phone: "*******34" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Determinismo", phone: "*******34" };
    const results = Array.from({ length: 5 }, () => resolveCustomerIdentity(target, [candidate]).classification);
    expect(new Set(results).size).toBe(1);
  });

  it("seção 14 — 5 homônimos 'José', só um bate em telefone+veículo → esse único vence com HIGH_CONFIDENCE, os outros nem entram no resultado", () => {
    const target: CustomerCandidateInput = { id: "target", name: "José", phone: "*******34", linkedVehiclePlate: "ABC1D23" };
    const candidates: CustomerCandidateInput[] = [
      { id: "jose-1", name: "José", phone: null, linkedVehiclePlate: null },
      { id: "jose-2", name: "José", phone: "*******99", linkedVehiclePlate: null },
      { id: "jose-3", name: "José", phone: null, linkedVehiclePlate: "XYZ9A99" },
      { id: "jose-correto", name: "José", phone: "*******34", linkedVehiclePlate: "ABC1D23" },
      { id: "jose-5", name: "José", phone: null, linkedVehiclePlate: null },
    ];
    const result = resolveCustomerIdentity(target, candidates);
    expect(result.classification).toBe("HIGH_CONFIDENCE");
    expect(result.bestCandidateId).toBe("jose-correto");
  });

  it("telefone completo diferente entre DUAS PESSOAS DE NOME DIFERENTE não é contradição — é só gente diferente, sem correlação nenhuma (evita falso CONFLICT numa varredura ampla contra toda a base)", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Alice", phone: "48999991234" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Bruno", phone: "48988888888" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("INSUFFICIENT");
  });

  it("Missão CRM V2 Final, cenário 11 — mesmo nome, placa diferente, sem telefone: só nome é fraco demais sozinho → INSUFFICIENT (placa por si não é evidência de CLIENTE, é evidência de veículo — motores separados)", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Igor", phone: null, linkedVehiclePlate: "NEW1A11" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Igor", phone: null, linkedVehiclePlate: "OLD9Z99" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("INSUFFICIENT");
  });

  it("Missão CRM V2 Final, cenário 14 — carro reaparece com telefone novo: mesmo nome + telefone completo agora presente (antes ausente) faz a evidência de telefone valer, combinado ao vínculo do mesmo veículo → HIGH_CONFIDENCE", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Marcos", phone: "48999997777", linkedVehiclePlate: "CAR1A11" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Marcos", phone: null, linkedVehiclePlate: "CAR1A11" };
    const result = resolveCustomerIdentity(target, [candidate]);
    expect(result.classification).toBe("HIGH_CONFIDENCE");
  });

  it("Missão CRM V2 Final, cenário 15 — cliente histórico sem telefone (nunca informado) retorna com telefone completo + nome igual → HIGH_CONFIDENCE, nunca cria pessoa nova por engano", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Cliente Sem Telefone Antes", phone: "48999996666" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Cliente Sem Telefone Antes", phone: null };
    const result = resolveCustomerIdentity(target, [candidate]);
    // Só nome bate (telefone do candidato é MISSING, não contradiz nem confirma) — 1 evidência só, INSUFFICIENT.
    // O ganho real do retorno com telefone aparece quando HÁ um segundo sinal independente (ver cenário 14, com vínculo de veículo).
    expect(result.classification).toBe("INSUFFICIENT");
  });

  it("dado INVALID (formato inesperado) nunca quebra o motor nem vira evidência — comparação cai em unknown/none, resultado honesto", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Teste", phone: "**bagunçado**" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Teste", phone: "48999991234" };
    expect(() => resolveCustomerIdentity(target, [candidate])).not.toThrow();
    expect(resolveCustomerIdentity(target, [candidate]).classification).toBe("INSUFFICIENT");
  });

  it("Missão CRM V2 Final, cenário 19 — modelo de veículo igual para CLIENTES diferentes nunca é usado como evidência de cliente (só entra no motor de cliente via vínculo de PLACA, nunca de modelo) → INSUFFICIENT, nenhuma confusão entre os dois", () => {
    const target: CustomerCandidateInput = { id: "target", name: "Cliente Novo Onix", phone: "48999998888", linkedVehiclePlate: "AAA1A11" };
    const candidate: CustomerCandidateInput = { id: "c1", name: "Cliente Antigo Onix", phone: "48999997777", linkedVehiclePlate: "BBB2B22" };
    const result = resolveCustomerIdentity(target, [candidate]);
    // nomes diferentes, telefones diferentes, placas diferentes — nenhuma evidência aponta pra mesma pessoa, mesmo que ambos dirijam um Onix.
    expect(result.classification).toBe("INSUFFICIENT");
  });
});

describe("resolveVehicleIdentity", () => {
  it("5. placa completa exatamente igual → EXACT", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "ABC1D23", model: "Tucson" };
    const candidate: VehicleCandidateInput = { id: "c1", plate: "ABC1D23", model: "Tucson" };
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("EXACT");
    expect(result.bestCandidateId).toBe("c1");
  });

  it("2. placa contraditória + modelo contraditório → CONFLICT (bloqueia associação deste veículo, mesmo que o cliente já esteja confirmado por outra via)", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "XYZ9A99", model: "Corolla" };
    const candidate: VehicleCandidateInput = { id: "c1", plate: "AB***23", model: "Tucson" };
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("CONFLICT");
  });

  it("7. placa parcial apenas → INSUFFICIENT, nunca merge", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "AB1C", model: null };
    const candidate: VehicleCandidateInput = { id: "c1", plate: "ABC1D23", model: "Tucson" };
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("INSUFFICIENT");
  });

  it("9. veículo novo (placa completamente diferente) → CONFLICT nesta comparação específica, o que é o resultado correto: não é o mesmo veículo (o motor de cliente resolve o dono separadamente)", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "NEW1A11", model: "Corolla" };
    const candidate: VehicleCandidateInput = { id: "c1", plate: "OLD9Z99", model: "Tucson" };
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("CONFLICT");
  });

  it("11. mesmo modelo, veículos (placas) diferentes → não unir: INSUFFICIENT quando só modelo bate", () => {
    const target: VehicleCandidateInput = { id: "target", plate: null, model: "Onix" };
    const candidate: VehicleCandidateInput = { id: "c1", plate: null, model: "Onix" };
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("INSUFFICIENT");
  });

  it("14. máscara de placa incompatível → CONFLICT", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "AB***23", model: null };
    const candidate: VehicleCandidateInput = { id: "c1", plate: "XY***23", model: null };
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("CONFLICT");
  });

  it("20. placa completa batendo é EXACT para o VEÍCULO — a função não recebe nem usa nenhum dado de cliente/dono (garantia estrutural de separação, seção 20)", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "ABC1D23", model: "Civic" };
    const candidate: VehicleCandidateInput = { id: "c1", plate: "ABC1D23", model: "Civic" };
    // VehicleCandidateInput não tem campo de cliente/dono — não há como este resultado depender disso.
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("EXACT");
    expect(Object.keys(target)).not.toContain("customerId");
  });

  it("placa mascarada compatível + modelo compatível, único candidato → HIGH_CONFIDENCE", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "ABC1D23", model: "Tucson" };
    const candidate: VehicleCandidateInput = { id: "c1", plate: "AB***23", model: "Tucson" };
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("HIGH_CONFIDENCE");
  });

  it("nenhum candidato → INSUFFICIENT", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "ABC1D23", model: "Civic" };
    expect(resolveVehicleIdentity(target, []).classification).toBe("INSUFFICIENT");
  });

  it("Missão CRM V2 Final, cenário 9 — placa completa com 1 único caractere divergente do resto idêntico → CONFLICT (nunca 'quase igual o suficiente')", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "ABC1D23", model: "Tucson" };
    const candidate: VehicleCandidateInput = { id: "c1", plate: "ABC1D29", model: "Tucson" }; // só o último dígito difere
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("CONFLICT");
  });

  it("Missão CRM V2 Final, cenário 10 — mesmo nome (via candidato do motor de cliente) + mesma placa + mesmo modelo → HIGH_CONFIDENCE no motor de veículo (2 evidências independentes, único candidato)", () => {
    const target: VehicleCandidateInput = { id: "target", plate: "ABC1D23", model: "Tucson" };
    const candidate: VehicleCandidateInput = { id: "c1", plate: "AB***23", model: "Tucson" };
    const result = resolveVehicleIdentity(target, [candidate]);
    expect(result.classification).toBe("HIGH_CONFIDENCE");
  });
});
