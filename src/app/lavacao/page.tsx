import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/operations/period-selector";
import { WashView } from "@/components/operations/wash-view";
import { fetchOperationalOrders, computeOperationalSummary, fetchReferencePeriodSummaries } from "@/lib/integrations/jumppark/operations-summary";
import { computeWashCategoryGroups } from "@/lib/integrations/jumppark/wash-grouping";
import { parsePeriodParams } from "@/lib/utils/timezone";
import { Wifi } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LavacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriodParams(params);

  const [result, reference] = await Promise.all([fetchOperationalOrders(period.from, period.to), fetchReferencePeriodSummaries()]);
  const washOrders = result.orders.filter((o) => o.kind === "lavacao");
  const summary = computeOperationalSummary(washOrders);
  const categoryGroups = result.jumpparkConfigured && !result.error ? await computeWashCategoryGroups(washOrders) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lavação"
        description="Produtividade e faturamento real da lavação — dados do JumpPark, sem números inventados."
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
        <WashView orders={washOrders} summary={summary} period={period} reference={reference} categoryGroups={categoryGroups} />
      )}
    </div>
  );
}
