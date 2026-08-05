import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchCustomers, parseCustomersQueryFilters, type CustomerSortBy } from "@/lib/integrations/jumppark/customersQuery";
import { CUSTOMER_STATUS_LABEL } from "@/lib/crm-intelligente/types";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const statusVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  novo: "outline",
  ativo: "outline",
  vip: "positive",
  em_risco: "warning",
  perdido: "critical",
};

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

export default async function ClientesJumpParkPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawParams = await searchParams;
  const normalized: Record<string, string | undefined> = {
    cliente: firstValue(rawParams.cliente),
    sort: firstValue(rawParams.sort),
    dir: firstValue(rawParams.dir),
    page: firstValue(rawParams.page),
  };

  const filters = parseCustomersQueryFilters(normalized);
  const result = await fetchCustomers(filters);

  const baseParams = { cliente: filters.nameQuery };

  function sortLink(sortBy: CustomerSortBy): string {
    const nextDir = filters.sortBy === sortBy && filters.sortDir === "desc" ? "asc" : "desc";
    return `/ordens/clientes${buildQuery({ ...baseParams, sort: sortBy, dir: nextDir, page: 1 })}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes (derivado da JumpPark)"
        description="Camada permanente de Clientes e Veículos calculada automaticamente a partir das ordens já sincronizadas em Central de Ordens — nada aqui é digitado manualmente."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/ordens">Central de Ordens</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="cliente">
                Cliente
              </label>
              <input id="cliente" name="cliente" type="text" placeholder="Nome do cliente" defaultValue={filters.nameQuery ?? ""} className={fieldClasses} />
            </div>
            <Button type="submit">Filtrar</Button>
            <Button asChild variant="outline">
              <Link href="/ordens/clientes">Limpar</Link>
            </Button>
          </form>
          <p className="mt-3 text-xs text-foreground-subtle">
            Busca só por nome — a identidade do cliente aqui é sempre resolvida por nome (o telefone chega mascarado da JumpPark e nunca vira chave de busca confiável).
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
            Nenhum cliente encontrado{filters.nameQuery ? " com esse filtro." : " — rode uma sincronização em Central de Ordens para calcular esta camada."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-3 text-sm text-foreground-muted">
              {result.total} cliente(s) encontrado(s) — página {result.page} de {result.pageCount}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
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
                    <th className="pb-2 font-medium">Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((c) => (
                    <tr key={c.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated">
                      <td className="py-2 pr-3">
                        <Link href={`/ordens/clientes/${c.id}`} className="block font-medium text-foreground hover:text-accent">
                          {c.name ?? "Não informado pela fonte"}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={statusVariant[c.status] ?? "outline"}>{CUSTOMER_STATUS_LABEL[c.status]}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{c.visitCount}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{c.lastVisit ? formatDateBR(c.lastVisit) : "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{c.daysSinceLastVisit ?? "—"}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(c.totalSpent)}</td>
                      <td className="py-2 text-foreground-muted">{formatCurrency(c.averageTicket)}</td>
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
                  <Link href={`/ordens/clientes${buildQuery({ ...baseParams, sort: filters.sortBy, dir: filters.sortDir, page: filters.page - 1 })}`}>Anterior</Link>
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
                  <Link href={`/ordens/clientes${buildQuery({ ...baseParams, sort: filters.sortBy, dir: filters.sortDir, page: filters.page + 1 })}`}>Próxima</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
