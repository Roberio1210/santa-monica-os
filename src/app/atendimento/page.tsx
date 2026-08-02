import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderStatusActions } from "@/components/attendance/order-status-actions";
import { fetchManagerBoard } from "@/lib/attendance/service";

export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  const board = await fetchManagerBoard();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel do Gerente"
        description="Atendimentos em andamento — direto ao ponto, sem gráfico."
        actions={
          <Link href="/atendimento/novo">
            <Button type="button" className="h-11 px-6 text-base">
              <Plus className="h-4 w-4" />
              Novo Atendimento
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {board.columns.map((column) => (
          <Card key={column.status}>
            <CardHeader>
              <CardTitle>
                {column.label} — {column.orders.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {column.orders.length === 0 ? (
                <p className="text-xs text-foreground-subtle">Nenhum carro nesta etapa.</p>
              ) : (
                column.orders.map((order) => (
                  <div key={order.serviceOrderId} className="space-y-2 rounded-lg border border-border-subtle p-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{order.customerName ?? "Cliente"}</p>
                      <p className="text-xs text-foreground-muted">
                        {order.vehicleModel ?? "Veículo"} {order.vehiclePlate ? `— ${order.vehiclePlate}` : ""}
                      </p>
                    </div>
                    <OrderStatusActions serviceOrderId={order.serviceOrderId} status={order.status} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Carros entregues hoje — {board.deliveredToday.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {board.deliveredToday.length === 0 ? (
            <EmptyState title="Nenhuma entrega registrada hoje." />
          ) : (
            <ul className="space-y-1">
              {board.deliveredToday.map((order) => (
                <li key={order.serviceOrderId} className="text-sm text-foreground-muted">
                  {order.customerName ?? "Cliente"} — {order.vehicleModel ?? "Veículo"} {order.vehiclePlate ? `(${order.vehiclePlate})` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
