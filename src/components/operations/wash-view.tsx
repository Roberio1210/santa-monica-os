"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Car, DollarSign, Droplets, Ticket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/cards/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Unavailable } from "@/components/shared/unavailable";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { OperationalOrder, OperationalSummary, ReferencePeriodSummaries } from "@/lib/integrations/jumppark/operations-summary";
import type { WashCategoryGroup } from "@/lib/integrations/jumppark/wash-grouping";
import type { PeriodRange } from "@/lib/utils/timezone";
import type { PaymentMethod } from "@/types/common";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const paymentLabels: Record<PaymentMethod, string> = { dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", pix: "Pix", outro: "Outro" };

export function WashView({
  orders,
  summary,
  period,
  reference,
  categoryGroups,
}: {
  orders: OperationalOrder[];
  summary: OperationalSummary;
  period: PeriodRange;
  reference: ReferencePeriodSummaries;
  categoryGroups: WashCategoryGroup[];
}) {
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentMethod>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (paymentFilter !== "all" && order.paymentMethodCategory !== paymentFilter) return false;
      if (query) {
        const haystack = `${order.clientName ?? ""} ${order.vehicleModel} ${order.plateMasked} ${order.services.map((s) => s.description).join(" ")}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [orders, paymentFilter, search]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Lavados hoje" value={String(reference.today.washCount)} icon={Car} />
        <StatCard label="Lavados ontem" value={String(reference.yesterday.washCount)} icon={Car} />
        <StatCard label="Lavados na semana" value={String(reference.week.washCount)} icon={Car} />
        <StatCard label="Lavados no mês" value={String(reference.month.washCount)} icon={Car} />
        <StatCard label="Faturamento hoje" value={formatCurrency(reference.today.washRevenue)} icon={DollarSign} />
        <StatCard label="Faturamento no mês" value={formatCurrency(reference.month.washRevenue)} icon={DollarSign} />
        <StatCard label="Ticket médio (período)" value={summary.averageTicket !== null ? formatCurrency(summary.averageTicket) : "—"} icon={Ticket} />
        <StatCard label="Serviços adicionais" value={String(orders.filter((o) => o.services.length > 1).length)} icon={Droplets} />
      </div>

      <Card>
        <CardContent className="pt-4">
          <Unavailable label="Serviços em andamento / aguardando entrega exigem um status em tempo real que o JumpPark não fornece neste endpoint — nenhum número foi inventado." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Por categoria — {period.label}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {categoryGroups.length === 0 ? (
            <EmptyState title="Nenhum serviço de lavação no período." />
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categoryGroups.map((g) => (
                <li key={g.label} className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-sm">
                  <span className="text-foreground-muted">
                    {g.label} ({g.count})
                  </span>
                  <span className="font-medium text-foreground">{formatCurrency(g.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as "all" | PaymentMethod)} className={fieldClasses} aria-label="Filtrar por forma de pagamento">
            <option value="all">Todas as formas de pagamento</option>
            {(Object.keys(paymentLabels) as PaymentMethod[]).map((method) => (
              <option key={method} value={method}>
                {paymentLabels[method]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, veículo, placa ou serviço"
            className={cn(fieldClasses, "min-w-[220px] flex-1")}
            aria-label="Buscar"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Ordens de lavação — {filtered.length} de {orders.length} ({period.label})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {orders.length === 0 ? (
            <EmptyState title="Nenhuma lavação encontrada." description={`Nenhuma ordem com serviço de lavação no período selecionado (${period.label.toLowerCase()}).`} />
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhum resultado para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Horário</th>
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Veículo</th>
                    <th className="pb-2 pr-3 font-medium">Placa</th>
                    <th className="pb-2 pr-3 font-medium">Serviços</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 pr-3 font-medium">Pagamento</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr key={order.externalId} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                      <td className="py-2 pr-3 whitespace-nowrap text-foreground">
                        {formatDateBR(order.date)} {order.exitTime ?? ""}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.clientName ?? "Não informado"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.vehicleModel}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{order.plateMasked}</td>
                      <td className="py-2 pr-3 text-foreground-subtle">{order.services.map((s) => s.description).join(", ")}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(order.totalAmount)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{paymentLabels[order.paymentMethodCategory]}</td>
                      <td className="py-2">
                        <Link href={`/movimentacoes/${order.externalId}?date=${order.date}`} className="text-accent hover:underline">
                          <Badge variant="outline">{order.situation}</Badge>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
