import { MobileTopBar } from "@/components/attendance/mobile/top-bar";
import { OrderCard } from "@/components/attendance/mobile/order-card";
import { fetchManagerBoard } from "@/lib/attendance/service";

export const dynamic = "force-dynamic";

export default async function ExecucaoPage() {
  const { columns } = await fetchManagerBoard();
  const totalActive = columns.reduce((sum, c) => sum + c.orders.length, 0);

  return (
    <div>
      <MobileTopBar title="Carros em Execução" />

      <div className="space-y-6 px-4 pt-4 pb-4">
        {totalActive === 0 ? (
          <p className="py-8 text-center text-sm text-foreground-subtle">Nenhum carro em atendimento no momento.</p>
        ) : (
          columns
            .filter((column) => column.orders.length > 0)
            .map((column) => (
              <div key={column.status} className="space-y-2.5">
                <p className="text-xs font-medium text-foreground-subtle">
                  {column.label} · {column.orders.length}
                </p>
                {column.orders.map((order) => (
                  <OrderCard key={order.serviceOrderId} order={order} />
                ))}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
