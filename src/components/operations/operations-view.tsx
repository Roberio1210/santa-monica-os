"use client";

import { useMemo, useState } from "react";
import { Car, DollarSign, Droplets, Receipt, Ticket, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/cards/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { OperationOrder } from "@/lib/integrations/jumppark";
import type { PaymentMethod } from "@/types/common";

const paymentLabels: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  outro: "Outro",
};

type Scope = "all" | "parking" | "services";

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface OperationsViewProps {
  orders: OperationOrder[];
  date: string;
}

export function OperationsView({ orders, date }: OperationsViewProps) {
  const [scope, setScope] = useState<Scope>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const serviceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const order of orders) {
      for (const service of order.services) set.add(service.description);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const paymentOptions = useMemo(() => {
    const set = new Set<PaymentMethod>();
    for (const order of orders) set.add(order.paymentMethodCategory);
    return Array.from(set);
  }, [orders]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (scope === "parking" && order.hasServices) return false;
      if (scope === "services" && !order.hasServices) return false;
      if (paymentFilter !== "all" && order.paymentMethodCategory !== paymentFilter) return false;
      if (serviceFilter !== "all" && !order.services.some((s) => s.description === serviceFilter)) return false;
      if (query) {
        const haystack = [order.plateMasked, order.vehicleModel, order.clientName ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [orders, scope, paymentFilter, serviceFilter, search]);

  const summary = useMemo(() => {
    const parkingRevenue = filtered.reduce((sum, o) => sum + o.parkingAmount, 0);
    const servicesRevenue = filtered.reduce((sum, o) => sum + o.servicesAmount, 0);
    const totalRevenue = filtered.reduce((sum, o) => sum + o.totalAmount, 0);
    const serviceCount = filtered.reduce((sum, o) => sum + o.services.length, 0);
    const averageTicket = filtered.length > 0 ? totalRevenue / filtered.length : 0;
    return { parkingRevenue, servicesRevenue, totalRevenue, serviceCount, averageTicket };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Ordens finalizadas" value={String(filtered.length)} icon={Car} hint={`de ${orders.length} no dia`} />
        <StatCard label="Receita estacionamento" value={formatCurrency(summary.parkingRevenue)} icon={Wallet} />
        <StatCard label="Receita serviços" value={formatCurrency(summary.servicesRevenue)} icon={Droplets} />
        <StatCard label="Receita total" value={formatCurrency(summary.totalRevenue)} icon={DollarSign} />
        <StatCard label="Ticket médio" value={formatCurrency(summary.averageTicket)} icon={Ticket} />
        <StatCard label="Lavações/serviços" value={String(summary.serviceCount)} icon={Receipt} hint="itens realizados" />
      </div>

      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle>Filtros</CardTitle>
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="date" className="text-xs text-foreground-subtle">
              Data
            </label>
            <input id="date" type="date" name="date" defaultValue={date} className={fieldClasses} max={todayIsoClient()} />
            <button type="submit" className="h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground hover:bg-background-panel">
              Aplicar
            </button>
          </form>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className={fieldClasses}
            aria-label="Filtrar por tipo de ordem"
          >
            <option value="all">Todas as ordens</option>
            <option value="parking">Somente estacionamento</option>
            <option value="services">Somente lavação/serviços</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className={fieldClasses}
            aria-label="Filtrar por forma de pagamento"
          >
            <option value="all">Todas as formas de pagamento</option>
            {paymentOptions.map((method) => (
              <option key={method} value={method}>
                {paymentLabels[method]}
              </option>
            ))}
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className={fieldClasses}
            aria-label="Filtrar por serviço"
            disabled={serviceOptions.length === 0}
          >
            <option value="all">Todos os serviços</option>
            {serviceOptions.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por placa, modelo ou cliente"
            className={cn(fieldClasses, "min-w-[220px] flex-1")}
            aria-label="Buscar por placa, modelo ou cliente"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ordens finalizadas — {date}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState
              title="Nenhuma ordem encontrada"
              description="Não há ordens finalizadas para os filtros selecionados nesta data."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Entrada</th>
                    <th className="pb-2 pr-3 font-medium">Saída</th>
                    <th className="pb-2 pr-3 font-medium">Placa</th>
                    <th className="pb-2 pr-3 font-medium">Modelo</th>
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Telefone</th>
                    <th className="pb-2 pr-3 font-medium">Serviços</th>
                    <th className="pb-2 pr-3 font-medium">Estacionamento</th>
                    <th className="pb-2 pr-3 font-medium">Serviços (R$)</th>
                    <th className="pb-2 pr-3 font-medium">Total</th>
                    <th className="pb-2 pr-3 font-medium">Pagamento</th>
                    <th className="pb-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr key={order.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 text-foreground">{order.entryTime ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground">{order.exitTime ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">{order.plateMasked}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.vehicleModel}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.clientName ?? "Não informado"}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-foreground-subtle">
                        {order.clientPhoneMasked ?? "Não informado"}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {order.hasServices ? order.services.map((s) => s.description).join(", ") : "Estacionamento"}
                      </td>
                      <td className="py-2 pr-3 text-foreground">
                        {order.parkingAmount > 0 ? formatCurrency(order.parkingAmount) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-foreground">
                        {order.servicesAmount > 0 ? formatCurrency(order.servicesAmount) : "—"}
                      </td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(order.totalAmount)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{order.paymentMethod}</td>
                      <td className="py-2">
                        <Badge variant={order.situation === "Pago" ? "positive" : "default"}>{order.situation}</Badge>
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

function todayIsoClient(): string {
  return new Date().toISOString().slice(0, 10);
}
