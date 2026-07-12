import { CentralHeader } from "@/components/operations/central-header";
import { TodayPanel } from "@/components/operations/today-panel";
import { AgendaBlock } from "@/components/operations/agenda-block";
import { FinancialBlock } from "@/components/operations/financial-block";
import { OperationBlock } from "@/components/operations/operation-block";
import { ClientsBlock } from "@/components/operations/clients-block";
import { AlertList } from "@/components/operations/alert-list";
import { ZezinhoSummaryCard } from "@/components/operations/zezinho-summary-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { computeConsolidatedAlerts, computeSituation, fetchCentralOverview } from "@/lib/operations/central";
import { getStorageMode } from "@/lib/storage/mode";

// Consulta dados reais a cada acesso — a Central nunca deve servir HTML estático desatualizado.
export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const asOfDate = todayIso();
  const overview = await fetchCentralOverview(asOfDate);
  const storageMode = getStorageMode();
  const situation = computeSituation(overview);
  const alerts = computeConsolidatedAlerts(overview);

  return (
    <div className="space-y-6">
      <CentralHeader overview={overview} situation={situation} storageMode={storageMode} />

      <TodayPanel overview={overview} alertsCount={alerts.length} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgendaBlock />
        <FinancialBlock overview={overview} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OperationBlock overview={overview} />
        <ClientsBlock overview={overview} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Alertas
              <Button asChild variant="outline">
                <Link href="/alertas">Ver todos</Link>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AlertList alerts={alerts.slice(0, 5)} />
          </CardContent>
        </Card>

        <ZezinhoSummaryCard overview={overview} alerts={alerts} />
      </div>
    </div>
  );
}
