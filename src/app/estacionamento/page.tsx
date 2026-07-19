import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/operations/period-selector";
import { ParkingView } from "@/components/operations/parking-view";
import { fetchOperationalOrders, computeOperationalSummary, fetchReferencePeriodSummaries } from "@/lib/integrations/jumppark/operations-summary";
import { parsePeriodParams } from "@/lib/utils/timezone";
import { Wifi } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EstacionamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriodParams(params);

  const [result, reference] = await Promise.all([fetchOperationalOrders(period.from, period.to), fetchReferencePeriodSummaries()]);
  const parkingOrders = result.orders.filter((o) => o.kind === "estacionamento");
  const summary = computeOperationalSummary(parkingOrders);
  const entriesInPeriod = parkingOrders.filter((o) => {
    const entryDate = o.entryDateTime?.slice(0, 10);
    return entryDate && entryDate >= period.from && entryDate <= period.to;
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estacionamento"
        description="Movimentação e receita real do estacionamento — dados do JumpPark, sem números inventados."
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
        <ParkingView orders={parkingOrders} summary={summary} period={period} reference={reference} entriesInPeriod={entriesInPeriod} />
      )}
    </div>
  );
}
