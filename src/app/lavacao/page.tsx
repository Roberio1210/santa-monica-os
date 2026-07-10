import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusLabel, statusVariant } from "@/lib/utils/status";
import { mockWashOrders, mockWashSummary } from "@/data/mock/wash";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { Car, DollarSign, Gauge, Ticket } from "lucide-react";

const paymentLabels: Record<string, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  outro: "Outro",
};

export default function LavacaoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Lavação"
        description="Produtividade, capacidade e status dos veículos em serviço."
        actions={<DemoDataBadge />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Receita" value={formatCurrency(mockWashSummary.revenue)} icon={DollarSign} />
        <StatCard label="Veículos atendidos" value={String(mockWashSummary.vehiclesServed)} icon={Car} />
        <StatCard label="Ticket médio" value={formatCurrency(mockWashSummary.averageTicket)} icon={Ticket} />
        <StatCard label="Capacidade utilizada" value={formatPercent(mockWashSummary.capacityUsedPercent)} icon={Gauge} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-semibold text-positive">{mockWashSummary.completed}</p>
            <p className="text-xs text-foreground-muted">Concluídos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-semibold text-warning">{mockWashSummary.inProgress}</p>
            <p className="text-xs text-foreground-muted">Em execução</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-semibold text-foreground-muted">{mockWashSummary.waiting}</p>
            <p className="text-xs text-foreground-muted">Aguardando</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ordens de serviço</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Horário</th>
                  <th className="pb-2 pr-3 font-medium">Cliente</th>
                  <th className="pb-2 pr-3 font-medium">Veículo</th>
                  <th className="pb-2 pr-3 font-medium">Placa</th>
                  <th className="pb-2 pr-3 font-medium">Pacote</th>
                  <th className="pb-2 pr-3 font-medium">Adicionais</th>
                  <th className="pb-2 pr-3 font-medium">Valor</th>
                  <th className="pb-2 pr-3 font-medium">Pagamento</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockWashOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-foreground">{order.time}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.customerName}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.vehicleModel}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{order.plateMasked}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.package}</td>
                    <td className="py-2 pr-3 text-foreground-subtle">{order.extras.join(", ") || "—"}</td>
                    <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(order.amount)}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{paymentLabels[order.paymentMethod]}</td>
                    <td className="py-2">
                      <Badge variant={statusVariant(order.status)}>{statusLabel(order.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
