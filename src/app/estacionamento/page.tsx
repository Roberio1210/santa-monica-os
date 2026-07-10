import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockParkingEntries, mockParkingSummary } from "@/data/mock/parking";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { Car, DollarSign, Gauge, LogIn, LogOut, Timer } from "lucide-react";

const paymentLabels: Record<string, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  outro: "Outro",
};

export default function EstacionamentoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Estacionamento"
        description="Ocupação, movimentação e receita do estacionamento."
        actions={<DemoDataBadge />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Veículos presentes" value={String(mockParkingSummary.vehiclesPresent)} icon={Car} />
        <StatCard label="Entradas hoje" value={String(mockParkingSummary.entriesToday)} icon={LogIn} />
        <StatCard label="Saídas hoje" value={String(mockParkingSummary.exitsToday)} icon={LogOut} />
        <StatCard label="Ocupação" value={formatPercent(mockParkingSummary.occupancyPercent)} icon={Gauge} />
        <StatCard label="Receita" value={formatCurrency(mockParkingSummary.revenue)} icon={DollarSign} />
        <StatCard label="Permanência média" value={`${mockParkingSummary.averageStayMinutes} min`} icon={Timer} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movimentação</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Placa</th>
                  <th className="pb-2 pr-3 font-medium">Veículo</th>
                  <th className="pb-2 pr-3 font-medium">Cliente</th>
                  <th className="pb-2 pr-3 font-medium">Entrada</th>
                  <th className="pb-2 pr-3 font-medium">Saída</th>
                  <th className="pb-2 pr-3 font-medium">Permanência</th>
                  <th className="pb-2 pr-3 font-medium">Valor</th>
                  <th className="pb-2 pr-3 font-medium">Pagamento</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockParkingEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{entry.plateMasked}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{entry.vehicleModel}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{entry.customerName}</td>
                    <td className="py-2 pr-3 text-foreground">{entry.entryTime}</td>
                    <td className="py-2 pr-3 text-foreground">{entry.exitTime ?? "—"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">
                      {entry.durationMinutes ? `${entry.durationMinutes} min` : "—"}
                    </td>
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {entry.amount > 0 ? formatCurrency(entry.amount) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">
                      {entry.paymentMethod ? paymentLabels[entry.paymentMethod] : "—"}
                    </td>
                    <td className="py-2">
                      <Badge variant={entry.status === "presente" ? "info" : "default"}>
                        {entry.status === "presente" ? "Presente" : "Finalizado"}
                      </Badge>
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
