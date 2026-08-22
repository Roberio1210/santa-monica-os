import { describe, expect, it } from "vitest";
import { isStoneNativeCsvFormat, parseStoneNativeBankStatementCsv } from "@/lib/finance/bankStatement/stoneNativeCsvFormat";
import { parseBankStatementCsv } from "@/lib/finance/bankStatement/csvFormat";

const HEADER = "Movimentação,Tipo,Valor,Saldo antes,Saldo depois,Tarifa,Data,Horário,Situação,Nosso Número,Destino,Destino Documento,Destino Instituição,Destino Agência,Destino Conta,Origem,Origem Documento,Origem Instituição,Origem Agência,Origem Conta,Descrição";

/** Linhas reais extraídas do "Comprovante de Extrato" da Stone fornecido na Missão V6.2 (ago/2026). */
const RECEBIVEL_ROW =
  'Crédito,Recebível de Cartão,"253,13","R$ 562,97","R$ 816,10","R$ 0,00",21/08/2026 08:24,08:24:09.828,FINISHED,,R. B. E. ESTACIONAMENTO LTDA,57.878.430/0001-28,Stone Instituição de Pagamento S.A.,0001,46975747-0,Desconhecido,Desconhecido,Desconhecido,Desconhecido,Desconhecido,';
const TRANSFERENCIA_ROW =
  'Crédito,Transferência entre contas Stone,"1.098,15","R$ 2.352,78","R$ 3.450,93","R$ 0,00",21/08/2026 03:03,03:03:03.874,Recebida,,R. B. E. ESTACIONAMENTO LTDA,57.878.430/0001-28,Stone Instituição de Pagamento S.A.,0001,46975747-0,Stone Principal,16.501.555/0001-57,STONE INSTITUIÇÃO DE PAGAMENTO S.A.,0001,30772-8,';
const PIX_SAIDA_ROW =
  'Débito,Pix,"-125,00","R$ 661,69","R$ 536,69",Grátis,21/08/2026 11:17,11:17:07.801,Enviado,,Gabriel de Abreu Goncalves da Silva,***.369.289-**,NU PAGAMENTOS S.A. - INSTITUIÇÃO DE PAGAMENTO,Desconhecido,Desconhecido,R. B. E. ESTACIONAMENTO LTDA,57.878.430/0001-28,Stone Instituição de Pagamento S.A.,0001,46975747-0,';
const TRANSACAO_ROW =
  'Crédito,Transação,"45,00","R$ 40,09","R$ 84,87","R$ 0,22",20/08/2026 22:56,22:56:20.026,FINISHED,,R. B. E. ESTACIONAMENTO LTDA,57.878.430/0001-28,Stone Instituição de Pagamento S.A.,0001,46975747-0,DAIANA LETICIA PARISOTTO,***.694.099-**,CAIXA ECONOMICA FEDERAL,Desconhecido,Desconhecido,';
const PAGAMENTO_ROW =
  'Débito,Pagamento,"-283,07","R$ 1.036,15","R$ 753,08",Grátis,21/08/2026 08:10,08:10:36.985,Enviado,,VERISURE BRASIL,11.660.106/0001-38,BANCO ITAU S.A.,Desconhecido,Desconhecido,R. B. E. ESTACIONAMENTO LTDA,57.878.430/0001-28,Stone Instituição de Pagamento S.A.,0001,46975747-0,';

describe("isStoneNativeCsvFormat", () => {
  it("reconhece o cabeçalho real do Comprovante de Extrato da Stone", () => {
    expect(isStoneNativeCsvFormat(`${HEADER}\n${RECEBIVEL_ROW}`)).toBe(true);
  });

  it("nunca reconhece o formato genérico (data/descricao/valor/tipo) como nativo", () => {
    expect(isStoneNativeCsvFormat("data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,100,entrada")).toBe(false);
  });
});

describe("parseStoneNativeBankStatementCsv", () => {
  it("Recebível de Cartão: data sem horário, direção entrada, valor real, descrição reconstruída", () => {
    const [line] = parseStoneNativeBankStatementCsv(`${HEADER}\n${RECEBIVEL_ROW}`);
    expect(line.date).toBe("2026-08-21");
    expect(line.direction).toBe("entrada");
    expect(line.amount).toBe(253.13);
    expect(line.description).toBe("Recebível de Cartão");
    expect(line.counterparty).toBeNull(); // Origem = "Desconhecido", nunca vira contraparte
    expect(line.errors).toEqual([]);
  });

  it("Transferência entre contas Stone: contraparte 'Stone Principal' embutida na descrição (permite a classificação distinguir de transferência genérica)", () => {
    const [line] = parseStoneNativeBankStatementCsv(`${HEADER}\n${TRANSFERENCIA_ROW}`);
    expect(line.amount).toBe(1098.15);
    expect(line.counterparty).toBe("Stone Principal");
    expect(line.description).toBe("Transferência entre contas Stone - Stone Principal");
  });

  it("Pix (Débito): direção saída, contraparte é o destinatário real (nunca a própria conta)", () => {
    const [line] = parseStoneNativeBankStatementCsv(`${HEADER}\n${PIX_SAIDA_ROW}`);
    expect(line.direction).toBe("saida");
    expect(line.amount).toBe(125);
    expect(line.counterparty).toBe("Gabriel de Abreu Goncalves da Silva");
  });

  it("Transação (Pix via maquininha, com tarifa real) -> descrição embute 'Pix recebido' para classificar como pix_recebido, NUNCA 'Pix Maquininha' (colide com liquidação de cartão do formato antigo — bug real corrigido na Missão V6.3)", () => {
    const [line] = parseStoneNativeBankStatementCsv(`${HEADER}\n${TRANSACAO_ROW}`);
    expect(line.amount).toBe(45);
    expect(line.description).toContain("Pix recebido");
    expect(line.description).not.toMatch(/pix\s*\|?\s*maquininha/i);
    expect(line.counterparty).toBe("DAIANA LETICIA PARISOTTO");
  });

  it("Pagamento: direção saída, contraparte é o favorecido", () => {
    const [line] = parseStoneNativeBankStatementCsv(`${HEADER}\n${PAGAMENTO_ROW}`);
    expect(line.direction).toBe("saida");
    expect(line.counterparty).toBe("VERISURE BRASIL");
  });

  it("Movimentação inválida gera erro, nunca assume uma direção por padrão", () => {
    const badRow = RECEBIVEL_ROW.replace("Crédito,", "Reembolso,");
    const [line] = parseStoneNativeBankStatementCsv(`${HEADER}\n${badRow}`);
    expect(line.direction).toBeNull();
    expect(line.errors.some((e) => e.includes("Movimentação"))).toBe(true);
  });
});

describe("parseBankStatementCsv — detecção automática do formato nativo (Missão V6.2)", () => {
  it("dispara o parser nativo sozinho quando o CSV é o extrato real da Stone, sem exigir conversão manual", () => {
    const lines = parseBankStatementCsv(`${HEADER}\n${RECEBIVEL_ROW}\n${TRANSFERENCIA_ROW}`);
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe(253.13);
    expect(lines[1].counterparty).toBe("Stone Principal");
  });

  it("formato genérico continua funcionando exatamente como antes (nenhuma regressão)", () => {
    const [line] = parseBankStatementCsv('data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,"1234,56",entrada');
    expect(line.amount).toBe(1234.56);
  });
});
