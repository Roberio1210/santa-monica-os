import Link from "next/link";
import { CentralHeader } from "@/components/operations/central-header";
import { PriorityPanel } from "@/components/operations/priority-panel";
import { TodayPanel } from "@/components/operations/today-panel";
import { AgendaBlock } from "@/components/operations/agenda-block";
import { MovementTimelineBlock } from "@/components/operations/movement-timeline-block";
import { CashTodayBlock } from "@/components/operations/cash-today-block";
import { FinancialBlock } from "@/components/operations/financial-block";
import { OperationBlock } from "@/components/operations/operation-block";
import { TopClientsBlock } from "@/components/operations/top-clients-block";
import { ClientsBlock } from "@/components/operations/clients-block";
import { AlertsBySeverity } from "@/components/operations/alerts-by-severity";
import { ZezinhoSummaryCard } from "@/components/operations/zezinho-summary-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  const alerts = computeConsolidatedAlerts(overview);
  const situation = computeSituation(alerts);

  return (
    <div className="space-y-8">
      <CentralHeader overview={overview} situation={situation} storageMode={storageMode} />

      <PriorityPanel overview={overview} />

      <TodayPanel overview={overview} alertsCount={alerts.length} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgendaBlock />
        <MovementTimelineBlock overview={overview} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CashTodayBlock overview={overview} />
        <FinancialBlock overview={overview} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OperationBlock overview={overview} />
        <div className="grid grid-cols-1 gap-4">
          <TopClientsBlock />
          <ClientsBlock overview={overview} />
        </div>
      </div>

      <Card className="p-0">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Alertas</CardTitle>
          <Button asChild variant="outline">
            <Link href="/alertas">Ver todos</Link>
          </Button>
        </CardHeader>
        <div className="p-4 pt-0">
          <AlertsBySeverity alerts={alerts} />
        </div>
      </Card>

      <ZezinhoSummaryCard overview={overview} alerts={alerts} />
    </div>
  );
}
