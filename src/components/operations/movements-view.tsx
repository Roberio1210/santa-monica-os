"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Car, ClipboardCheck, DollarSign, Droplets, ParkingSquare, Ticket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/cards/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { OperationalOrder, OperationalOrderKind, OperationalSummary } from "@/lib/integrations/jumppark/operations-summary";
import type { PeriodRange } from "@/lib/utils/timezone";
import type { PaymentMethod } from "@/types/common";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const paymentLabels: Record<PaymentMethod, string> = { dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", pix: "Pix", outro: "Outro" };

type KindFilter = "all" | OperationalOrderKind;

export function MovementsView({ orders, summary, period }: { orders: OperationalOrder[]; summary: OperationalSummary; period: PeriodRange }) {
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentMethod>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (kindFilter !== "all" && order.kind !== kindFilter) return false;
      if (paymentFilter !== "all" && order.paymentMethodCategory !== paymentFilter) return false;
      if (query) {
        const haystack = `${order.clientName ?? ""} ${order.vehicleModel} ${order.plateMasked} ${order.externalId}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [orders, kindFilter, paymentFilter, search]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Veículos atendidos" value={String(summary.vehiclesServed)} icon={Car} onClick={() => setKindFilter("all")} active={kindFilter === "all"} />
        <StatCard label="Ordens finalizadas" value={String(summary.ordersCount)} icon={ClipboardCheck} />
        <StatCard label="Faturamento" value={formatCurrency(summary.revenue)} icon={DollarSign} />
        <StatCard label="Ticket médio" value={summary.averageTicket !== null ? formatCurrency(summary.averageTicket) : "—"} icon={Ticket} />
        <StatCard label="Lavações" value={String(summary.washCount)} icon={Droplets} onClick={() => setKindFilter("lavacao")} active={kindFilter === "lavacao"} />
        <StatCard label="Estacionamento" value={String(summary.parkingCount)} icon={ParkingSquare} onClick={() => setKindFilter("estacionamento")} active={kindFilter === "estacionamento"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros — {period.label}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as KindFilter)} className={fieldClasses} aria-label="Filtrar por tipo">
            <option value="all">Lavação + Estacionamento</option>
            <option value="lavacao">Só lavação</option>
            <option value="estacionamento">Só estacionamento</option>
          </select>
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
            placeholder="Buscar cliente, veículo, placa ou ordem"
            className={cn(fieldClasses, "min-w-[220px] flex-1")}
            aria-label="Buscar"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Movimentações — {filtered.length} de {orders.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {orders.length === 0 ? (
            <EmptyState title="Nenhum atendimento encontrado." description={`Nenhuma ordem finalizada no período selecionado (${period.label.toLowerCase()}).`} />
          ) : filtered.length === 0 ? (
            <EmptyState title="Nenhum resultado para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Entrada</th>
                    <th className="pb-2 pr-3 font-medium">Saída</th>
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Veículo</th>
                    <th className="pb-2 pr-3 font-medium">Placa</th>
                    <th className="pb-2 pr-3 font-medium">Tipo</th>
                    <th className="pb-2 pr-3 font-medium">Serviço</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 pr-3 font-medium">Pagamento</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr key={order.externalId} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                      <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">{formatDateBR(order.date)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.entryTime ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.exitTime ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.clientName ?? "Não informado"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.vehicleModel}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{order.plateMasked}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={order.kind === "lavacao" ? "info" : "outline"}>{order.kind === "lavacao" ? "Lavação" : "Estacionamento"}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.services.map((s) => s.description).join(", ") || "—"}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(order.totalAmount)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{paymentLabels[order.paymentMethodCategory]}</td>
                      <td className="py-2">
                        <Link href={`/movimentacoes/${order.externalId}?date=${order.date}`} className="text-accent hover:underline">
                          {order.situation}
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
