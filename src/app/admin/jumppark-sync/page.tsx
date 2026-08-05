import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JumpParkSyncPanel } from "@/components/admin/jumppark-sync-panel";
import { fetchJumpParkSyncStatus } from "@/lib/integrations/jumppark/sync";

export const dynamic = "force-dynamic";

export default async function JumpParkSyncPage() {
  const status = await fetchJumpParkSyncStatus();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sincronização JumpPark — Service Orders"
        description="Missão 26, Fase 1 (primeira entrega): sincronização manual e idempotente das Ordens de Serviço da JumpPark para o Neon. Clientes, veículos, produtos, estoque, CRM e indicadores continuam fora desta entrega."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/diagnostico">Ver diagnóstico geral</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-4">
          <JumpParkSyncPanel initial={status} />
        </CardContent>
      </Card>
    </div>
  );
}
