"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { ManagementOrderRow } from "@/lib/painel-gerencial/types";
import type { PeriodRange } from "@/lib/utils/timezone";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

type SortKey = "date" | "netAmount";

export function OrdersTable({ orders, period }: { orders: ManagementOrderRow[]; period: PeriodRange }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = query
      ? orders.filter((order) => {
          const haystack = [
            order.customerName ?? "",
            order.customerPhone ?? "",
            order.licensePlate ?? "",
            order.vehicleModel,
            order.serviceLines.map((s) => s.description).join(" "),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : orders;

    const sorted = [...rows].sort((a, b) => {
      const diff = sortKey === "date" ? `${a.date}${a.exitTime ?? ""}`.localeCompare(`${b.date}${b.exitTime ?? ""}`) : a.netAmount - b.netAmount;
      return sortDirection === "asc" ? diff : -diff;
    });
    return sorted;
  }, [orders, search, sortKey, sortDirection]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Vendas e atendimentos — {filtered.length} de {orders.length} ({period.label})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, telefone, placa, veículo ou serviço"
          className={cn(fieldClasses, "w-full max-w-md")}
          aria-label="Buscar atendimento"
        />

        {orders.length === 0 ? (
          <EmptyState title="Nenhum atendimento encontrado." description={`Nenhuma ordem finalizada no período selecionado (${period.label.toLowerCase()}).`} />
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhum resultado para a busca." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("date")}>
                    Data {sortKey === "date" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="pb-2 pr-3 font-medium">Horário</th>
                  <th className="pb-2 pr-3 font-medium">Cliente</th>
                  <th className="pb-2 pr-3 font-medium">Telefone</th>
                  <th className="pb-2 pr-3 font-medium">Veículo</th>
                  <th className="pb-2 pr-3 font-medium">Placa</th>
                  <th className="pb-2 pr-3 font-medium">Serviços</th>
                  <th className="pb-2 pr-3 font-medium">Categoria</th>
                  <th className="pb-2 pr-3 font-medium">Funcionário</th>
                  <th className="pb-2 pr-3 font-medium">Pagamento</th>
                  <th className="pb-2 pr-3 font-medium">Bruto</th>
                  <th className="pb-2 pr-3 font-medium">Desconto</th>
                  <th className="cursor-pointer pb-2 pr-3 font-medium" onClick={() => toggleSort("netAmount")}>
                    Líquido {sortKey === "netAmount" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="pb-2 pr-3 font-medium">Situação</th>
                  <th className="pb-2 font-medium">Origem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.externalId} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                    <td className="py-2 pr-3 whitespace-nowrap text-foreground-muted">{formatDateBR(order.date)}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.entryTime ?? "—"}–{order.exitTime ?? "—"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.customerName ?? "Não informado"}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-foreground-muted">{order.customerPhone ?? "Não informado"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.vehicleModel}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-foreground-muted">{order.licensePlate ?? "Não informado"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.serviceLines.map((s) => s.description).join(", ") || "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{order.serviceCategory}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.employeeName ?? "Não informado"}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.paymentMethodLabel}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(order.grossAmount)}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{formatCurrency(order.discountAmount)}</td>
                    <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(order.netAmount)}</td>
                    <td className="py-2 pr-3 text-foreground-muted">{order.situation}</td>
                    <td className="py-2 text-foreground-subtle">{order.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
