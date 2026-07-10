import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { PaymentMethodsChart } from "@/components/charts/payment-methods-chart";
import { mockFinanceSummary, mockRevenueSeries, mockMonthlyRevenueSeries } from "@/data/mock/finance";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { DollarSign, Target, Ticket, TrendingUp } from "lucide-react";

export default function FinanceiroPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        description="Faturamento, formas de pagamento e evolução da receita."
        actions={<DemoDataBadge />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Receita hoje" value={formatCurrency(mockFinanceSummary.dailyRevenue)} icon={DollarSign} />
        <StatCard label="Receita no mês" value={formatCurrency(mockFinanceSummary.monthlyRevenue)} icon={TrendingUp} />
        <StatCard label="Meta mensal" value={formatPercent(mockFinanceSummary.goalPercent, 1)} icon={Target} hint={formatCurrency(mockFinanceSummary.monthlyGoal)} />
        <StatCard label="Ticket médio" value={formatCurrency(mockFinanceSummary.averageTicket)} icon={Ticket} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receita diária — últimos 7 dias</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <RevenueChart data={mockRevenueSeries} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Formas de pagamento</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <PaymentMethodsChart data={mockFinanceSummary.paymentBreakdown} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita mensal — Lavação x Estacionamento</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <RevenueChart data={mockMonthlyRevenueSeries} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contas a pagar / receber</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-foreground-muted">
            Módulo preparado para conexão futura com conciliação Stone, fluxo de caixa e despesas.
            Nenhuma movimentação real é executada nesta fase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
