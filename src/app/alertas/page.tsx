import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AlertList } from "@/components/operations/alert-list";
import { computeConsolidatedAlerts, fetchCentralOverview } from "@/lib/operations/central";

export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AlertasPage() {
  const overview = await fetchCentralOverview(todayIso());
  const alerts = computeConsolidatedAlerts(overview);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Alertas"
        description="Consolida os alertas já calculados pelos módulos existentes — nada é enviado por WhatsApp, e-mail ou push nesta etapa."
      />

      <Card>
        <CardContent className="pt-4">
          <AlertList alerts={alerts} />
        </CardContent>
      </Card>
    </div>
  );
}
