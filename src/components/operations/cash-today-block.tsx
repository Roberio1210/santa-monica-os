import Link from "next/link";
import { Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { formatCurrency } from "@/lib/utils/format";
import { computeYesterdayResult, type CentralOverview } from "@/lib/operations/central";

export function CashTodayBlock({ overview }: { overview: CentralOverview }) {
  const cashFlow = overview.cashFlow.data;
  const yesterdayResult = cashFlow ? computeYesterdayResult(cashFlow.ledger, overview.asOfDate) : null;
  const diff = cashFlow && yesterdayResult !== null ? Math.round((cashFlow.dashboard.resultadoDia - yesterdayResult) * 100) / 100 : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Caixa do dia
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {!cashFlow ? (
          <Unavailable label={overview.cashFlow.error ?? "Informação indisponível"} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link href={`/financeiro/fluxo-de-caixa?tipo=entrada&data=${overview.asOfDate}`} className="rounded-lg border border-border-subtle p-2 transition-colors hover:border-accent/50 hover:bg-background-elevated">
              <p className="text-xs text-foreground-subtle">Entrou hoje</p>
              <p className="font-semibold text-positive">{formatCurrency(cashFlow.dashboard.entradasHoje)}</p>
            </Link>
            <Link href={`/financeiro/fluxo-de-caixa?tipo=saida&data=${overview.asOfDate}`} className="rounded-lg border border-border-subtle p-2 transition-colors hover:border-accent/50 hover:bg-background-elevated">
              <p className="text-xs text-foreground-subtle">Saiu hoje</p>
              <p className="font-semibold text-critical">{formatCurrency(cashFlow.dashboard.saidasHoje)}</p>
            </Link>
            <Link href="/financeiro/fluxo-de-caixa" className="rounded-lg border border-border-subtle p-2 transition-colors hover:border-accent/50 hover:bg-background-elevated">
              <p className="text-xs text-foreground-subtle">Saldo atual</p>
              <p className="font-semibold text-foreground">{formatCurrency(cashFlow.dashboard.saldoGeral)}</p>
            </Link>
            <div className="rounded-lg border border-border-subtle p-2">
              <p className="text-xs text-foreground-subtle">Diferença para ontem</p>
              {diff !== null ? (
                <p className={`font-semibold ${diff >= 0 ? "text-positive" : "text-critical"}`}>
                  {diff >= 0 ? "+" : ""}
                  {formatCurrency(diff)}
                </p>
              ) : (
                <Unavailable />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
