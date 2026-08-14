/**
 * Missão Estoque V2 Final — cálculo puro de uma linha de compra quando o gestor paga um valor
 * REAL diferente do valor de tabela exibido no carrinho (ex.: condição comercial de desconto).
 * Distinto de `purchase-import-preview.ts` (que só lê `unitPricePerPackage`/`totalItemValue` como
 * um único valor, sem separar tabela × real): aqui os dois valores convivem lado a lado, e o
 * REAL é sempre a fonte de verdade para custo econômico (nunca o de tabela).
 *
 * `realTotalValue` é sempre informado explicitamente pelo chamador (nunca derivado como
 * `listTotalValue / 2` ou qualquer fórmula) — evita o problema de arredondamento de "50% de
 * R$77,25" (R$38,625, que não existe em centavos): o valor real de cada linha vem pronto, já
 * resolvido pelo gestor/documento de origem.
 */

export interface PurchaseEvidenceLineInput {
  productDescription: string;
  brand: string;
  /** Código do fabricante/fornecedor, quando exibido na origem (ex.: "HI539.150-0.5"). */
  productCode?: string | null;
  packageCount: number;
  /** Tamanho de cada embalagem, já em ml (mission: unidade-base do estoque, nunca litro). */
  packageQuantityMl: number;
  /** Valor de tabela/carrinho da linha inteira (R$), antes de qualquer condição comercial. */
  listTotalValue: number;
  /** Valor REAL efetivamente pago pela linha inteira (R$) — fonte de verdade para custo. */
  realTotalValue: number;
}

export interface PurchaseEvidenceLine extends PurchaseEvidenceLineInput {
  /** listTotalValue - realTotalValue, sempre >= 0 quando há desconto (nunca negativo em uso normal). */
  discountAmount: number;
  /** realTotalValue / packageCount, arredondado a 2 casas — só para exibição; o total da linha continua sendo a fonte primária (mission, seção 8). */
  realUnitPricePerPackage: number;
  totalQuantityMl: number;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildPurchaseEvidenceLine(input: PurchaseEvidenceLineInput): PurchaseEvidenceLine {
  if (!input.productDescription.trim()) throw new Error("Descrição do produto é obrigatória.");
  if (!input.brand.trim()) throw new Error("Marca é obrigatória.");
  if (!Number.isFinite(input.packageCount) || input.packageCount <= 0) throw new Error("Quantidade de embalagens deve ser maior que zero.");
  if (!Number.isFinite(input.packageQuantityMl) || input.packageQuantityMl <= 0) throw new Error("Volume da embalagem (ml) deve ser maior que zero.");
  if (!Number.isFinite(input.listTotalValue) || input.listTotalValue < 0) throw new Error("Valor de tabela inválido.");
  if (!Number.isFinite(input.realTotalValue) || input.realTotalValue < 0) throw new Error("Valor real pago inválido.");
  if (input.realTotalValue > input.listTotalValue + 0.001) throw new Error("Valor real pago não pode ser maior que o valor de tabela — confira os dados de origem.");

  return {
    ...input,
    discountAmount: round2(input.listTotalValue - input.realTotalValue),
    realUnitPricePerPackage: round2(input.realTotalValue / input.packageCount),
    totalQuantityMl: round3(input.packageCount * input.packageQuantityMl),
  };
}

/** Soma em CENTAVOS (inteiro) — nunca acumula erro de ponto flutuante ao comparar contra o total esperado informado pelo gestor. */
export function sumRealTotalCents(lines: { realTotalValue: number }[]): number {
  return lines.reduce((sum, l) => sum + Math.round(l.realTotalValue * 100), 0);
}

export function sumListTotalCents(lines: { listTotalValue: number }[]): number {
  return lines.reduce((sum, l) => sum + Math.round(l.listTotalValue * 100), 0);
}

/** Lança se a soma real das linhas não bater, ao centavo, com o total que o gestor informou — nunca deixa passar diferença acumulada de arredondamento (mission, seção 8). */
export function assertRealTotalMatches(lines: { realTotalValue: number }[], expectedTotal: number): void {
  const actualCents = sumRealTotalCents(lines);
  const expectedCents = Math.round(expectedTotal * 100);
  if (actualCents !== expectedCents) {
    throw new Error(`Soma real das linhas (R$ ${(actualCents / 100).toFixed(2)}) não bate com o total esperado (R$ ${expectedTotal.toFixed(2)}).`);
  }
}
