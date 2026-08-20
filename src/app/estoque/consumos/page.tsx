import { PageHeader } from "@/components/shared/page-header";
import { ConsumptionsView } from "@/components/inventory/consumptions-view";
import { listConsumptionConfirmations } from "@/lib/jumppark-orders/consumption-history";
import { isJumpParkConfigured } from "@/lib/config/env";
import { Unavailable } from "@/components/shared/unavailable";
import { stripFinancialFieldsFromConfirmations } from "@/lib/inventory/operational-view";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ConsumosPage() {
  const configured = isJumpParkConfigured();
  const currentUser = await getCurrentUser();
  let confirmations = await listConsumptionConfirmations();
  // Missão de Usuários Individuais (V5.3) — cada linha de consumo carrega "knownCost" (custo × quantidade); nunca chega ao operacional, nem no payload da tabela nem no valor exibido.
  if (currentUser?.role === "operacional") confirmations = stripFinancialFieldsFromConfirmations(confirmations);

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
