"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { orderConsumptionStatusLabels, type OrderConsumptionStatus } from "@/lib/orders/status";
import type { EligibleOrder } from "@/lib/orders/types";

const statusVariant: Record<OrderConsumptionStatus, "outline" | "warning" | "positive" | "critical"> = {
  bloqueado: "critical",
  previa_disponivel: "warning",
  aguardando_confirmacao: "warning",
  confirmado: "positive",
  parcialmente_confirmado: "warning",
  estornado: "outline",
};

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

export interface OrderRow {
  order: EligibleOrder;
  status: OrderConsumptionStatus;
}

export function OrdersView({ rows, startDate, endDate }: { rows: OrderRow[]; startDate: string; endDate: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(startDate);
  const [to, setTo] = useState(endDate);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderConsumptionStatus>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(({ order, status }) => {
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (query) {
        const haystack = `${order.clientName ?? ""} ${order.vehicleModel} ${order.plateMasked} ${order.externalId}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClasses} aria-label="Data inicial" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClasses} aria-label="Data final" />
          <button type="button" onClick={() => router.push(`/estoque/ordens?from=${from}&to=${to}`)} className={cn(fieldClasses, "cursor-pointer")}>
            Aplicar período
          </button>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | OrderConsumptionStatus)} className={fieldClasses} aria-label="Filtrar por status">
            <option value="all">Todos os status</option>
            {(Object.keys(orderConsumptionStatusLabels) as OrderConsumptionStatus[]).map((s) => (
              <option key={s} value={s}>
                {orderConsumptionStatusLabels[s]}
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
            Ordens — {filtered.length} de {rows.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhuma ordem encontrada." description="Não há ordens finalizadas para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Ordem</th>
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Veículo</th>
                    <th className="pb-2 pr-3 font-medium">Placa</th>
                    <th className="pb-2 pr-3 font-medium">Serviços</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(({ order, status }) => (
                    <tr key={order.externalId} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                      <td className="py-2 pr-3">
                        <Link href={`/estoque/ordens/${order.externalId}`} className="font-medium text-foreground hover:text-accent hover:underline">
                          {order.externalId}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {formatDateBR(order.date)} {order.time ?? ""}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.clientName ?? "Não informado"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.vehicleModel}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{order.plateMasked}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.services.map((s) => s.description).join(", ")}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(order.totalAmount)}</td>
                      <td className="py-2">
                        <Badge variant={statusVariant[status]}>{orderConsumptionStatusLabels[status]}</Badge>
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
