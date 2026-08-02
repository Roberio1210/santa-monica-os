import { MobileTopBar } from "@/components/attendance/mobile/top-bar";
import { OrderCard } from "@/components/attendance/mobile/order-card";
import { fetchManagerBoard } from "@/lib/attendance/service";

export const dynamic = "force-dynamic";

export default async function EntregasPage() {
  const { deliveredToday } = await fetchManagerBoard();

  return (
    <div>
      <MobileTopBar title="Entregas de Hoje" showBack />

      <div className="space-y-2.5 px-4 pt-4 pb-4">
        {deliveredToday.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground-subtle">Nenhuma entrega registrada hoje.</p>
        ) : (
          deliveredToday.map((order) => <OrderCard key={order.serviceOrderId} order={order} />)
        )}
      </div>
    </div>
  );
}
