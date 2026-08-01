import { DollarSign, Users, Car, ClipboardCheck, Ticket, Wallet, Receipt, TrendingDown, Wifi } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Unavailable } from "@/components/shared/unavailable";
import { PeriodSelector } from "@/components/operations/period-selector";
import { RefreshButton } from "@/components/operations/refresh-button";
import { StatCard } from "@/components/cards/stat-card";
import { OrdersTable } from "@/components/painel-gerencial/orders-table";
import { CustomersSection } from "@/components/painel-gerencial/customers-section";
import { ServicesSection } from "@/components/painel-gerencial/services-section";
import { ExpensesSection } from "@/components/painel-gerencial/expenses-section";
import { FindingsSection } from "@/components/painel-gerencial/findings-section";
import { fetchPainelGerencial } from "@/lib/painel-gerencial/service";
import { parsePeriodParams, SAO_PAULO_TZ } from "@/lib/utils/timezone";
import { formatCurrency } from "@/lib/utils/format";

// Consulta dados reais (JumpPark + Contas a Pagar) a cada acesso — nunca serve HTML desatualizado.
export const dynamic = "force-dynamic";

function formatGeneratedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default async function PainelGerencialPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const result = await fetchPainelGerencial(period);
  const { indicators } = result;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel Gerencial"
        description="Visão gerencial com dados reais da JumpPark e do Financeiro — vendas, clientes, serviços, despesas e pontos de atenção."
        actions={
          <div className="flex items-center gap-2">
            {result.jumpparkConfigured && !result.jumpparkError ? (
              <Badge variant="positive">
                <Wifi className="h-3 w-3" />
                JumpPark
              </Badge>
            ) : null}
            <RefreshButton />
          </div>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector period={period} />
        <p className="text-xs text-foreground-subtle">Atualizado às {formatGeneratedAt(result.generatedAt)}</p>
      </div>

      {!result.jumpparkConfigured ? (
        <Card>
          <CardContent className="pt-4">
            <Unavailable label="JumpPark não configurado neste ambiente — indicadores de venda indisponíveis. Despesas seguem disponíveis abaixo." />
          </CardContent>
        </Card>
      ) : result.jumpparkError ? (
        <Card>
          <CardContent className="pt-4">
            <Unavailable label={result.jumpparkError} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Faturamento bruto" value={formatCurrency(indicators.grossRevenue)} icon={DollarSign} />
        <StatCard label="Descontos" value={formatCurrency(indicators.discountTotal)} icon={TrendingDown} />
        <StatCard label="Faturamento líquido" value={formatCurrency(indicators.netRevenue)} icon={DollarSign} />
        <StatCard label="Ticket médio" value={indicators.averageTicket !== null ? formatCurrency(indicators.averageTicket) : "—"} icon={Ticket} />
        <StatCard label="Atendimentos" value={String(indicators.ordersCount)} icon={ClipboardCheck} />
        <StatCard label="Veículos atendidos" value={String(indicators.vehiclesCount)} icon={Car} />
        <StatCard label="Clientes atendidos" value={String(indicators.customersCount)} icon={Users} />
        <StatCard label="Valor recebido" value={formatCurrency(indicators.receivedAmount)} icon={Wallet} />
        {indicators.pendingAmount > 0 ? <StatCard label="Valor pendente" value={formatCurrency(indicators.pendingAmount)} icon={Wallet} /> : null}
        <StatCard label="Despesas registradas" value={formatCurrency(result.expenses.summary.total)} icon={Receipt} />
        <StatCard
          label="Resultado operacional com dados registrados"
          value={formatCurrency(result.operationalResult)}
          icon={result.operationalResult >= 0 ? DollarSign : TrendingDown}
          hint="Faturamento líquido menos despesas registradas — não é lucro contábil"
        />
      </div>

      <FindingsSection findings={result.findings} />

      <OrdersTable orders={result.orders} period={period} />

      <CustomersSection customers={result.customers} />

      <ServicesSection services={result.services} />

      <ExpensesSection expenses={result.expenses} />
    </div>
  );
}
