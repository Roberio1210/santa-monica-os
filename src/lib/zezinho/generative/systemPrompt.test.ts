import { describe, expect, it } from "vitest";
import { buildZezinhoSystemPrompt } from "@/lib/zezinho/generative/systemPrompt";

/**
 * Missão Z3.2 — guarda de regressão do texto do system prompt: a política comercial (sequência
 * de negociação, desconto como último recurso, nunca empilhar benefícios) não pode ser removida
 * silenciosamente numa edição futura. Isto NÃO prova que o modelo generativo obedece a regra —
 * só que a instrução continua presente no prompt enviado a ele (a prova de comportamento real
 * vem de chamadas reais ao modelo, ver relatório da missão).
 */
describe("buildZezinhoSystemPrompt — política comercial", () => {
  const prompt = buildZezinhoSystemPrompt();

  it("menciona a ferramenta commercial_policy explicitamente, nunca um número de memória", () => {
    expect(prompt).toContain("commercial_policy");
    expect(prompt.toLowerCase()).toContain("nunca use um número de memória");
  });

  it("descreve a sequência: preço normal -> valor -> fechar -> cortesia -> parcelamento -> desconto", () => {
    const lower = prompt.toLowerCase();
    const iPreco = lower.indexOf("apresente o preço vigente");
    const iCortesia = lower.indexOf("avalie uma cortesia");
    const iParcelamento = lower.indexOf("ofereça parcelamento");
    const iDesconto = lower.indexOf("desconto financeiro é sempre o último recurso");
    expect(iPreco).toBeGreaterThan(-1);
    expect(iCortesia).toBeGreaterThan(iPreco);
    expect(iParcelamento).toBeGreaterThan(iCortesia);
    expect(iDesconto).toBeGreaterThan(iParcelamento);
  });

  it("proíbe empilhar cortesia + desconto sem necessidade", () => {
    expect(prompt.toLowerCase()).toContain("nunca empilhe cortesia");
  });

  it("exige informar o valor percebido da cortesia em R$, nunca só 'desconto'", () => {
    expect(prompt).toContain("valor percebido");
    expect(prompt).toContain("nunca \"vou te dar um desconto\"");
  });

  it("distingue preço-base, preço comercial atual e preço negociado", () => {
    expect(prompt).toContain("PREÇO-BASE, PREÇO COMERCIAL ATUAL E PREÇO NEGOCIADO");
  });

  it("distingue conhecimento geral de procedimento real da Santa Mônica", () => {
    expect(prompt).toContain("normalmente, em detailing");
    expect(prompt).toContain("na Santa Mônica fazemos");
  });

  it("Missão Z3.2 (achado real com chamada ao modelo) — pergunta de custo/margem deve negar de imediato, nunca pedir esclarecimento primeiro", () => {
    expect(prompt).toContain("CUSTO INTERNO, MARGEM, LUCRO");
    expect(prompt.toLowerCase()).toContain("sem pedir esclarecimento ou mais detalhes primeiro");
    expect(prompt).toContain("responda IMEDIATAMENTE apenas");
  });

  it("Missão Z4 — instrui a usar daily_management_summary/post_sale_candidates/inactive_customers", () => {
    expect(prompt).toContain("daily_management_summary");
    expect(prompt).toContain("post_sale_candidates");
    expect(prompt).toContain("inactive_customers");
  });

  it('Missão "Regra Absoluta de Envio" — nunca afirma ter enviado uma mensagem (substitui a regra mais simples da Z4)', () => {
    expect(prompt.toLowerCase()).toMatch(/nunca diga "enviei", "mandei a mensagem"/);
  });

  it("Missão Z4 (achado real, confirmação com chamada real autenticada como admin) — nunca confundir resposta real com valor zero com falha de consulta", () => {
    expect(prompt.toLowerCase()).toContain('nunca diga "não consegui obter os dados" quando a ferramenta respondeu normalmente');
    expect(prompt.toLowerCase()).toContain("um dia sem movimento é uma informação gerencial válida");
  });

  it("Missão Z5 — regra GERAL de confiança pós-consulta bem-sucedida (vale para qualquer ferramenta, proíbe linguagem de incerteza indevida)", () => {
    expect(prompt).toContain("QUALQUER ferramenta");
    expect(prompt.toLowerCase()).toContain('"parece que não encontrei..."');
    expect(prompt.toLowerCase()).toContain('"talvez não haja..."');
    expect(prompt.toLowerCase()).toContain('"não consegui confirmar..."');
    expect(prompt).toContain("Consultei os dados de hoje e não há clientes que atendam ao critério de mais de 30 dias sem retorno.");
  });

  it("Missão Z5 — nunca mistura faturamento, recebimento (Stone) e fluxo de caixa", () => {
    expect(prompt).toContain("FATURAMENTO x RECEBIMENTO x CAIXA nunca são a mesma coisa");
    expect(prompt.toLowerCase()).toContain("mostre-os separadamente, nunca some ou substitua um pelo outro");
  });

  it("Missão Z5 — fechamento diário: seções não vazias e no máximo 5 sugestões priorizadas e variáveis", () => {
    expect(prompt.toLowerCase()).toContain("nunca inclua uma seção vazia só para preencher formato");
    expect(prompt.toLowerCase()).toContain("no máximo 5");
    expect(prompt.toLowerCase()).toContain("nunca as mesmas 5 frases genéricas todo dia");
  });

  it('Missão "Regra Absoluta de Envio" — nível de autonomia é sempre MANUAL_APPROVAL, nenhuma mensagem é enviada sozinha', () => {
    expect(prompt).toContain("VOCÊ NUNCA TEM AUTONOMIA PARA ENVIAR MENSAGEM SOZINHO");
    expect(prompt).toContain("MANUAL_APPROVAL");
    expect(prompt).toContain("queue_message_for_approval");
    expect(prompt).toContain("approve_messages");
    expect(prompt).toContain("list_pending_approvals");
  });

  it('Missão "Regra Absoluta de Envio" — exemplos exatos de aprovação válida e inválida (nunca aprovação genérica/implícita)', () => {
    expect(prompt).toContain('"pode enviar essa"');
    expect(prompt).toContain('"pode mandar para o João"');
    expect(prompt).toContain('"aprovo essas 5 mensagens"');
    expect(prompt).toContain('"está boa"');
    expect(prompt).toContain('"gostei"');
    expect(prompt).toContain('"legal"');
    expect(prompt).toContain('"pode deixar assim"');
    expect(prompt.toLowerCase()).toContain("não chame approve_messages");
  });

  it('Missão "Regra Absoluta de Envio" — pré-visualização obrigatória (cliente/veículo/telefone/motivo/texto/tipo) antes de decidir', () => {
    expect(prompt.toLowerCase()).toContain("pré-visualização completa");
    expect(prompt.toLowerCase()).toContain("telefone mascarado");
  });

  it('Missão "Regra Absoluta de Envio" — mesmo depois de aprovada, nunca afirma ter enviado (não há canal real conectado)', () => {
    expect(prompt.toLowerCase()).toContain("ainda não foi enviada de verdade");
    expect(prompt.toLowerCase()).toContain('nunca diga "enviei"');
  });

  it('Missão "Regra Absoluta de Envio" — lote sempre informa a quantidade antes de perguntar sobre aprovar tudo', () => {
    expect(prompt.toLowerCase()).toContain("quantidade total antes de perguntar");
  });
});
