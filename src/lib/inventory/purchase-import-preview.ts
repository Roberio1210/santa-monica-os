import { normalizeProductName } from "@/lib/inventory/duplicate-detection";
import { convertPackageToBaseUnit, type PackageConversionResult } from "@/lib/inventory/unit-conversion";
import type { ParsedPurchaseImportRow, PurchaseImportRowFields } from "@/lib/inventory/purchase-import-format";
import type { InventoryItem } from "@/lib/inventory/types";

/**
 * Prévia da importação (Missão 23, seção 8, Etapa 1) — tudo calculado, nada gravado. Mostra
 * exatamente o que vai acontecer antes de qualquer confirmação humana.
 */

/** Chave de deduplicação, na ordem de prioridade da missão: chave da NF-e > identificador externo > combinação seguro de campos. `null` só quando nada disso está disponível. */
export function computeDedupeKey(fields: PurchaseImportRowFields): string | null {
  if (fields.nfeKey) return `nfe:${normalizeKeyToken(fields.nfeKey)}`;
  if (fields.externalId) return `ext:${normalizeKeyToken(fields.externalId)}`;
  if (fields.invoiceNumber && fields.supplierName && fields.date && fields.productDescription) {
    const combo = [fields.invoiceNumber, fields.supplierName, fields.date, fields.productDescription, fields.totalItemValue ?? ""].map(normalizeKeyToken).join("|");
    return `combo:${combo}`;
  }
  return null;
}

function normalizeKeyToken(value: string | number): string {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type PurchaseMatchStatus = "encontrado" | "possivel" | "nao_encontrado";

export interface MatchCandidate {
  itemId: string;
  itemName: string;
  score: number;
}

/** Abaixo disso, nem entra como "possível" — evita sugerir vínculos sem nenhuma relação real. */
const POSSIBLE_MATCH_THRESHOLD = 0.35;

function matchProductToCatalog(description: string, brand: string | null, items: InventoryItem[]): { status: PurchaseMatchStatus; matchedItemId: string | null; candidates: MatchCandidate[] } {
  const liveItems = items.filter((i) => i.canonicalItemId === null);
  const normalizedDescription = normalizeProductName(description);
  const descriptionTokens = new Set(normalizedDescription.split(" ").filter(Boolean));

  const scored = liveItems.map((item) => {
    const normalizedName = normalizeProductName(item.name);
    const nameTokens = new Set(normalizedName.split(" ").filter(Boolean));
    let intersection = 0;
    for (const t of descriptionTokens) if (nameTokens.has(t)) intersection += 1;
    const union = descriptionTokens.size + nameTokens.size - intersection;
    let score = union === 0 ? 0 : intersection / union;
    const sameBrand = brand !== null && item.brand.trim().toLowerCase() === brand.trim().toLowerCase();
    if (sameBrand) score = Math.min(1, score + 0.2);
    return { itemId: item.id, itemName: item.name, score, exact: normalizedName === normalizedDescription && normalizedDescription.length > 0 };
  });

  const exact = scored.find((s) => s.exact);
  if (exact) return { status: "encontrado", matchedItemId: exact.itemId, candidates: [] };

  const candidates = scored
    .filter((s) => s.score >= POSSIBLE_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => ({ itemId: s.itemId, itemName: s.itemName, score: Math.round(s.score * 100) }));

  if (candidates.length > 0) return { status: "possivel", matchedItemId: null, candidates };
  return { status: "nao_encontrado", matchedItemId: null, candidates: [] };
}

export interface PurchaseImportLinePreview {
  rowIndex: number;
  valid: boolean;
  errors: string[];
  fields: PurchaseImportRowFields;
  dedupeKey: string | null;
  isDuplicate: boolean;
  conversion: PackageConversionResult | null;
  matchStatus: PurchaseMatchStatus | null;
  matchedItemId: string | null;
  matchCandidates: MatchCandidate[];
  /** Comparação honesta com o custo médio atual do produto encontrado — `null` quando não há produto encontrado ou preço na linha. */
  costImpact: string | null;
}

export interface PurchaseImportPreviewSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  foundProducts: number;
  possibleProducts: number;
  notFoundProducts: number;
}

export function buildPurchaseImportPreview(params: { rows: ParsedPurchaseImportRow[]; items: InventoryItem[]; existingDedupeKeys: Set<string> }): {
  lines: PurchaseImportLinePreview[];
  summary: PurchaseImportPreviewSummary;
} {
  const { rows, items, existingDedupeKeys } = params;
  const seenInThisBatch = new Set<string>();
  const lines: PurchaseImportLinePreview[] = [];

  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  let foundProducts = 0;
  let possibleProducts = 0;
  let notFoundProducts = 0;

  for (const row of rows) {
    if (!row.valid) {
      invalidRows += 1;
      lines.push({ rowIndex: row.rowIndex, valid: false, errors: row.errors, fields: row.fields, dedupeKey: null, isDuplicate: false, conversion: null, matchStatus: null, matchedItemId: null, matchCandidates: [], costImpact: null });
      continue;
    }
    validRows += 1;

    const dedupeKey = computeDedupeKey(row.fields);
    const isDuplicate = dedupeKey !== null && (existingDedupeKeys.has(dedupeKey) || seenInThisBatch.has(dedupeKey));
    if (dedupeKey) seenInThisBatch.add(dedupeKey);
    if (isDuplicate) duplicateRows += 1;

    const conversion = row.fields.packageUnit && row.fields.packageQuantity !== null && row.fields.packageCount !== null ? convertPackageToBaseUnit(row.fields.packageUnit, row.fields.packageQuantity, row.fields.packageCount) : null;

    const match = row.fields.productDescription ? matchProductToCatalog(row.fields.productDescription, row.fields.brand, items) : { status: "nao_encontrado" as const, matchedItemId: null, candidates: [] };
    if (match.status === "encontrado") foundProducts += 1;
    else if (match.status === "possivel") possibleProducts += 1;
    else notFoundProducts += 1;

    const costImpact = buildCostImpact(match.matchedItemId, row.fields, items);

    lines.push({
      rowIndex: row.rowIndex,
      valid: true,
      errors: [],
      fields: row.fields,
      dedupeKey,
      isDuplicate,
      conversion,
      matchStatus: match.status,
      matchedItemId: match.matchedItemId,
      matchCandidates: match.candidates,
      costImpact,
    });
  }

  return {
    lines,
    summary: { totalRows: rows.length, validRows, invalidRows, duplicateRows, foundProducts, possibleProducts, notFoundProducts },
  };
}

function buildCostImpact(matchedItemId: string | null, fields: PurchaseImportRowFields, items: InventoryItem[]): string | null {
  if (!matchedItemId || fields.unitPricePerPackage === null || fields.packageQuantity === null || fields.packageQuantity <= 0) return null;
  const item = items.find((i) => i.id === matchedItemId);
  if (!item || item.unitCost === null) return null;

  const pricePerBaseUnit = fields.unitPricePerPackage / fields.packageQuantity;
  const deviation = ((pricePerBaseUnit - item.unitCost) / item.unitCost) * 100;
  const direction = deviation >= 0 ? "acima" : "abaixo";
  return `Preço da nota (${pricePerBaseUnit.toFixed(2)}/unidade-base) está ${Math.abs(Math.round(deviation))}% ${direction} do custo médio atual (${item.unitCost.toFixed(2)}).`;
}
