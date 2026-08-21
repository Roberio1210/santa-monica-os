import { parseCsv } from "@/lib/inventory/purchase-import-format";
import type { BankStatementLineDirection } from "@/lib/finance/bankStatement/types";
import type { RawCsvBankStatementRow } from "@/lib/finance/bankStatement/csvFormat";

/**
 * Missão Financeiro V6.2 (Fase 11) — segundo formato de extrato aceito, além do CSV genérico já
 * suportado (`csvFormat.ts`, colunas `data/descricao/contraparte/valor/tipo`). Este é o CSV
 * exportado DIRETAMENTE pela Stone ("Comprovante de Extrato"), com colunas próprias
 * (`Movimentação,Tipo,Valor,Saldo antes,Saldo depois,Tarifa,Data,Horário,Situação,Nosso Número,
 * Destino,...,Origem,...,Descrição`) — a coluna "Descrição" vem sempre vazia nos arquivos reais
 * observados; a descrição útil para classificação é reconstruída aqui a partir de "Tipo" + a
 * contraparte real (Origem quando "Movimentação" é Crédito, Destino quando é Débito — a Stone
 * sempre lista "R. B. E. ESTACIONAMENTO LTDA", a própria conta, do lado oposto).
 *
 * Produz o mesmo formato `RawCsvBankStatementRow[]` que `parseBankStatementCsv` já produzia —
 * `importService.ts`, dedupe, classificação e reconciliação continuam EXATAMENTE os mesmos,
 * nenhuma tabela nova, nenhuma tela nova (decisão explícita da missão: reaproveitar, não duplicar).
 */

const NATIVE_HEADER_SIGNATURE = ["movimentação", "tipo", "valor", "saldo antes", "saldo depois", "data"];

export function isStoneNativeCsvFormat(content: string): boolean {
  const firstLine = content.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  return NATIVE_HEADER_SIGNATURE.every((col) => firstLine.includes(col));
}

function parseNativeDate(raw: string): string | null {
  const datePart = raw.trim().split(" ")[0];
  const match = datePart.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** Mesmo formato BR (vírgula decimal) do CSV genérico — reaproveitado, não reescrito. */
function parseNativeAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * A Stone sempre lista a própria conta ("R. B. E. ESTACIONAMENTO LTDA") do lado que RECEBE numa
 * entrada e do lado que ENVIA numa saída — nunca o nome varia entre exportações, mas mantido como
 * parâmetro para nunca fixar um CNPJ/nome como constante mágica sem contexto.
 */
function resolveCounterparty(row: Record<string, string>, direction: BankStatementLineDirection, ownAccountName: string): string | null {
  const origem = row["origem"]?.trim();
  const destino = row["destino"]?.trim();
  const other = direction === "entrada" ? origem : destino;
  if (!other || other === ownAccountName || other.toLowerCase() === "desconhecido") return null;
  return other;
}

/**
 * "Transação" (Crédito, com tarifa proporcional pequena) é a Stone processando um Pix recebido
 * diretamente na maquininha — canal real de venda que nunca aparece em `stone_normalized_transactions`
 * (o layout XML de conciliação só cobre débito/cartão de crédito, ver `PIX_NOTE` em
 * `reconciliationSummary.ts`). Embutir "Pix" na descrição reconstruída deixa a classificação
 * existente (`inferBankStatementLineType`) reconhecer automaticamente, sem inventar um tipo novo.
 */
function describeNativeType(tipo: string, counterparty: string | null): string {
  const label = tipo.trim().toLowerCase() === "transação" ? "Transação (Pix Maquininha)" : tipo.trim();
  return counterparty ? `${label} - ${counterparty}` : label;
}

export function parseStoneNativeBankStatementCsv(content: string, ownAccountName = "R. B. E. ESTACIONAMENTO LTDA"): RawCsvBankStatementRow[] {
  const rows = parseCsv(content);
  return rows.map((raw, index) => {
    const errors: string[] = [];

    const date = raw["data"] ? parseNativeDate(raw["data"]) : null;
    if (!raw["data"]) errors.push("Coluna 'Data' ausente.");
    else if (!date) errors.push(`Data inválida: "${raw["data"]}".`);

    const movimentacao = raw["movimentação"]?.trim().toLowerCase();
    let direction: BankStatementLineDirection | null = null;
    if (movimentacao === "crédito") direction = "entrada";
    else if (movimentacao === "débito") direction = "saida";
    else errors.push(`Coluna 'Movimentação' inválida: "${raw["movimentação"]}" (esperado "Crédito" ou "Débito").`);

    const rawAmount = raw["valor"] ? parseNativeAmount(raw["valor"]) : null;
    if (!raw["valor"]) errors.push("Coluna 'Valor' ausente.");
    else if (rawAmount === null) errors.push(`Valor inválido: "${raw["valor"]}".`);
    const amount = rawAmount !== null ? Math.abs(rawAmount) : null;

    const tipo = raw["tipo"]?.trim() ?? "";
    if (!tipo) errors.push("Coluna 'Tipo' ausente.");

    const counterparty = direction ? resolveCounterparty(raw, direction, ownAccountName) : null;
    const description = tipo ? describeNativeType(tipo, counterparty) : null;

    return { rowIndex: index, date, description, counterparty, direction, amount, raw, errors };
  });
}
