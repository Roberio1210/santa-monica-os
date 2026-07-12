import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Unavailable } from "@/components/shared/unavailable";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { findFirstNegativeProjection, sumOutstandingDueOn, sumOutstandingDueWithin, type CentralOverview } from "@/lib/operations/central";

function addDaysIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function FinancialBlock({ overview }: { overview: CentralOverview }) {
  const today = overview.asOfDate;
  const in7Days = addDaysIso(today, 7);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financeiro</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {!overview.cashFlow.data ? (
          <Unavailable label={overview.cashFlow.error ?? "Informação indisponível"} />
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium text-foreground-muted">Saldo por conta</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {overview.cashFlow.data.accounts.map((account) => {
                  const diff = account.informedBalance !== null ? Math.round((account.informedBalance - account.currentBalance) * 100) / 100 : null;
                  return (
                    <Link
                      key={account.id}
                      href="/financeiro/fluxo-de-caixa"
                      className="rounded-lg border border-border-subtle p-2 text-sm transition-colors hover:border-accent/50 hover:bg-background-elevated"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-foreground-muted">{account.name}</span>
                        {account.belowThreshold ? <Badge variant="warning">Baixo</Badge> : null}
                      </div>
                      <p className="text-base font-semibold text-foreground">{formatCurrency(account.currentBalance)}</p>
                      <p className="text-xs text-foreground-subtle">Saldo calculado pelo sistema</p>
                      {account.informedBalance !== null ? (
                        <p className="text-xs text-foreground-subtle">
                          Informado: {formatCurrency(account.informedBalance)}
                          {diff !== null && Math.abs(diff) > 0.01 ? <span className="ml-1 text-warning">(diferença: {formatCurrency(diff)})</span> : null}
                        </p>
                      ) : null}
                    </Link>
                  );
                })}
                <div className="rounded-lg border border-border-subtle bg-background-elevated p-2 text-sm">
                  <span className="text-foreground-muted">Consolidado</span>
                  <p className="text-base font-semibold text-foreground">{formatCurrency(overview.cashFlow.data.dashboard.saldoGeral)}</p>
                  <p className="text-xs text-foreground-subtle">Soma calculada — nunca confirmada como saldo bancário oficial</p>
                </div>
              </div>
            </div>

            {(() => {
              const negative = findFirstNegativeProjection(overview.cashFlow.data.projection, today);
              return negative ? (
                <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-xs text-critical">
                  Saldo projetado fica negativo a partir de {formatDateBR(negative.date)} ({formatCurrency(negative.point.saldoProjetado)}), caso isso realmente ocorra.
                </p>
              ) : (
                <p className="text-xs text-foreground-subtle">Nenhuma janela de projeção (até 90 dias) indica saldo negativo no momento.</p>
              );
            })()}
          </>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Link href="/financeiro/contas-a-pagar?quick=vence_hoje" className="rounded-lg border border-border-subtle p-2 hover:border-accent/50 hover:bg-background-elevated">
            <p className="text-xs text-foreground-subtle">A pagar hoje</p>
            <p className="font-medium text-foreground">
              {overview.accountsPayable.data ? formatCurrency(sumOutstandingDueOn(overview.accountsPayable.data.items, today)) : "—"}
            </p>
          </Link>
          <Link href="/financeiro/contas-a-pagar?quick=7_dias" className="rounded-lg border border-border-subtle p-2 hover:border-accent/50 hover:bg-background-elevated">
            <p className="text-xs text-foreground-subtle">A pagar em 7 dias</p>
            <p className="font-medium text-foreground">
              {overview.accountsPayable.data ? formatCurrency(sumOutstandingDueWithin(overview.accountsPayable.data.items, today, in7Days)) : "—"}
            </p>
          </Link>
          <Link href={`/financeiro/contas-a-receber?dueFrom=${today}&dueTo=${today}`} className="rounded-lg border border-border-subtle p-2 hover:border-accent/50 hover:bg-background-elevated">
            <p className="text-xs text-foreground-subtle">A receber hoje</p>
            <p className="font-medium text-foreground">
              {overview.accountsReceivable.data ? formatCurrency(sumOutstandingDueOn(overview.accountsReceivable.data.items, today)) : "—"}
            </p>
          </Link>
          <Link href={`/financeiro/contas-a-receber?dueFrom=${today}&dueTo=${in7Days}`} className="rounded-lg border border-border-subtle p-2 hover:border-accent/50 hover:bg-background-elevated">
            <p className="text-xs text-foreground-subtle">A receber em 7 dias</p>
            <p className="font-medium text-foreground">
              {overview.accountsReceivable.data ? formatCurrency(sumOutstandingDueWithin(overview.accountsReceivable.data.items, today, in7Days)) : "—"}
            </p>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
