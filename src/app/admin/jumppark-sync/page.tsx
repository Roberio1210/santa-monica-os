import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JumpParkSyncPanel } from "@/components/admin/jumppark-sync-panel";
import { JumpParkBackfillPanel } from "@/components/admin/jumppark-backfill-panel";
import { fetchJumpParkSyncStatus } from "@/lib/integrations/jumppark/sync";

export const dynamic = "force-dynamic";

export default async function JumpParkSyncPage() {
  const status = await fetchJumpParkSyncStatus();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sincronização JumpPark — Service Orders"
        description="Sincronização idempotente das Ordens de Serviço da JumpPark para o Neon, com recálculo automático de Clientes/Veículos a cada execução (Missão 26) e backfill histórico em lotes (Missão 27)."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/diagnostico">Ver diagnóstico geral</Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Sincronização manual (janela curta)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <JumpParkSyncPanel initial={status} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Backfill histórico</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <JumpParkBackfillPanel />
        </CardContent>
      </Card>
    </div>
  );
}
