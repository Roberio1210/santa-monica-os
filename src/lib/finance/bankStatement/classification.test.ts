import { describe, expect, it } from "vitest";
import { inferBankStatementLineType, initialStatusForType } from "@/lib/finance/bankStatement/classification";

describe("inferBankStatementLineType — sugestão inicial, nunca decisão final", () => {
  it("recebimento de vendas -> recebimento_venda_stone", () => {
    expect(inferBankStatementLineType("Recebimento vendas", "entrada")).toBe("recebimento_venda_stone");
  });

  it("antecipação de crédito -> antecipacao_credito", () => {
    expect(inferBankStatementLineType("Antecipação | Crédito", "entrada")).toBe("antecipacao_credito");
  });

  it("Pix recebido de cliente -> pix_recebido (entrada)", () => {
    expect(inferBankStatementLineType("Pix recebido - João Silva", "entrada")).toBe("pix_recebido");
  });

  it("Pix enviado -> pix_enviado (saída), mesma palavra-chave 'pix' com direção diferente", () => {
    expect(inferBankStatementLineType("Pix enviado - Fornecedor X", "saida")).toBe("pix_enviado");
  });

  it("transferência recebida -> transferencia_entrada", () => {
    expect(inferBankStatementLineType("Transferência recebida", "entrada")).toBe("transferencia_entrada");
  });

  it("transferência enviada -> transferencia_saida", () => {
    expect(inferBankStatementLineType("Transferência enviada", "saida")).toBe("transferencia_saida");
  });

  it("tarifa -> tarifa", () => {
    expect(inferBankStatementLineType("Tarifa de manutenção", "saida")).toBe("tarifa");
  });

  it("mensalidade Stone -> mensalidade_stone, nunca confundida com taxa de MDR", () => {
    expect(inferBankStatementLineType("Mensalidade Stone", "saida")).toBe("mensalidade_stone");
  });

  it("devolução/estorno -> devolucao", () => {
    expect(inferBankStatementLineType("Estorno de venda", "saida")).toBe("devolucao");
  });

  it("descrição sem nenhuma palavra-chave reconhecida -> outro (nunca inventa uma classificação)", () => {
    expect(inferBankStatementLineType("Lançamento diverso XPTO123", "entrada")).toBe("outro");
  });

  it("nunca infere 'aporte' ou 'retirada' automaticamente — sempre exige confirmação humana explícita", () => {
    expect(inferBankStatementLineType("Pix recebido - Sócio Carlos", "entrada")).toBe("pix_recebido");
    expect(inferBankStatementLineType("Transferência recebida - Sócio Carlos", "entrada")).toBe("transferencia_entrada");
  });

  it("Missão Financeiro V2.2 (item 7D, caso real) — rótulo de bandeira de cartão em entrada -> recebimento_venda_stone, mesmo sem 'Recebimento vendas' explícito", () => {
    expect(inferBankStatementLineType("Maestro | Débito / STYLUS CONTABILIDADE", "entrada")).toBe("recebimento_venda_stone");
    expect(inferBankStatementLineType("Visa Electron | Débito / SUL AMERICA COMPANHIA DE", "entrada")).toBe("recebimento_venda_stone");
  });

  it("rótulo de bandeira em SAÍDA nunca é confundido com venda Stone (vendas são sempre entrada)", () => {
    expect(inferBankStatementLineType("Maestro | Débito / ALGUEM", "saida")).not.toBe("recebimento_venda_stone");
  });

  it("Missão Financeiro V2.3 (auditoria gerencial, achado técnico) — 'Pix | Maquininha' (com pipe, como no extrato real) -> recebimento_venda_stone, mesmo com contraparte vizinha colada", () => {
    expect(inferBankStatementLineType("Pix | Maquininha / CELESC DISTRIBUICAO S.A", "entrada")).toBe("recebimento_venda_stone");
    expect(inferBankStatementLineType("RONALD    C JERONIMO / Pix | Maquininha", "entrada")).toBe("recebimento_venda_stone");
    expect(inferBankStatementLineType("Pix Maquininha", "entrada")).toBe("recebimento_venda_stone"); // formato sem pipe continua batendo
  });

  it("'Pix | Maquininha' em SAÍDA nunca é confundido com venda Stone", () => {
    expect(inferBankStatementLineType("Maquininha Stone", "saida")).not.toBe("recebimento_venda_stone");
  });
});

describe("initialStatusForType", () => {
  it("recebimento_venda_stone/antecipacao_credito começam 'nao_conciliado' (aguardam tentativa de conciliação)", () => {
    expect(initialStatusForType("recebimento_venda_stone")).toBe("nao_conciliado");
    expect(initialStatusForType("antecipacao_credito")).toBe("nao_conciliado");
  });

  it("demais tipos começam 'a_classificar'", () => {
    expect(initialStatusForType("pix_recebido")).toBe("a_classificar");
    expect(initialStatusForType("outro")).toBe("a_classificar");
  });
});
