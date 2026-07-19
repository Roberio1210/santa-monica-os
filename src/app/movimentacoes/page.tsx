import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/operations/period-selector";
import { MovementsView } from "@/components/operations/movements-view";
import { fetchOperationalOrders, computeOperationalSummary } from "@/lib/integrations/jumppark/operations-summary";
import { parsePeriodParams } from "@/lib/utils/timezone";
import { Wifi } from "lucide-react";

// Consulta dados reais do JumpPark a cada acesso — nunca serve HTML estático desatualizado.
export const dynamic = "force-dynamic";

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const result = await fetchOperationalOrders(period.from, period.to);
  const summary = computeOperationalSummary(result.orders);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimentações"
        description="Ordens finalizadas reais do JumpPark — carros atendidos, serviços, valores e formas de pagamento."
        actions={
          result.jumpparkConfigured && !result.error ? (
            <Badge variant="positive">
              <Wifi className="h-3 w-3" />
              JumpPark
            </Badge>
          ) : undefined
        }
      />

      <PeriodSelector period={period} />

      {!result.jumpparkConfigured ? (
        <Card>
          <CardContent className="pt-4">
            <Unavailable label="JumpPark não configurado neste ambiente — sem dados reais disponíveis nesta tela." />
          </CardContent>
        </Card>
      ) : result.error ? (
        <Card>
          <CardContent className="pt-4">
            <Unavailable label={result.error} />
          </CardContent>
        </Card>
      ) : (
        <MovementsView orders={result.orders} summary={summary} period={period} />
      )}
    </div>
  );
}
