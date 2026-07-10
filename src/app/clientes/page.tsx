import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockCustomers } from "@/data/mock/customers";
import { mockVehicles } from "@/data/mock/vehicles";
import { formatCurrency } from "@/lib/utils/format";
import type { CustomerSegment } from "@/types/customer";

const segmentLabels: Record<CustomerSegment, string> = {
  novo: "Novo",
  recorrente: "Recorrente",
  vip: "VIP",
  inativo_30: "Inativo 30d+",
  inativo_60: "Inativo 60d+",
  alto_ticket: "Alto ticket",
  oportunidade_retorno: "Oportunidade de retorno",
};

const paymentLabels: Record<string, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  outro: "Outro",
};

export default function ClientesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Relacionamento, segmentação e histórico de visitas."
        actions={<DemoDataBadge />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Base de clientes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Nome</th>
                  <th className="pb-2 pr-3 font-medium">Telefone</th>
                  <th className="pb-2 pr-3 font-medium">Veículo</th>
                  <th className="pb-2 pr-3 font-medium">Placa</th>
                  <th className="pb-2 pr-3 font-medium">Última visita</th>
                  <th className="pb-2 pr-3 font-medium">Visitas</th>
                  <th className="pb-2 pr-3 font-medium">Total gasto</th>
                  <th className="pb-2 pr-3 font-medium">Ticket médio</th>
                  <th className="pb-2 pr-3 font-medium">Serviço favorito</th>
                  <th className="pb-2 pr-3 font-medium">Pagamento</th>
                  <th className="pb-2 font-medium">Segmentos</th>
                </tr>
              </thead>
              <tbody>
                {mockCustomers.map((customer) => {
                  const vehicle = mockVehicles.find((v) => customer.vehicleIds.includes(v.id));
                  return (
                    <tr key={customer.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{customer.name}</td>
                      <td className="py-2 pr-3 text-foreground-subtle">{customer.phoneMasked}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{vehicle?.model ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{vehicle?.plateMasked ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{customer.lastVisit}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{customer.visitCount}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(customer.totalSpent)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(customer.averageTicket)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{customer.favoriteService}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{paymentLabels[customer.preferredPaymentMethod]}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {customer.segments.map((segment) => (
                            <Badge key={segment} variant={segment === "vip" ? "positive" : segment.startsWith("inativo") ? "warning" : "outline"}>
                              {segmentLabels[segment]}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
