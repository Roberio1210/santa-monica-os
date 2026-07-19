import { PageHeader } from "@/components/shared/page-header";
import { ConsumptionsView } from "@/components/inventory/consumptions-view";
import { listConsumptionConfirmations } from "@/lib/orders/consumption-history";
import { isJumpParkConfigured } from "@/lib/config/env";
import { Unavailable } from "@/components/shared/unavailable";

export const dynamic = "force-dynamic";

export default async function ConsumosPage() {
  const configured = isJumpParkConfigured();
  const confirmations = await listConsumptionConfirmations();

  return (
    <div className="space-y-6">
      <PageHeader title="Consumos de Estoque" description="Histórico de baixas confirmadas a partir de ordens do JumpPark — inclui estornos." />
      {!configured && confirmations.length === 0 ? (
        <Unavailable label="JumpPark não configurado neste ambiente — nenhum consumo foi confirmado ainda." />
      ) : (
        <ConsumptionsView confirmations={confirmations} />
      )}
    </div>
  );
}
