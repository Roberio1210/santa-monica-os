import Link from "next/link";
import { CentralHeader } from "@/components/operations/central-header";
import { AgoraPanel } from "@/components/operations/agora-panel";
import { MovementTimelineBlock } from "@/components/operations/movement-timeline-block";
import { TopClientsBlock } from "@/components/operations/top-clients-block";
import { ClientsBlock } from "@/components/operations/clients-block";
import { AlertsBySeverity } from "@/components/operations/alerts-by-severity";
import { ZezinhoSummaryCard } from "@/components/operations/zezinho-summary-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { APP_MODULES } from "@/components/navigation/app-modules";
import { ModuleShortcuts } from "@/components/navigation/module-shortcuts";
import { computeConsolidatedAlerts, fetchCentralOverview } from "@/lib/operations/central";
import { getStorageMode } from "@/lib/storage/mode";
import { saoPauloDateISO } from "@/lib/utils/timezone";

// Consulta dados reais a cada acesso — a Central nunca deve servir HTML estático desatualizado.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const asOfDate = saoPauloDateISO();
  const overview = await fetchCentralOverview(asOfDate);
  const storageMode = getStorageMode();
  const alerts = computeConsolidatedAlerts(overview);

  const centralModule = APP_MODULES.find((m) => m.id === "central-operacoes")!;
  const operacaoShortcuts = centralModule.shortcuts.filter((s) => s.group === "operacao");
  const gestaoShortcuts = centralModule.shortcuts.filter((s) => s.group === "gestao");

  return (
    <div className="space-y-8">
      {/* NÍVEL 1 — situação geral fica só no cabeçalho global (Missão 4C); aqui, o que exige atenção agora */}
      <CentralHeader overview={overview} storageMode={storageMode} />

      <AgoraPanel overview={overview} alertsCount={alerts.length} />

      {/* NÍVEL 2 — blocos de acesso agrupados (Operação / Gestão), nunca uma fileira única de botões idênticos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ModuleShortcuts shortcuts={operacaoShortcuts} title="Operação" />
        <ModuleShortcuts shortcuts={gestaoShortcuts} title="Gestão" />
      </div>

      <MovementTimelineBlock overview={overview} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopClientsBlock />
        <ClientsBlock overview={overview} />
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
