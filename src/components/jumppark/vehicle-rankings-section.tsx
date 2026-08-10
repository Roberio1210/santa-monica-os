import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalculationNote } from "@/components/shared/calculation-note";
import { DrillDownDialog } from "@/components/shared/drill-down-dialog";
import { VehicleOrderRowsDrilldown } from "@/components/jumppark/vehicle-order-rows-drilldown";
import { formatCurrency } from "@/lib/utils/format";
import type { VehicleOrderRow, VehicleRankingEntry, VehicleRankings } from "@/lib/integrations/jumppark/vehiclesQuery";

function RankingList({ entries, formatValue }: { entries: VehicleRankingEntry[]; formatValue: (v: number) => string }) {
  if (entries.length === 0) return <p className="text-sm text-foreground-subtle">Nenhum veículo neste ranking.</p>;
  return (
    <ol className="space-y-1.5">
      {entries.map((e, i) => (
        <li key={e.vehicleId} className="flex items-center justify-between text-sm">
          <Link href={`/ordens/veiculos/${e.vehicleId}`} className="text-foreground-muted hover:text-accent">
            {i + 1}. {e.model ?? "Não informado"} {e.plateMasked ? `(${e.plateMasked})` : ""} {e.customerName ? `— ${e.customerName}` : ""}
          </Link>
          <span className="font-medium text-foreground">{formatValue(e.value)}</span>
        </li>
      ))}
    </ol>
  );
}

export function VehicleRankingsSection({ rankings, periodCaption, topSpendOrders }: { rankings: VehicleRankings; periodCaption: string; topSpendOrders: VehicleOrderRow[] }) {
  const topSpendTotal = rankings.topBySpendInPeriod.reduce((sum, e) => sum + e.value, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Maiores gastadores no período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <RankingList entries={rankings.topBySpendInPeriod} formatValue={formatCurrency} />
          {rankings.topBySpendInPeriod.length > 0 ? (
            <DrillDownDialog trigger={`Total do Top ${rankings.topBySpendInPeriod.length}: ${formatCurrency(topSpendTotal)}`} title="Ordens do Top gastadores" description={periodCaption}>
              <VehicleOrderRowsDrilldown orders={topSpendOrders} />
            </DrillDownDialog>
          ) : null}
          <CalculationNote
            source="Ordens da JumpPark (jumppark_service_orders), filtradas por data de competência"
            formula="Soma de totalAmount por veículo, entre as ordens do período"
            period={periodCaption}
            recordsUsed={`${rankings.vehicleCountInPeriod} veículo(s) com ordem no período`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mais visitas no período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <RankingList entries={rankings.topByVisitsInPeriod} formatValue={(v) => `${v}x`} />
          <CalculationNote
            source="Ordens da JumpPark, filtradas por data de competência"
            formula="Contagem de ordens por veículo, no período"
            period={periodCaption}
            recordsUsed={`${rankings.vehicleCountInPeriod} veículo(s) com ordem no período`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maior ticket médio no período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <RankingList entries={rankings.topByAverageTicketInPeriod} formatValue={formatCurrency} />
          <CalculationNote
            source="Ordens da JumpPark, filtradas por data de competência"
            formula="Gasto do veículo no período dividido pela quantidade de visitas no período"
            period={periodCaption}
            recordsUsed={`${rankings.vehicleCountInPeriod} veículo(s) com ordem no período`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mais serviços por visita no período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <RankingList entries={rankings.topByServiceCountInPeriod} formatValue={(v) => `${v} item(ns)`} />
          <CalculationNote
            source="jumppark_service_order_items, ligados às ordens do período"
            formula="Soma da quantidade de itens de serviço nas ordens do veículo dentro do período"
            period={periodCaption}
            recordsUsed={`${rankings.vehicleCountInPeriod} veículo(s) com ordem no período`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maior frequência (menor intervalo médio)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <RankingList entries={rankings.topByFrequencyLifetime} formatValue={(v) => `${v} dia(s)`} />
          <CalculationNote
            source="Todo o histórico de ordens do veículo (jumppark_service_orders) — não restrito ao período selecionado"
            formula="Média dos intervalos, em dias, entre visitas consecutivas em datas distintas"
            period="Histórico completo do veículo"
            recordsUsed="Veículos com 2+ visitas em datas distintas"
            limitations="Vitalício por natureza — um veículo com 1 visita numa janela curta não tem frequência para medir ali dentro."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sem retorno há mais tempo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <RankingList entries={rankings.topByDaysSinceReturnLifetime} formatValue={(v) => `${v} dia(s)`} />
          <CalculationNote
            source="vehicles.last_seen_at (última visita conhecida)"
            formula="Hoje menos a data da última visita conhecida do veículo"
            period="Histórico completo do veículo"
            recordsUsed="Todos os veículos com pelo menos uma visita"
          />
        </CardContent>
      </Card>
    </div>
  );
}
