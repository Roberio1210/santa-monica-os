import { DollarSign, Gauge, ParkingSquare, Target, Ticket, Users, CalendarClock, Bell } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { VehiclesChart } from "@/components/charts/vehicles-chart";
import { PaymentMethodsChart } from "@/components/charts/payment-methods-chart";
import { ServicesChart } from "@/components/charts/services-chart";
import { CustomersChart } from "@/components/charts/customers-chart";
import { AgendaToday } from "@/components/dashboard/agenda-today";
import { RadarAlerts } from "@/components/dashboard/radar-alerts";
import { ZezinhoRecommendations } from "@/components/dashboard/zezinho-recommendations";
import { SummaryBlock } from "@/components/dashboard/summary-block";
import { mockFinanceSummary, mockRevenueSeries } from "@/data/mock/finance";
import { mockWashSummary } from "@/data/mock/wash";
import { mockParkingSummary } from "@/data/mock/parking";
import { mockSchedule } from "@/data/mock/schedule";
import { mockInventory } from "@/data/mock/inventory";
import { mockCampaigns, mockMarketingSummary } from "@/data/mock/marketing";
import { mockAlerts } from "@/data/mock/alerts";
import { mockRecommendations } from "@/data/mock/agents";
import { mockCustomers } from "@/data/mock/customers";
import { vehiclesPerDay, topServices, customersNewVsRecurring } from "@/data/mock/charts";
import { formatCurrency, formatPercent } from "@/lib/utils/format";

export default function DashboardPage() {
  const criticalInventory = mockInventory.filter((item) => item.status === "critico").length;
  const newCustomers = mockCustomers.filter((c) => c.segments.includes("novo")).length;
  const recurringCustomers = mockCustomers.filter((c) => c.segments.includes("recorrente")).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão Geral"
        description="Resumo executivo da Sta Monica Estética Automotiva e Estacionamento."
        actions={<DemoDataBadge />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Receita hoje" value={formatCurrency(mockFinanceSummary.dailyRevenue)} icon={DollarSign} trend={{ direction: "up", value: 4.2 }} />
        <StatCard label="Receita no mês" value={formatCurrency(mockFinanceSummary.monthlyRevenue)} icon={DollarSign} trend={{ direction: "up", value: 6.1 }} />
        <StatCard label="Meta mensal" value={formatCurrency(mockFinanceSummary.monthlyGoal)} icon={Target} hint={formatPercent(mockFinanceSummary.goalPercent, 1) + " atingido"} />
        <StatCard label="Ticket médio" value={formatCurrency(mockFinanceSummary.averageTicket)} icon={Ticket} trend={{ direction: "flat", value: 0 }} />
        <StatCard label="Veículos hoje" value={String(mockWashSummary.vehiclesServed)} icon={Gauge} hint="lavação" />
        <StatCard label="No estacionamento" value={String(mockParkingSummary.vehiclesPresent)} icon={ParkingSquare} hint={formatPercent(mockParkingSummary.occupancyPercent) + " ocupação"} />
        <StatCard label="Clientes novos" value={String(newCustomers)} icon={Users} hint="hoje" />
        <StatCard label="Clientes recorrentes" value={String(recurringCustomers)} icon={Users} hint="hoje" />
        <StatCard label="Agenda do dia" value={`${mockSchedule.length} horários`} icon={CalendarClock} />
        <StatCard label="Taxa de ocupação" value={formatPercent(mockParkingSummary.occupancyPercent)} icon={Gauge} />
        <StatCard label="Alertas ativos" value={String(mockAlerts.length)} icon={Bell} hint={criticalInventory > 0 ? `${criticalInventory} crítico(s)` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receita diária — Lavação x Estacionamento</CardTitle>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Veículos por dia</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <VehiclesChart data={vehiclesPerDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Serviços mais vendidos</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ServicesChart data={topServices} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clientes novos x recorrentes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <CustomersChart data={customersNewVsRecurring} />
          </CardContent>
        </Card>
      </div>

      <AgendaToday entries={mockSchedule} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SummaryBlock
          title="Lavação"
          href="/lavacao"
          rows={[
            { label: "Concluídos", value: String(mockWashSummary.completed) },
            { label: "Em execução", value: String(mockWashSummary.inProgress) },
            { label: "Aguardando", value: String(mockWashSummary.waiting) },
            { label: "Receita", value: formatCurrency(mockWashSummary.revenue) },
            { label: "Ticket médio", value: formatCurrency(mockWashSummary.averageTicket) },
            { label: "Capacidade utilizada", value: formatPercent(mockWashSummary.capacityUsedPercent) },
          ]}
        />
        <SummaryBlock
          title="Estacionamento"
          href="/estacionamento"
          rows={[
            { label: "Veículos presentes", value: String(mockParkingSummary.vehiclesPresent) },
            { label: "Entradas hoje", value: String(mockParkingSummary.entriesToday) },
            { label: "Saídas hoje", value: String(mockParkingSummary.exitsToday) },
            { label: "Ocupação", value: formatPercent(mockParkingSummary.occupancyPercent) },
            { label: "Receita", value: formatCurrency(mockParkingSummary.revenue) },
            { label: "Permanência média", value: `${mockParkingSummary.averageStayMinutes} min` },
          ]}
        />
        <SummaryBlock
          title="Financeiro"
          href="/financeiro"
          rows={[
            { label: "Faturamento hoje", value: formatCurrency(mockFinanceSummary.dailyRevenue) },
            { label: "Faturamento no mês", value: formatCurrency(mockFinanceSummary.monthlyRevenue) },
            { label: "Lavação", value: formatCurrency(mockFinanceSummary.washRevenue) },
            { label: "Estacionamento", value: formatCurrency(mockFinanceSummary.parkingRevenue) },
          ]}
        />
        <SummaryBlock
          title="Estoque"
          href="/estoque"
          rows={[
            { label: "Itens críticos", value: String(mockInventory.filter((i) => i.status === "critico").length) },
            { label: "Próximos do mínimo", value: String(mockInventory.filter((i) => i.status === "atencao").length) },
            { label: "Itens monitorados", value: String(mockInventory.length) },
            { label: "Sugestões de compra", value: String(mockInventory.filter((i) => i.purchaseSuggestion).length) },
          ]}
        />
        <SummaryBlock
          title="Marketing"
          href="/marketing"
          rows={[
            { label: "Campanhas ativas", value: String(mockCampaigns.filter((c) => c.status === "ativa").length) },
            { label: "Alcance total", value: mockMarketingSummary.totalReach.toLocaleString("pt-BR") },
            { label: "Leads", value: String(mockMarketingSummary.totalLeads) },
            { label: "Custo por lead médio", value: formatCurrency(mockMarketingSummary.averageCostPerLead) },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RadarAlerts alerts={mockAlerts} />
        <ZezinhoRecommendations recommendations={mockRecommendations} />
      </div>
    </div>
  );
}
