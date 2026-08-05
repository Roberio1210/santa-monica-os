import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchOrders, listDistinctStatuses, parseOrdersQueryFilters, type OrderSortBy } from "@/lib/integrations/jumppark/ordersQuery";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

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

export default async function OrdensPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawParams = await searchParams;
  const normalized: Record<string, string | undefined> = {
    from: firstValue(rawParams.from),
    to: firstValue(rawParams.to),
    cliente: firstValue(rawParams.cliente),
    placa: firstValue(rawParams.placa),
    veiculo: firstValue(rawParams.veiculo),
    status: firstValue(rawParams.status),
    sort: firstValue(rawParams.sort),
    dir: firstValue(rawParams.dir),
    page: firstValue(rawParams.page),
  };

  const filters = parseOrdersQueryFilters(normalized);
  const [result, statuses] = await Promise.all([fetchOrders(filters), listDistinctStatuses()]);

  const baseParams = { from: filters.dateFrom, to: filters.dateTo, cliente: filters.clientQuery, placa: filters.plateQuery, veiculo: filters.vehicleQuery, status: filters.status };

  function sortLink(sortBy: OrderSortBy): string {
    const nextDir = filters.sortBy === sortBy && filters.sortDir === "desc" ? "asc" : "desc";
    return `/ordens${buildQuery({ ...baseParams, sort: sortBy, dir: nextDir, page: 1 })}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Ordens"
        description={`Ordens de serviço da JumpPark já sincronizadas no Neon — esta tela nunca consulta a JumpPark ao vivo.${result.lastSyncAt ? ` Última sincronização bem-sucedida: ${new Date(result.lastSyncAt).toLocaleString("pt-BR")}.` : " Nenhuma sincronização bem-sucedida registrada ainda."}`}
      />

      <Card>
        <CardContent className="pt-4">
          <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="from">
                Data inicial
              </label>
              <input id="from" name="from" type="date" defaultValue={filters.dateFrom ?? ""} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="to">
                Data final
              </label>
              <input id="to" name="to" type="date" defaultValue={filters.dateTo ?? ""} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="cliente">
                Cliente
              </label>
              <input id="cliente" name="cliente" type="text" placeholder="Nome do cliente" defaultValue={filters.clientQuery ?? ""} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="placa">
                Placa (mascarada)
              </label>
              <input id="placa" name="placa" type="text" placeholder="Ex.: AB***12" defaultValue={filters.plateQuery ?? ""} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="veiculo">
                Veículo
              </label>
              <input id="veiculo" name="veiculo" type="text" placeholder="Modelo" defaultValue={filters.vehicleQuery ?? ""} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="status">
                Status
              </label>
              <select id="status" name="status" defaultValue={filters.status ?? ""} className={fieldClasses}>
                <option value="">Todos</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">Filtrar</Button>
              <Button asChild variant="outline">
                <Link href="/ordens">Limpar</Link>
              </Button>
            </div>
          </form>
          <p className="mt-3 text-xs text-foreground-subtle">
            Busca por serviço não está disponível: a sincronização (Fase 1, primeira entrega) grava só os valores agregados de estacionamento/serviços por ordem, não uma lista de
            serviços por linha — ver limitação no relatório da missão.
          </p>
        </CardContent>
      </Card>

      {!result.databaseConfigured ? (
        <Card>
          <CardContent className="pt-6 text-sm text-critical">Banco de dados (Neon) não configurado neste ambiente.</CardContent>
        </Card>
      ) : result.total === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-foreground-muted">
            Nenhuma ordem encontrada{filters.dateFrom || filters.dateTo || filters.clientQuery || filters.plateQuery || filters.vehicleQuery || filters.status ? " com esses filtros." : " — nenhuma sincronização trouxe dados ainda."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-3 text-sm text-foreground-muted">
              {result.total} ordem(ns) encontrada(s) — página {result.page} de {result.pageCount}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("date")} className="hover:text-accent">
                        Data {filters.sortBy === "date" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 pr-3 font-medium">Horário</th>
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Veículo</th>
                    <th className="pb-2 pr-3 font-medium">Placa</th>
                    <th className="pb-2 pr-3 font-medium">Estacionamento / Serviços</th>
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("amount")} className="hover:text-accent">
                        Valor {filters.sortBy === "amount" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">Sincronizado em</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((order) => (
                    <tr key={order.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated">
                      <td className="py-2 pr-3">
                        <Link href={`/ordens/${order.id}${buildQuery({ ...baseParams, sort: filters.sortBy, dir: filters.sortDir, page: filters.page })}`} className="block text-foreground hover:text-accent">
                          {formatDateBR(order.orderDate)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {order.entryTime ?? "—"} → {order.exitTime ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.clientName ?? "Não informado pela fonte"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.vehicleModel ?? "Não informado pela fonte"}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{order.plateMasked ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {formatCurrency(Number(order.parkingAmount))} / {formatCurrency(Number(order.servicesAmount))}
                      </td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(Number(order.totalAmount))}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{order.situation ?? "Não informado pela fonte"}</Badge>
                      </td>
                      <td className="py-2 text-xs text-foreground-subtle">{new Date(order.updatedAt).toLocaleString("pt-BR")}</td>
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
                  <Link href={`/ordens${buildQuery({ ...baseParams, sort: filters.sortBy, dir: filters.sortDir, page: filters.page - 1 })}`}>Anterior</Link>
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
                  <Link href={`/ordens${buildQuery({ ...baseParams, sort: filters.sortBy, dir: filters.sortDir, page: filters.page + 1 })}`}>Próxima</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
