import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Unavailable } from "@/components/shared/unavailable";
import { BankStatementLineRow } from "@/components/finance/bank-statement-line-row";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { BankStatementLine, BankStatementLineDirection, BankStatementLineStatus } from "@/lib/finance/bankStatement/types";
import type { FinancialAccountBalance } from "@/lib/finance/types";

const STATUS_LABELS: Record<BankStatementLineStatus, string> = {
  conciliado: "Conciliado",
  sugerido: "Sugerido",
  nao_conciliado: "Não conciliado",
  a_classificar: "A classificar",
  ignorado: "Ignorado",
};

const STATUS_VARIANT: Record<BankStatementLineStatus, "positive" | "warning" | "outline" | "info" | "critical"> = {
  conciliado: "positive",
  sugerido: "warning",
  nao_conciliado: "outline",
  a_classificar: "info",
  ignorado: "critical",
};

interface LinkOption {
  id: string;
  label: string;
}

interface BankStatementLineListProps {
  financialAccountId: string;
  lines: BankStatementLine[];
  financialAccounts: FinancialAccountBalance[];
  openReceivables: LinkOption[];
  openPayables: LinkOption[];
  currentStatus?: BankStatementLineStatus;
  currentDirection?: BankStatementLineDirection;
}

function FilterLink({ label, active, params }: { label: string; active: boolean; params: Record<string, string | undefined> }) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString();
  return (
    <Link href={`?${query}`} className={`rounded-full border px-3 py-1 text-xs ${active ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground-subtle hover:text-foreground"}`}>
      {label}
    </Link>
  );
}

export function BankStatementLineList({ financialAccountId, lines, financialAccounts, openReceivables, openPayables, currentStatus, currentDirection }: BankStatementLineListProps) {
  const baseParams = { direction: currentDirection, status: currentStatus };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linhas do extrato</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-wrap gap-2">
          <FilterLink label="Todos os status" active={!currentStatus} params={{ ...baseParams, status: undefined }} />
          {(Object.keys(STATUS_LABELS) as BankStatementLineStatus[]).map((s) => (
            <FilterLink key={s} label={STATUS_LABELS[s]} active={currentStatus === s} params={{ ...baseParams, status: s }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterLink label="Entrada e saída" active={!currentDirection} params={{ ...baseParams, direction: undefined }} />
          <FilterLink label="Só entradas" active={currentDirection === "entrada"} params={{ ...baseParams, direction: "entrada" }} />
          <FilterLink label="Só saídas" active={currentDirection === "saida"} params={{ ...baseParams, direction: "saida" }} />
        </div>

        {lines.length === 0 ? (
          <Unavailable label="Nenhuma linha de extrato importada neste período/filtro ainda." />
        ) : (
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.id} className="rounded-lg border border-border-subtle p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{line.description}</p>
                    <p className="text-xs text-foreground-subtle">
                      {formatDateBR(line.date)} {line.counterparty ? `· ${line.counterparty}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${line.direction === "entrada" ? "text-positive" : "text-critical"}`}>
                      {line.direction === "entrada" ? "+" : "-"}
                      {formatCurrency(line.amount)}
                    </span>
                    <Badge variant={STATUS_VARIANT[line.status]}>{STATUS_LABELS[line.status]}</Badge>
                  </div>
                </div>
                {line.reconciliationNote ? <p className="mt-1 text-xs text-foreground-subtle">{line.reconciliationNote}</p> : null}
                <BankStatementLineRow line={line} financialAccountId={financialAccountId} financialAccounts={financialAccounts} openReceivables={openReceivables} openPayables={openPayables} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
