import { parseCsv } from "@/lib/inventory/purchase-import-format";
import type { BankStatementLineDirection } from "@/lib/finance/bankStatement/types";

/**
 * Missão Financeiro V2.1 (Fase C) — formato de CSV aceito para importar o extrato bancário.
 * Decisão explícita (ver relatório da missão): os 3 PDFs mencionados pelo gestor não estavam
 * acessíveis no ambiente de execução, e a missão pede explicitamente para não escrever um parser
 * frágil de layout visual de PDF quando existe alternativa mais robusta — por isso o importador
 * aceita CSV (exportável de qualquer extrato Stone/Excel/Planilha Google a partir do PDF) em vez
 * de tentar ler o PDF diretamente.
 *
 * Colunas esperadas (nomes de cabeçalho, minúsculas, qualquer ordem):
 *   data         — obrigatória. "AAAA-MM-DD" ou "DD/MM/AAAA".
 *   descricao    — obrigatória. Texto original da linha do extrato (ex.: "Recebimento vendas").
 *   contraparte  — opcional. Nome de quem pagou/recebeu, quando o extrato traz essa informação.
 *   valor        — obrigatória. Número (aceita vírgula ou ponto decimal). Pode ser assinado
 *                  (negativo = saída) OU sempre positivo quando a coluna "tipo" está presente.
 *   tipo         — opcional. "entrada" ou "saida". Quando ausente, o sinal de "valor" decide.
 *
 * Reaproveita `parseCsv` (`inventory/purchase-import-format.ts`) — mesmo parser robusto (aspas,
 * vírgula dentro de campo) já usado pela importação de compras, nenhum parser novo.
 */
export interface RawCsvBankStatementRow {
  rowIndex: number;
  date: string | null;
  description: string | null;
  counterparty: string | null;
  direction: BankStatementLineDirection | null;
  amount: number | null;
  raw: Record<string, string>;
  errors: string[];
}

function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return null;
}

/** Aceita "1234.56" (ponto decimal simples) ou "1.234,56"/"1234,56" (formato BR — vírgula decimal, ponto como milhar). */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function parseBankStatementCsv(content: string): RawCsvBankStatementRow[] {
  const rows = parseCsv(content);
  return rows.map((raw, index) => {
    const errors: string[] = [];
    const date = raw.data ? parseDate(raw.data) : null;
    if (!raw.data) errors.push("Coluna 'data' ausente.");
    else if (!date) errors.push(`Data inválida: "${raw.data}".`);

    const description = raw.descricao?.trim() || null;
    if (!description) errors.push("Coluna 'descricao' ausente.");

    const counterparty = raw.contraparte?.trim() || null;

    const rawAmount = raw.valor ? parseAmount(raw.valor) : null;
    if (!raw.valor) errors.push("Coluna 'valor' ausente.");
    else if (rawAmount === null) errors.push(`Valor inválido: "${raw.valor}".`);

    const typeColumn = raw.tipo?.trim().toLowerCase();
    let direction: BankStatementLineDirection | null = null;
    let amount: number | null = null;
    if (rawAmount !== null) {
      if (typeColumn === "entrada" || typeColumn === "saida") {
        direction = typeColumn;
        amount = Math.abs(rawAmount);
      } else if (!typeColumn) {
        direction = rawAmount < 0 ? "saida" : "entrada";
        amount = Math.abs(rawAmount);
      } else {
        errors.push(`Coluna 'tipo' inválida: "${raw.tipo}" (esperado "entrada" ou "saida").`);
      }
    }

    return { rowIndex: index, date, description, counterparty, direction, amount, raw, errors };
  });
}
