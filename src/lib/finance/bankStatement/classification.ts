import type { BankStatementLineDirection, BankStatementLineType } from "@/lib/finance/bankStatement/types";

/**
 * Sugestão inicial de tipo a partir da descrição do extrato — nunca decide sozinha, sempre um
 * ponto de partida editável pelo operador (Fase B/G da missão: "não tente adivinhar
 * automaticamente centenas de lançamentos"). Palavras-chave conferidas contra os termos reais
 * documentados pela missão ("Recebimento vendas", "Antecipação | Crédito", "Pix Maquininha",
 * "Pix recebido/enviado", "tarifa", "mensalidade Stone", "devolução/estorno", "transferência").
 * Quando nenhuma palavra-chave bate com segurança, retorna "outro" — nunca inventa uma
 * classificação para forçar uma correspondência.
 */
const KEYWORD_RULES: { pattern: RegExp; type: BankStatementLineType; direction?: BankStatementLineDirection }[] = [
  // Missão Financeiro V2.3 (auditoria gerencial, achado técnico) — "Pix Maquininha" aparece no
  // extrato real como "Pix | Maquininha" (com pipe), nunca "pix maquininha" contíguo — o regex
  // original nunca batia, então essas 154 linhas reais (recebimento via maquininha, entrada)
  // caíam no motor geral como "pix_recebido" comum, indo parar em REVIEW/INSUFFICIENT/CONFLICT
  // por descrição de contraparte poluída pela linha vizinha (mesmo padrão de contaminação já
  // corrigido para "Maestro | Débito" — ver regra abaixo). Tolerante a 0+ espaços/pipe entre as
  // palavras, nunca casa em saída.
  { pattern: /recebimento.*venda|venda.*recebimento|pix\s*\|?\s*maquininha|liquidação.*venda/i, type: "recebimento_venda_stone", direction: "entrada" },
  // Missão Financeiro V6.2 — "Recebível de Cartão" é o rótulo usado pelo "Comprovante de Extrato"
  // nativo da Stone (ver stoneNativeCsvFormat.ts) para o crédito de uma parcela de venda já
  // liquidada — mesmo fato que "Recebimento vendas" no formato antigo, nome diferente.
  { pattern: /receb[ií]vel de cart[aã]o/i, type: "recebimento_venda_stone", direction: "entrada" },
  // Missão Financeiro V6.2 — "Transferência entre contas Stone" vinda de "Stone Principal"
  // (embutido na descrição reconstruída por stoneNativeCsvFormat.ts) é, por correlação real
  // D+1 confirmada na auditoria (ver costAnalysis.ts/relatório da missão), o mesmo lote de
  // liquidação de vendas — checada ANTES da regra genérica de "transferência" abaixo, que trataria
  // isso como uma transferência entre contas próprias comum. Nunca aplicada a "Transferência entre
  // contas Stone" de qualquer OUTRA origem que não "Stone Principal" — essa continua genérica.
  { pattern: /transfer[eê]ncia entre contas stone.*stone principal/i, type: "recebimento_venda_stone", direction: "entrada" },
  // Missão Financeiro V2.2 (item 7D, caso real) — rótulo de bandeira/método de cartão
  // ("Maestro | Débito", "Visa Electron | Débito" etc.) é a mesma estrutura usada em liquidações
  // de venda Stone reais (ex.: "Recebimento vendas / Maestro | Débito"), só que às vezes sem o
  // prefixo "Recebimento vendas" por causa da quebra de linha do PDF (ver csvFormat.ts/parser
  // original) — nunca confundido com fornecedor de linha vizinha nem com Pix Maquininha (regra
  // acima), só dispara em entrada, nunca em saída.
  { pattern: /(maestro|visa electron|mastercard|elo)\s*\|\s*(d[eé]bito|cr[eé]dito)/i, type: "recebimento_venda_stone", direction: "entrada" },
  { pattern: /antecipa[cç][aã]o/i, type: "antecipacao_credito", direction: "entrada" },
  { pattern: /devolu[cç][aã]o|estorno|chargeback/i, type: "devolucao" },
  { pattern: /mensalidade.*stone|stone.*mensalidade|taxa de adesão/i, type: "mensalidade_stone", direction: "saida" },
  { pattern: /tarifa|taxa banc[aá]ria|manuten[cç][aã]o de conta/i, type: "tarifa", direction: "saida" },
  // "pix" checado ANTES de "transferência" de propósito: a Stone rotula todo Pix (inclusive
  // pagamento a fornecedor externo) como "Transferência | Pix" — esse rótulo é ambíguo entre
  // "movimento entre contas próprias" e "pagamento/recebimento externo via Pix", então o palpite
  // inicial mais honesto é "Pix a classificar", nunca presumir transferência interna. Só cai na
  // regra de transferência abaixo quando o texto NÃO menciona Pix (ex.: TED entre contas próprias).
  { pattern: /pix\s*(recebido|enviado)?/i, type: "pix_recebido" }, // direção real decide, ver abaixo
  { pattern: /transfer[eê]ncia/i, type: "transferencia_entrada" }, // direção real decide entrada/saída, ver abaixo
  { pattern: /pagamento/i, type: "pagamento", direction: "saida" },
];

export function inferBankStatementLineType(description: string, direction: BankStatementLineDirection): BankStatementLineType {
  const text = description.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    if (!rule.pattern.test(text)) continue;
    if (rule.type === "transferencia_entrada") return direction === "entrada" ? "transferencia_entrada" : "transferencia_saida";
    if (rule.type === "pix_recebido") return direction === "entrada" ? "pix_recebido" : "pix_enviado";
    if (rule.direction && rule.direction !== direction) continue;
    return rule.type;
  }

  return "outro";
}

/** Estado inicial de conciliação sugerido a partir do tipo — só um ponto de partida, nunca final. */
export function initialStatusForType(type: BankStatementLineType): "nao_conciliado" | "a_classificar" {
  if (type === "recebimento_venda_stone" || type === "antecipacao_credito") return "nao_conciliado"; // aguarda tentativa de conciliação (reconciliation.ts)
  if (type === "outro") return "a_classificar";
  return "a_classificar";
}
