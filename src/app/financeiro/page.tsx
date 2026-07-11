import Link from "next/link";
import { AlertTriangle, ArrowRight, DollarSign, FileClock, Handshake, TrendingUp, Wallet, Wifi } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Unavailable } from "@/components/shared/unavailable";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils/format";
import { isJumpParkConfigured } from "@/lib/config/env";
import { fetchOverviewMetrics } from "@/lib/integrations/jumppark";
import { fetchAccountsReceivableOverview, fetchCashMovements, fetchContracts } from "@/lib/finance/service";
import { resolveContractValue } from "@/lib/finance/status";

// Evita que dados do JumpPark e das contas a receber fiquem congelados no HTML estático.
export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getJumpParkOverview() {
  if (!isJumpParkConfigured()) return null;
  try {
    return await fetchOverviewMetrics();
  } catch {
    return null;
  }
}

export default async function FinanceiroPage() {
  const asOfDate = todayIso();
  const jumpPark = await getJumpParkOverview();
  const { summary: receivableSummary } = await fetchAccountsReceivableOverview(asOfDate);
  const cashMovements = await fetchCashMovements();
  const contracts = await fetchContracts();

  const todaysCashIn = cashMovements
    .filter((m) => m.type === "entrada" && m.date === asOfDate)
    .reduce((sum, m) => sum + m.amount, 0);

  const recentEntries = cashMovements
    .filter((m) => m.type === "entrada")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Faturamento operacional, caixa e contas a receber — sempre mostrados separadamente, nunca somados automaticamente."
        actions={
          jumpPark ? (
            <Badge variant="positive">
              <Wifi className="h-3 w-3" />
              JumpPark
            </Badge>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Faturamento operacional hoje"
          value={jumpPark ? formatCurrency(jumpPark.dailyRevenue) : "Informação indisponível"}
          icon={DollarSign}
          hint="JumpPark — serviços prestados hoje"
        />
        <StatCard
          label="Entradas de caixa hoje"
          value={formatCurrency(todaysCashIn)}
          icon={Wallet}
          hint="dinheiro que entrou hoje, qualquer competência"
        />
        <StatCard
          label="Contas a receber em aberto"
          value={formatCurrency(receivableSummary.totalOpen)}
          icon={FileClock}
          hint={`${receivableSummary.count} conta(s)`}
        />
        <StatCard
          label="Valores vencidos"
          value={formatCurrency(receivableSummary.totalOverdue)}
          icon={AlertTriangle}
        />
      </div>

      <Card>
        <CardContent className="pt-4 text-xs text-foreground-subtle">
          <p>
            <strong className="text-foreground-muted">Faturamento operacional</strong> é o serviço prestado no dia
            (fonte: JumpPark). <strong className="text-foreground-muted">Entrada de caixa</strong> é dinheiro que
            efetivamente entrou naquela data, podendo se referir a uma competência diferente (ex.: o recebimento de
            R$ 900,00 da IESA/Nissan em 10/07/2026 é uma entrada de caixa desse dia e a baixa de uma conta a receber
            de competência junho/2026 — nunca um serviço prestado em 10/07/2026). Os dois números acima nunca são
            somados entre si.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Origem da receita</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div className="flex items-center justify-between border-b border-border-subtle py-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-foreground-subtle" />
                <p className="text-sm text-foreground-muted">Receita JumpPark (mês)</p>
              </div>
              <p className="text-sm font-medium text-foreground">
                {jumpPark ? formatCurrency(jumpPark.monthlyRevenue) : <Unavailable label="Indisponível" />}
              </p>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Handshake className="h-4 w-4 text-foreground-subtle" />
                <p className="text-sm text-foreground-muted">Receita de contratos recebida (mês)</p>
              </div>
              <p className="text-sm font-medium text-foreground">{formatCurrency(receivableSummary.totalReceivedThisMonth)}</p>
            </div>
            <p className="pt-1 text-xs text-foreground-subtle">
              As duas linhas acima têm fontes diferentes (API JumpPark x contas a receber de contratos) e não se
              sobrepõem — somá-las manualmente também é seguro, mas o sistema não faz essa soma automaticamente para
              não mascarar a origem de cada valor.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Contas a Receber</CardTitle>
            <Link href="/financeiro/contas-a-receber" className="flex items-center gap-1 text-xs text-accent hover:underline">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-foreground-muted">
            <p>{receivableSummary.count} conta(s) cadastrada(s) · {receivableSummary.upcomingCount} vencendo nos próximos 7 dias.</p>
            <p className="mt-2 text-xs text-foreground-subtle">
              Contas a Pagar ainda não foi implementado nesta fase — nenhuma despesa foi lançada (ver
              docs/product-backlog.md).
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contratos recorrentes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Parceiro</th>
                  <th className="pb-2 pr-3 font-medium">Contrato</th>
                  <th className="pb-2 pr-3 font-medium">Vencimento</th>
                  <th className="pb-2 pr-3 font-medium">Valor vigente hoje</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => {
                  const currentValue =
                    contract.baseValue ?? (contract.valuePeriods.length > 0 ? resolveContractValue(contract.valuePeriods, asOfDate) : null);
                  return (
                    <tr key={contract.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{contract.partnerName}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{contract.title}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{contract.dueDay ? `dia ${contract.dueDay}` : "Não informado"}</td>
                      <td className="py-2 pr-3 text-foreground">
                        {currentValue !== null ? formatCurrency(currentValue) : <Unavailable label="Variável / sem vigência aplicável hoje" />}
                      </td>
                      <td className="py-2">
                        <Badge variant={contract.status === "ativo" ? "positive" : "outline"}>{contract.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recebimentos recentes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recentEntries.length === 0 ? (
            <Unavailable label="Nenhum recebimento registrado." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Descrição</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 font-medium">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEntries.map((entry) => (
                    <tr key={entry.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 text-foreground-muted">{entry.date}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{entry.description}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(entry.amount)}</td>
                      <td className="py-2 text-foreground-subtle">{entry.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico e formas de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Unavailable label="Informação indisponível — ainda não há série histórica real de receita nem volume suficiente de contas a receber (hoje só 1 registro) para uma distribuição por forma de pagamento. Nenhum número foi inventado para preencher este espaço." />
        </CardContent>
      </Card>
    </div>
  );
}
