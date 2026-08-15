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
  { pattern: /recebimento.*venda|venda.*recebimento|pix maquininha|liquidação.*venda/i, type: "recebimento_venda_stone", direction: "entrada" },
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
