import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PeriodSelector } from "@/components/operations/period-selector";
import { CalculationNote } from "@/components/shared/calculation-note";
import { VehicleRankingsSection } from "@/components/jumppark/vehicle-rankings-section";
import {
  fetchOrdersForVehiclesInPeriod,
  fetchVehicleRankings,
  fetchVehicleSegmentCounts,
  fetchVehicles,
  parseVehiclesQueryFilters,
  type VehicleSortBy,
} from "@/lib/integrations/jumppark/vehiclesQuery";
import { VEHICLE_SEGMENT_KEYS, VEHICLE_SEGMENT_LABELS, type VehicleSegmentKey } from "@/lib/integrations/jumppark/vehicleSegments";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export default async function VeiculosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawParams = await searchParams;
  const normalized: Record<string, string | undefined> = {
    modelo: firstValue(rawParams.modelo),
    placa: firstValue(rawParams.placa),
    cliente: firstValue(rawParams.cliente),
    servico: firstValue(rawParams.servico),
    minVisitas: firstValue(rawParams.minVisitas),
    gastoMin: firstValue(rawParams.gastoMin),
    gastoMax: firstValue(rawParams.gastoMax),
    sort: firstValue(rawParams.sort),
    dir: firstValue(rawParams.dir),
    page: firstValue(rawParams.page),
    segmento: firstValue(rawParams.segmento),
  };

  const period = parsePeriodParams({ period: firstValue(rawParams.period), from: firstValue(rawParams.from), to: firstValue(rawParams.to) });
  const filters = parseVehiclesQueryFilters(normalized);

  const [result, segmentCounts, rankings] = await Promise.all([fetchVehicles(filters), fetchVehicleSegmentCounts(), fetchVehicleRankings(period)]);
  const topSpendOrders = await fetchOrdersForVehiclesInPeriod(
    rankings.topBySpendInPeriod.map((e) => e.vehicleId),
    period,
  );

  const periodCaption = `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;

  const baseParams = {
    modelo: filters.modelQuery,
    placa: filters.plateQuery,
    cliente: filters.customerQuery,
    servico: filters.serviceQuery,
    minVisitas: filters.minVisits,
    gastoMin: filters.minSpent,
    gastoMax: filters.maxSpent,
    segmento: filters.segment,
  };

  function sortLink(sortBy: VehicleSortBy): string {
    const nextDir = filters.sortBy === sortBy && filters.sortDir === "desc" ? "asc" : "desc";
    return `/ordens/veiculos${buildQuery({ ...baseParams, sort: sortBy, dir: nextDir, page: 1 })}`;
  }

  function segmentLink(segment: VehicleSegmentKey): string {
    const next = filters.segment === segment ? null : segment;
    return `/ordens/veiculos${buildQuery({ ...baseParams, segmento: next, page: 1 })}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Veículos (derivado da JumpPark)"
        description="Camada permanente de Veículos calculada automaticamente a partir das ordens já sincronizadas — nada aqui é digitado manualmente."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/ordens">Central de Ordens</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector period={period} />
        <p className="text-xs text-foreground-subtle">
          Período usado pelos rankings abaixo — {rankings.vehicleCountInPeriod} veículo(s) com ordem em {periodCaption}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <p className="text-sm font-medium text-foreground-muted">Segmentos</p>
          <div className="flex flex-wrap gap-2">
            {VEHICLE_SEGMENT_KEYS.map((key) => (
              <Link key={key} href={segmentLink(key)}>
                <Badge variant={filters.segment === key ? "positive" : "outline"} className="cursor-pointer px-3 py-1.5 text-sm">
                  {VEHICLE_SEGMENT_LABELS[key]} — {segmentCounts[key]}
                </Badge>
              </Link>
            ))}
          </div>
          <CalculationNote
            source="Tabela vehicles (source='jumppark') + jumppark_service_orders + jumppark_service_order_items + identity_review_items"
            formula={[
              "Últimos N dias / Sem retorno N: última visita (last_seen_at) relativa a hoje.",
              "Recorrentes: 3+ visitas no histórico (mesmo limiar de Clientes).",
              "Apenas uma visita: visit_count = 1.",
              "Ligados a mais de um cliente: 2+ customer_id distintos nas ordens do veículo.",
              "Mais de um serviço por visita: pelo menos uma ordem com 2+ itens em jumppark_service_order_items.",
              "Identidade ambígua: placa com item ativo e pendente na fila de revisão de identidade (Missão 28).",
              "Costumava vir e parou: 3+ visitas e dias sem retorno acima de 2x o intervalo médio histórico do PRÓPRIO veículo — nunca um limiar global.",
            ].join(" ")}
            period="Sempre relativo a hoje — nenhum segmento de veículo depende do período selecionado acima"
            recordsUsed="Veículos com source='jumppark'"
            limitations="Marca, placa completa, ano e cor nunca são fornecidos pela JumpPark nesta integração — sempre nulos, nunca inventados."
          />
        </CardContent>
      </Card>

      <VehicleRankingsSection rankings={rankings} periodCaption={periodCaption} topSpendOrders={topSpendOrders} />

      <Card>
        <CardContent className="pt-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="modelo">
                Modelo
              </label>
              <input id="modelo" name="modelo" type="text" placeholder="Ex.: HB20" defaultValue={filters.modelQuery ?? ""} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="placa">
                Placa (mascarada)
              </label>
              <input id="placa" name="placa" type="text" placeholder="Ex.: AB***12" defaultValue={filters.plateQuery ?? ""} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="cliente">
                Cliente atual
              </label>
              <input id="cliente" name="cliente" type="text" placeholder="Nome do cliente" defaultValue={filters.customerQuery ?? ""} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="servico">
                Serviço realizado
              </label>
              <input id="servico" name="servico" type="text" placeholder="Ex.: Higienização" defaultValue={filters.serviceQuery ?? ""} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="minVisitas">
                Mín. visitas
              </label>
              <input id="minVisitas" name="minVisitas" type="number" min={0} defaultValue={filters.minVisits ?? ""} className={`${fieldClasses} w-24`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="gastoMin">
                Gasto mín. (R$)
              </label>
              <input id="gastoMin" name="gastoMin" type="number" min={0} step="0.01" defaultValue={filters.minSpent ?? ""} className={`${fieldClasses} w-28`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="gastoMax">
                Gasto máx. (R$)
              </label>
              <input id="gastoMax" name="gastoMax" type="number" min={0} step="0.01" defaultValue={filters.maxSpent ?? ""} className={`${fieldClasses} w-28`} />
            </div>
            <input type="hidden" name="segmento" value={filters.segment ?? ""} />
            <Button type="submit">Filtrar</Button>
            <Button asChild variant="outline">
              <Link href="/ordens/veiculos">Limpar tudo</Link>
            </Button>
          </form>
          <p className="mt-3 text-xs text-foreground-subtle">
            Marca não é fornecida pela JumpPark nesta integração (sempre &quot;Não informado&quot;) — o campo &quot;modelo&quot; já concentra marca e modelo como texto livre da fonte (ex.: &quot;JEEP
            COMPASS&quot;).
          </p>
        </CardContent>
      </Card>

      {!result.databaseConfigured ? (
        <Card>
          <CardContent className="pt-6 text-sm text-critical">Banco de dados (Neon) não configurado neste ambiente.</CardContent>
        </Card>
      ) : result.total === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-foreground-muted">Nenhum veículo encontrado com esse filtro.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-3 text-sm text-foreground-muted">
              {result.total} veículo(s) encontrado(s) — página {result.page} de {result.pageCount}
              {filters.segment ? (
                <>
                  {" "}
                  — segmento: <span className="font-medium text-foreground">{VEHICLE_SEGMENT_LABELS[filters.segment]}</span>
                </>
              ) : null}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("model")} className="hover:text-accent">
                        Veículo {filters.sortBy === "model" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 pr-3 font-medium">Placa</th>
                    <th className="pb-2 pr-3 font-medium">Cliente atual</th>
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("visitCount")} className="hover:text-accent">
                        Visitas {filters.sortBy === "visitCount" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("lastVisit")} className="hover:text-accent">
                        Última visita {filters.sortBy === "lastVisit" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 pr-3 font-medium">Dias sem retornar</th>
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("totalSpent")} className="hover:text-accent">
                        Total gasto {filters.sortBy === "totalSpent" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("averageTicket")} className="hover:text-accent">
                        Ticket médio {filters.sortBy === "averageTicket" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 font-medium">Identidade</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((v) => (
                    <tr key={v.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated">
                      <td className="py-2 pr-3">
                        <Link href={`/ordens/veiculos/${v.id}`} className="block font-medium text-foreground hover:text-accent">
                          {v.model ?? "Não informado pela fonte"}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{v.plateMasked ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {v.customerId ? <Link href={`/ordens/clientes/${v.customerId}`} className="hover:text-accent">{v.customerName ?? "Não informado"}</Link> : "Não informado"}
                        {v.customerCount > 1 ? (
                          <Badge variant="warning" className="ml-1">
                            +{v.customerCount - 1}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{v.visitCount}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{v.lastSeenAt ? formatDateBR(v.lastSeenAt) : "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{v.daysSinceLastVisit ?? "—"}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(v.totalSpent)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(v.averageTicket)}</td>
                      <td className="py-2">{v.hasAmbiguousIdentity ? <Badge variant="critical">Ambígua</Badge> : <Badge variant="outline">OK</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              {filters.page <= 1 ? (
                <Button variant="outline" disabled>
                  Anterior
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link href={`/ordens/veiculos${buildQuery({ ...baseParams, sort: filters.sortBy, dir: filters.sortDir, page: filters.page - 1 })}`}>Anterior</Link>
                </Button>
              )}
              <p className="text-xs text-foreground-subtle">
                Página {result.page} de {result.pageCount}
              </p>
              {filters.page >= result.pageCount ? (
                <Button variant="outline" disabled>
                  Próxima
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link href={`/ordens/veiculos${buildQuery({ ...baseParams, sort: filters.sortBy, dir: filters.sortDir, page: filters.page + 1 })}`}>Próxima</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
