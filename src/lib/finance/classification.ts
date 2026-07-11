/**
 * Classificação de ordens do JumpPark para fins financeiros — ver
 * docs/financial-classification-rules.md para a explicação completa de cada regra.
 *
 * Regra inegociável: NUNCA inferir "parceria" ou "mensalista" apenas porque a forma de
 * pagamento está como "dinheiro" (ou qualquer outra). Isso só é atribuído quando o nome do
 * cliente bate com um parceiro/mensalista real e conhecido (curated abaixo). Fora isso, o
 * máximo que se infere é o tipo de receita (estacionamento/serviços) ou, na ausência de
 * qualquer sinal confiável, "unclassified".
 */
export type JumpParkOrderClassification =
  | "receita_estacionamento"
  | "receita_servicos"
  | "parceria"
  | "mensalista"
  | "pos_pago"
  | "pagamento_imediato"
  | "unclassified";

export interface KnownParty {
  /** Fragmento do nome do cliente no JumpPark que identifica esse parceiro/mensalista. */
  nameFragment: string;
  classification: "parceria" | "mensalista";
}

/**
 * Lista curada manualmente a partir dos contratos reais já cadastrados
 * (src/lib/finance/data/contracts.ts) — nunca gerada automaticamente a partir de forma de
 * pagamento ou qualquer heurística. Atualizar aqui sempre que um novo contrato/parceria for
 * confirmado pelo proprietário.
 */
export const knownParties: KnownParty[] = [
  { nameFragment: "iesa", classification: "parceria" },
  { nameFragment: "nissan", classification: "parceria" },
  { nameFragment: "funerár", classification: "mensalista" },
  { nameFragment: "funerar", classification: "mensalista" },
  { nameFragment: "don juan", classification: "mensalista" },
];

/** Formato mínimo necessário para classificar — compatível estruturalmente com OperationOrder. */
export interface ClassifiableOrder {
  clientName: string | null;
  paymentMethod: string;
  situation: string;
  hasServices: boolean;
  parkingAmount: number;
  servicesAmount: number;
}

function matchKnownParty(clientName: string | null): KnownParty | null {
  if (!clientName) return null;
  const normalized = clientName.toLowerCase();
  return knownParties.find((party) => normalized.includes(party.nameFragment)) ?? null;
}

const PENDING_SITUATION_PATTERN = /pendente|em aberto|pós.?pago|pos.?pago/i;
const PAID_SITUATION_PATTERN = /pago/i;

export function classifyJumpParkOrder(order: ClassifiableOrder): JumpParkOrderClassification {
  // 1. Cliente conhecido (parceiro/mensalista real) — único caminho para essas duas categorias.
  const known = matchKnownParty(order.clientName);
  if (known) return known.classification;

  // 2. Situação financeira indica cobrança pendente/pós-paga, sem cliente conhecido associado —
  //    não sabemos se é parceria ou não, então fica como "pos_pago" (o dado disponível diz que
  //    o pagamento não foi imediato), nunca "parceria".
  if (PENDING_SITUATION_PATTERN.test(order.situation)) return "pos_pago";

  // 3. Situação paga, com forma de pagamento informada: já sabemos que foi pagamento imediato.
  //    Se o valor for claramente só de um tipo (estacionamento OU serviços), a receita já é
  //    identificável; senão, fica como pagamento_imediato (misto ou indefinido).
  const hasKnownPaymentMethod = order.paymentMethod !== "" && order.paymentMethod.toLowerCase() !== "não informado";
  if (hasKnownPaymentMethod && PAID_SITUATION_PATTERN.test(order.situation)) {
    if (order.parkingAmount > 0 && order.servicesAmount === 0) return "receita_estacionamento";
    if (order.servicesAmount > 0 && order.parkingAmount === 0) return "receita_servicos";
    return "pagamento_imediato";
  }

  // 4. Nenhum sinal confiável o suficiente — não inventamos uma classificação.
  return "unclassified";
}
