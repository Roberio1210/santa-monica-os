/**
 * Formato oficial de importação de compras históricas (Missão 23, seção 7) — CSV ou JSON
 * estruturado. Nenhuma leitura automática de PDF/imagem nesta missão (decisão explícita da
 * missão). Tudo aqui é puro: parsing e validação de formato, nunca gravação.
 */

/** Colunas do CSV oficial, nesta ordem — a mesma lista de campos vale para as chaves do JSON. */
export const PURCHASE_IMPORT_COLUMNS = [
  "identificador_externo",
  "data",
  "numero_nota",
  "fornecedor",
  "cnpj_fornecedor",
  "chave_nfe",
  "produto",
  "marca",
  "quantidade_embalagens",
  "volume_ou_peso_por_embalagem",
  "unidade_embalagem",
  "valor_unitario_embalagem",
  "valor_total_item",
  "frete_rateado",
  "desconto_rateado",
  "observacao",
] as const;

export interface PurchaseImportRowFields {
  externalId: string | null;
  /** ISO YYYY-MM-DD — `null` quando ausente ou em formato não reconhecido (nunca uma data adivinhada). */
  date: string | null;
  invoiceNumber: string | null;
  supplierName: string | null;
  supplierCnpj: string | null;
  nfeKey: string | null;
  productDescription: string | null;
  brand: string | null;
  packageCount: number | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  unitPricePerPackage: number | null;
  totalItemValue: number | null;
  freightAllocated: number | null;
  discountAllocated: number | null;
  observation: string | null;
}

export interface ParsedPurchaseImportRow {
  rowIndex: number;
  raw: Record<string, string>;
  valid: boolean;
  errors: string[];
  fields: PurchaseImportRowFields;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/** Aceita YYYY-MM-DD ou DD/MM/YYYY (formato comum de nota fiscal brasileira) — nunca um formato ambíguo adivinhado. */
function parseDate(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return null;
}

/** Uma linha do CSV/JSON → campos tipados + lista de erros. Nunca lança — sempre retorna, mesmo inválida (para a prévia mostrar o motivo). */
export function parsePurchaseImportRow(rowIndex: number, raw: Record<string, string>): ParsedPurchaseImportRow {
  const errors: string[] = [];

  const fields: PurchaseImportRowFields = {
    externalId: emptyToNull(raw.identificador_externo),
    date: parseDate(raw.data),
    invoiceNumber: emptyToNull(raw.numero_nota),
    supplierName: emptyToNull(raw.fornecedor),
    supplierCnpj: emptyToNull(raw.cnpj_fornecedor),
    nfeKey: emptyToNull(raw.chave_nfe),
    productDescription: emptyToNull(raw.produto),
    brand: emptyToNull(raw.marca),
    packageCount: parseNumber(raw.quantidade_embalagens),
    packageQuantity: parseNumber(raw.volume_ou_peso_por_embalagem),
    packageUnit: emptyToNull(raw.unidade_embalagem),
    unitPricePerPackage: parseNumber(raw.valor_unitario_embalagem),
    totalItemValue: parseNumber(raw.valor_total_item),
    freightAllocated: parseNumber(raw.frete_rateado),
    discountAllocated: parseNumber(raw.desconto_rateado),
    observation: emptyToNull(raw.observacao),
  };

  if (!fields.productDescription) errors.push("Produto (coluna 'produto') é obrigatório.");
  if (!fields.date) errors.push("Data (coluna 'data') é obrigatória ou está em formato não reconhecido (use YYYY-MM-DD ou DD/MM/AAAA).");
  if (fields.packageCount === null || fields.packageCount <= 0) errors.push("Quantidade de embalagens (coluna 'quantidade_embalagens') deve ser um número maior que zero.");
  if (fields.packageQuantity === null || fields.packageQuantity <= 0) errors.push("Volume/peso por embalagem (coluna 'volume_ou_peso_por_embalagem') deve ser um número maior que zero.");
  if (!fields.packageUnit) errors.push("Unidade da embalagem (coluna 'unidade_embalagem') é obrigatória.");

  return { rowIndex, raw, valid: errors.length === 0, errors, fields };
}

/** Parser CSV mínimo com suporte a campos entre aspas (RFC4180) — sem dependência externa. */
export function parseCsv(content: string): Record<string, string>[] {
  const rows = splitCsvLines(content);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = cells[i] ?? "";
    });
    return row;
  });
}

function splitCsvLines(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = content.replace(/\r\n/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"' && normalized[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** JSON: array de objetos com as mesmas chaves do CSV (snake_case) — nunca aceita um objeto único fora de array. */
export function parseJson(content: string): { rows: Record<string, string>[] } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return { error: "JSON inválido — não foi possível interpretar o arquivo." };
  }
  if (!Array.isArray(data)) return { error: "O JSON precisa ser uma lista (array) de compras." };

  const rows: Record<string, string>[] = data.map((entry) => {
    const row: Record<string, string> = {};
    if (entry && typeof entry === "object") {
      for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
        row[key.toLowerCase()] = value === null || value === undefined ? "" : String(value);
      }
    }
    return row;
  });
  return { rows };
}
