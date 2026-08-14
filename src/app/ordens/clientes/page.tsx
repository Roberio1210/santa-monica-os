import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PeriodSelector } from "@/components/operations/period-selector";
import { CalculationNote } from "@/components/shared/calculation-note";
import { fetchCustomers, fetchCustomerSegmentCounts, parseCustomersQueryFilters, type CustomerSortBy } from "@/lib/integrations/jumppark/customersQuery";
import { CUSTOMER_SEGMENT_KEYS, CUSTOMER_SEGMENT_LABELS, type CustomerSegmentKey } from "@/lib/integrations/jumppark/customerSegments";
import { CUSTOMER_STATUS_LABEL } from "@/lib/crm-intelligente/types";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const statusVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  novo: "outline",
  ativo: "outline",
  vip: "positive",
  em_risco: "warning",
  perdido: "critical",
};

/** Missão 28 — nível de confiança do vínculo de identidade (ver `identityConfidenceEnum`). */
const identityConfidenceLabel: Record<string, string> = {
  confirmado: "Confirmado",
  provavel: "Provável",
  provisorio: "Provisório",
  ambiguo: "Ambíguo",
};
const identityConfidenceVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  confirmado: "positive",
  provavel: "outline",
  provisorio: "outline",
  ambiguo: "critical",
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
    segmento: firstValue(rawParams.segmento),
  };

  const period = parsePeriodParams({ period: firstValue(rawParams.period), from: firstValue(rawParams.from), to: firstValue(rawParams.to) });
  const filters = parseCustomersQueryFilters(normalized, { from: period.from, to: period.to });
  const [result, segmentCounts] = await Promise.all([fetchCustomers(filters), fetchCustomerSegmentCounts({ from: period.from, to: period.to })]);

  const baseParams = { cliente: filters.nameQuery, segmento: filters.segment, period: period.key, from: period.key === "custom" ? period.from : undefined, to: period.key === "custom" ? period.to : undefined };

  function sortLink(sortBy: CustomerSortBy): string {
    const nextDir = filters.sortBy === sortBy && filters.sortDir === "desc" ? "asc" : "desc";
    return `/ordens/clientes${buildQuery({ ...baseParams, sort: sortBy, dir: nextDir, page: 1 })}`;
  }

  function segmentLink(segment: CustomerSegmentKey): string {
    const next = filters.segment === segment ? null : segment;
    return `/ordens/clientes${buildQuery({ ...baseParams, segmento: next, page: 1 })}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes (derivado da JumpPark)"
        description="Camada permanente de Clientes e Veículos calculada automaticamente a partir das ordens já sincronizadas em Central de Ordens — nada aqui é digitado manualmente."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/ordens/clientes/revisao">Identidades para revisar</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/ordens">Central de Ordens</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector period={period} />
        <p className="text-xs text-foreground-subtle">Período usado pelos segmentos &quot;Novos&quot; e &quot;Reativados&quot; — os demais segmentos independem de período.</p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <p className="text-sm font-medium text-foreground-muted">Segmentos ({period.label})</p>
          <div className="flex flex-wrap gap-2">
            {CUSTOMER_SEGMENT_KEYS.map((key) => (
              <Link key={key} href={segmentLink(key)}>
                <Badge variant={filters.segment === key ? "positive" : "outline"} className="cursor-pointer px-3 py-1.5 text-sm">
                  {CUSTOMER_SEGMENT_LABELS[key]} — {segmentCounts[key]}
                </Badge>
              </Link>
            ))}
          </div>
          <CalculationNote
            source="Tabela customers (source='jumppark') + histórico de ordens (jumppark_service_orders)"
            formula={[
              "Novos: primeira visita (firstVisitAt) dentro do período selecionado.",
              "Recorrentes: 3+ visitas no histórico total (mesmo limiar de crm-intelligente).",
              "Reativados: teve visita dentro do período com mais de 45 dias de intervalo desde a visita anterior.",
              "VIP: 5+ visitas e última visita há no máximo 90 dias.",
              "Sem retorno X: última visita há X+ dias, a partir de hoje.",
              "Com mais de 1 veículo: contagem de veículos vinculados na tabela vehicles.",
            ].join(" ")}
            period={`${period.label} (${formatDateBR(period.from)} a ${formatDateBR(period.to)})`}
            recordsUsed={`${result.total !== undefined ? "clientes com source='jumppark'" : ""}`.trim() || "Clientes com source='jumppark'"}
            limitations="Sem telefone completo nem CPF, a identidade de cada cliente é a mesma usada em toda a JumpPark (ver Identidades para revisar) — os segmentos herdam essa mesma limitação."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-subtle" htmlFor="cliente">
                Cliente
              </label>
              <input id="cliente" name="cliente" type="text" placeholder="Nome do cliente" defaultValue={filters.nameQuery ?? ""} className={fieldClasses} />
            </div>
            <input type="hidden" name="segmento" value={filters.segment ?? ""} />
            <input type="hidden" name="period" value={period.key} />
            <Button type="submit">Filtrar</Button>
            <Button asChild variant="outline">
              <Link href="/ordens/clientes">Limpar tudo</Link>
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
            Nenhum cliente encontrado{filters.nameQuery || filters.segment ? " com esse filtro." : " — rode uma sincronização em Central de Ordens para calcular esta camada."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-3 text-sm text-foreground-muted">
              {result.total} cliente(s) encontrado(s) — página {result.page} de {result.pageCount}
              {filters.segment ? <> — segmento: <span className="font-medium text-foreground">{CUSTOMER_SEGMENT_LABELS[filters.segment]}</span></> : null}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Telefone</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Identidade</th>
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("visitCount")} className="hover:text-accent">
                        Visitas {filters.sortBy === "visitCount" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("vehicleCount")} className="hover:text-accent">
                        Veículos {filters.sortBy === "vehicleCount" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("lastVisit")} className="hover:text-accent">
                        Última visita {filters.sortBy === "lastVisit" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 pr-3 font-medium">
                      <Link href={sortLink("totalSpent")} className="hover:text-accent">
                        Total gasto {filters.sortBy === "totalSpent" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
                    <th className="pb-2 font-medium">
                      <Link href={sortLink("averageTicket")} className="hover:text-accent">
                        Ticket médio {filters.sortBy === "averageTicket" ? (filters.sortDir === "asc" ? "↑" : "↓") : ""}
                      </Link>
                    </th>
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
                      {/* Missão CRM V2 Final (Parte 9) — telefone/placa ajudam a diferenciar homônimos direto na lista, sem abrir cada detalhe. */}
                      <td className="py-2 pr-3 text-foreground-muted">{c.phone ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={statusVariant[c.status] ?? "outline"}>{CUSTOMER_STATUS_LABEL[c.status]}</Badge>
                      </td>
                      <td className="py-2 pr-3" title={c.identityConfidenceReason ?? undefined}>
                        <Badge variant={identityConfidenceVariant[c.identityConfidence] ?? "outline"}>{identityConfidenceLabel[c.identityConfidence] ?? c.identityConfidence}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{c.visitCount}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {c.vehicleCount}
                        {c.primaryVehiclePlate ? <span className="text-foreground-subtle"> ({c.primaryVehiclePlate})</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{c.lastVisit ? formatDateBR(c.lastVisit) : "—"}</td>
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
