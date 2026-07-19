"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/cards/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Unavailable } from "@/components/shared/unavailable";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { DollarSign, LogIn, LogOut, Timer } from "lucide-react";
import type { OperationalOrder, OperationalSummary, ReferencePeriodSummaries } from "@/lib/integrations/jumppark/operations-summary";
import type { PeriodRange } from "@/lib/utils/timezone";
import type { PaymentMethod } from "@/types/common";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const paymentLabels: Record<PaymentMethod, string> = { dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", pix: "Pix", outro: "Outro" };

function durationMinutes(order: OperationalOrder): number | null {
  if (!order.entryDateTime || !order.exitDateTime) return null;
  const minutes = Math.round((new Date(order.exitDateTime.replace(" ", "T")).getTime() - new Date(order.entryDateTime.replace(" ", "T")).getTime()) / 60000);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

export function ParkingView({
  orders,
  summary,
  period,
  reference,
  entriesInPeriod,
}: {
  orders: OperationalOrder[];
  summary: OperationalSummary;
  period: PeriodRange;
  reference: ReferencePeriodSummaries;
  entriesInPeriod: number;
}) {
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentMethod>("all");
  const [search, setSearch] = useState("");

  const durations = orders.map(durationMinutes).filter((m): m is number => m !== null);
  const averageStay = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (paymentFilter !== "all" && order.paymentMethodCategory !== paymentFilter) return false;
      if (query) {
        const haystack = `${order.clientName ?? ""} ${order.vehicleModel} ${order.plateMasked}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [orders, paymentFilter, search]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Entradas no período" value={String(entriesInPeriod)} icon={LogIn} hint="Só ordens já finalizadas" />
        <StatCard label="Saídas no período" value={String(summary.ordersCount)} icon={LogOut} />
        <StatCard label="Permanência média" value={averageStay !== null ? `${averageStay} min` : "—"} icon={Timer} />
        <StatCard label="Receita hoje" value={formatCurrency(reference.today.parkingRevenue)} icon={DollarSign} />
        <StatCard label="Receita da semana" value={formatCurrency(reference.week.parkingRevenue)} icon={DollarSign} />
        <StatCard label="Receita do mês" value={formatCurrency(reference.month.parkingRevenue)} icon={DollarSign} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-4">
            <Unavailable label="Veículos atualmente no pátio: informação de permanência atual não fornecida por endpoint confiável do JumpPark (ver docs/jumppark-open-orders-investigation.md)." />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <Unavailable label="Mensalistas identificados: a API não expõe um campo confiável para diferenciar mensalistas ainda — nenhuma classificação foi inventada." />
          </CardContent>
        </Card>
      </div>

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
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, veículo ou placa" className={cn(fieldClasses, "min-w-[220px] flex-1")} aria-label="Buscar" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Movimentação — {filtered.length} de {orders.length} ({period.label})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {orders.length === 0 ? (
            <EmptyState title="Nenhuma movimentação de estacionamento encontrada." description={`Nenhuma ordem no período selecionado (${period.label.toLowerCase()}).`} />
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhum resultado para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Placa</th>
                    <th className="pb-2 pr-3 font-medium">Veículo</th>
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Entrada</th>
                    <th className="pb-2 pr-3 font-medium">Saída</th>
                    <th className="pb-2 pr-3 font-medium">Permanência</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 pr-3 font-medium">Pagamento</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => {
                    const minutes = durationMinutes(order);
                    return (
                      <tr key={order.externalId} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                        <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{order.plateMasked}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{order.vehicleModel}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{order.clientName ?? "Não informado"}</td>
                        <td className="py-2 pr-3 text-foreground">
                          {formatDateBR(order.date)} {order.entryTime ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-foreground">{order.exitTime ?? "—"}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{minutes !== null ? `${minutes} min` : "—"}</td>
                        <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(order.totalAmount)}</td>
                        <td className="py-2 pr-3 text-foreground-muted">{paymentLabels[order.paymentMethodCategory]}</td>
                        <td className="py-2">
                          <Link href={`/movimentacoes/${order.externalId}?date=${order.date}`} className="text-accent hover:underline">
                            <Badge variant="outline">{order.situation}</Badge>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
