/**
 * Missão Financeiro V2.1 (item 1) — tabela de taxas Stone informada pelo gestor em 14/08/2026,
 * condição comercial atual (recebimento D+1 em todos os dias). Representa a CONDIÇÃO CONTRATUAL
 * DE REFERÊNCIA para conferência — NUNCA substitui `fee_amount`/`net_amount` reais retornados
 * pela Stone em `stone_normalized_transactions`. Hierarquia (decisão explícita do gestor):
 *   1. valor/taxa real da transação Stone = fonte da verdade;
 *   2. esta tabela contratual = conferência;
 *   3. cálculo estimado = só quando explicitamente necessário (ex.: transação sem fee_amount).
 * Não presumir validade retroativa a 01/01/2026 — só usado para comparar transações a partir de
 * 14/08/2026 em diante, a menos que o gestor confirme explicitamente uma tabela anterior.
 */

export const STONE_FEE_TABLE_INFORMED_AT = "2026-08-14";

/** `StoneBrandId` documentado em stone/types.ts: 1 Visa, 2 MasterCard, 3 Amex, 171 Elo. */
export type StoneFeeTableBrand = "visa_mastercard" | "elo" | "amex";

/** `stone_normalized_transactions.brand_id` é persistido como `text` (ver schema/stone.ts) — aceita string ou número, nunca lança em valor não numérico, só retorna null. */
export function mapStoneBrandIdToFeeTableBrand(brandId: string | number | null): StoneFeeTableBrand | null {
  if (brandId === null) return null;
  const numeric = typeof brandId === "number" ? brandId : Number(brandId);
  if (!Number.isFinite(numeric)) return null;
  if (numeric === 1 || numeric === 2) return "visa_mastercard";
  if (numeric === 171) return "elo";
  if (numeric === 3) return "amex";
  return null; // Cabal, UnionPay, Hipercard, boleto etc. — fora da tabela informada pelo gestor.
}

interface FeeTableRow {
  brand: StoneFeeTableBrand;
  method: "debito" | "credito";
  installments: number;
  ratePercent: number;
}

/** Visa/Mastercard — débito e crédito 1x–18x. */
const VISA_MASTERCARD_ROWS: FeeTableRow[] = [
  { brand: "visa_mastercard", method: "debito", installments: 1, ratePercent: 1.1 },
  ...[
    [1, 3.27], [2, 4.38], [3, 5.1], [4, 5.83], [5, 6.56], [6, 7.28], [7, 8.16], [8, 8.88],
    [9, 9.61], [10, 10.33], [11, 11.06], [12, 11.78], [13, 12.51], [14, 13.23], [15, 13.96],
    [16, 14.68], [17, 15.41], [18, 16.13],
  ].map(([installments, ratePercent]) => ({ brand: "visa_mastercard" as const, method: "credito" as const, installments, ratePercent })),
];

/** Elo — débito e crédito 1x–18x. */
const ELO_ROWS: FeeTableRow[] = [
  { brand: "elo", method: "debito", installments: 1, ratePercent: 1.74 },
  ...[
    [1, 4.59], [2, 5.6], [3, 6.32], [4, 7.03], [5, 7.75], [6, 8.47], [7, 9.65], [8, 10.37],
    [9, 11.08], [10, 11.79], [11, 12.51], [12, 13.22], [13, 13.93], [14, 14.64], [15, 15.36],
    [16, 16.07], [17, 16.78], [18, 17.5],
  ].map(([installments, ratePercent]) => ({ brand: "elo" as const, method: "credito" as const, installments, ratePercent })),
];

/** Amex — sem débito; crédito só 1x–12x (13x em diante não informado pelo gestor). */
const AMEX_ROWS: FeeTableRow[] = [
  [1, 4.81], [2, 5.57], [3, 6.29], [4, 7.0], [5, 7.72], [6, 8.44], [7, 9.27], [8, 9.98],
  [9, 10.7], [10, 11.42], [11, 12.13], [12, 12.85],
].map(([installments, ratePercent]) => ({ brand: "amex" as const, method: "credito" as const, installments, ratePercent }));

export const STONE_FEE_TABLE: readonly FeeTableRow[] = [...VISA_MASTERCARD_ROWS, ...ELO_ROWS, ...AMEX_ROWS];

/**
 * Busca a taxa contratual de referência. Retorna `null` quando a combinação não está na tabela
 * informada pelo gestor (ex.: Amex débito, Amex 13x+, bandeira fora das 3 informadas) — nunca
 * extrapola/inventa uma taxa para preencher a lacuna.
 */
export function lookupContractualFeeRatePercent(brand: StoneFeeTableBrand, method: "debito" | "credito", installments: number): number | null {
  const row = STONE_FEE_TABLE.find((r) => r.brand === brand && r.method === method && r.installments === installments);
  return row?.ratePercent ?? null;
}

export interface StoneFeeComparisonInput {
  brandId: string | number | null;
  method: "debito" | "credito" | "outro";
  installments: number;
  grossAmount: number;
  feeAmount: number;
}

export interface StoneFeeComparisonResult {
  brand: StoneFeeTableBrand | null;
  realRatePercent: number;
  contractualRatePercent: number | null;
  /** realRatePercent - contractualRatePercent, em pontos percentuais. Null quando não há taxa contratual para comparar. */
  divergencePercentPoints: number | null;
  /** true só quando a divergência ultrapassa a tolerância de arredondamento (0,05 p.p.) — sinalização, nunca correção automática. */
  hasSignificantDivergence: boolean;
}

const DIVERGENCE_TOLERANCE_PERCENT_POINTS = 0.05;

/**
 * Compara a taxa REAL efetivamente cobrada (sempre calculada a partir de `feeAmount`/`grossAmount`
 * reais) contra a taxa contratual de referência. Nunca sobrescreve o valor real — só sinaliza a
 * diferença quando ela existe, para revisão humana (decisão explícita do gestor).
 */
export function compareFeeToContractualRate(input: StoneFeeComparisonInput): StoneFeeComparisonResult {
  const realRatePercent = input.grossAmount !== 0 ? Math.round((input.feeAmount / input.grossAmount) * 10000) / 100 : 0;
  const brand = mapStoneBrandIdToFeeTableBrand(input.brandId);
  const contractualRatePercent = brand && input.method !== "outro" ? lookupContractualFeeRatePercent(brand, input.method, input.installments) : null;
  const divergencePercentPoints = contractualRatePercent !== null ? Math.round((realRatePercent - contractualRatePercent) * 100) / 100 : null;
  const hasSignificantDivergence = divergencePercentPoints !== null && Math.abs(divergencePercentPoints) > DIVERGENCE_TOLERANCE_PERCENT_POINTS;

  return { brand, realRatePercent, contractualRatePercent, divergencePercentPoints, hasSignificantDivergence };
}
