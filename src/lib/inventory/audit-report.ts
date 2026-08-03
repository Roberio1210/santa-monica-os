import type { DataQualityIssue, IssueSeverity } from "@/lib/inventory/data-quality-audit";
import type { DuplicateSuspect } from "@/lib/inventory/duplicate-detection";
import type { InventoryItem } from "@/lib/inventory/types";

/**
 * Relatório exportável da auditoria (Missão 23, seção 11) — tudo derivado dos mesmos dados já
 * mostrados na tela, nunca recalculado com regra diferente. Puro: recebe os resultados já
 * calculados por `data-quality-audit.ts`/`duplicate-detection.ts` e só formata.
 */

export interface AuditReportRow {
  itemId: string;
  name: string;
  brand: string;
  category: string;
  balance: number;
  unit: string;
  unitCost: number | null;
  supplier: string | null;
  location: string | null;
  minimumStock: number | null;
  idealStock: number | null;
  issuesFound: string;
  highestSeverity: IssueSeverity | null;
  possibleDuplicatesCount: number;
  recommendedAction: string;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { critico: 3, atencao: 2, informativo: 1 };

function highestSeverityOf(issues: DataQualityIssue[]): IssueSeverity | null {
  if (issues.length === 0) return null;
  return issues.reduce((worst, issue) => (SEVERITY_RANK[issue.severity] > SEVERITY_RANK[worst] ? issue.severity : worst), issues[0].severity);
}

export function buildAuditReportRows(items: InventoryItem[], issues: DataQualityIssue[], duplicateSuspects: DuplicateSuspect[]): AuditReportRow[] {
  const issuesByItem = new Map<string, DataQualityIssue[]>();
  for (const issue of issues) {
    const list = issuesByItem.get(issue.itemId) ?? [];
    list.push(issue);
    issuesByItem.set(issue.itemId, list);
  }

  const duplicateCountByItem = new Map<string, number>();
  for (const suspect of duplicateSuspects) {
    duplicateCountByItem.set(suspect.itemAId, (duplicateCountByItem.get(suspect.itemAId) ?? 0) + 1);
    duplicateCountByItem.set(suspect.itemBId, (duplicateCountByItem.get(suspect.itemBId) ?? 0) + 1);
  }

  return items
    .filter((item) => item.canonicalItemId === null)
    .map((item) => {
      const itemIssues = issuesByItem.get(item.id) ?? [];
      return {
        itemId: item.id,
        name: item.name,
        brand: item.brand,
        category: item.category,
        balance: item.currentQuantity,
        unit: item.unit,
        unitCost: item.unitCost,
        supplier: item.supplier,
        location: item.location,
        minimumStock: item.minimumStock,
        idealStock: item.idealStock,
        issuesFound: itemIssues.map((i) => i.title).join(" | "),
        highestSeverity: highestSeverityOf(itemIssues),
        possibleDuplicatesCount: duplicateCountByItem.get(item.id) ?? 0,
        recommendedAction: itemIssues[0]?.recommendedAction ?? "Nenhuma ação recomendada.",
      };
    });
}

const CSV_HEADER = ["Produto", "Marca", "Categoria", "Saldo", "Unidade-base", "Custo médio", "Fornecedor", "Localização", "Estoque mínimo", "Estoque ideal", "Problemas encontrados", "Gravidade", "Possíveis duplicidades", "Ação recomendada"];

function csvField(value: string | number | null): string {
  const str = value === null ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function auditReportRowsToCsv(rows: AuditReportRow[]): string {
  const lines = [CSV_HEADER.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.brand,
        row.category,
        row.balance,
        row.unit,
        row.unitCost,
        row.supplier,
        row.location,
        row.minimumStock,
        row.idealStock,
        row.issuesFound,
        row.highestSeverity ?? "",
        row.possibleDuplicatesCount,
        row.recommendedAction,
      ]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
