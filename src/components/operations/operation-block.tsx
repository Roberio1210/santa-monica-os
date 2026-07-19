import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { formatCurrency } from "@/lib/utils/format";
import type { CentralOverview } from "@/lib/operations/central";

function computeTopServices(overview: CentralOverview, limit = 3): { description: string; amount: number; count: number }[] {
  const orders = overview.jumppark.data?.orders ?? [];
  const map = new Map<string, { amount: number; count: number }>();
  for (const order of orders) {
    for (const service of order.services) {
      const current = map.get(service.description) ?? { amount: 0, count: 0 };
      current.amount += service.amount;
      current.count += 1;
      map.set(service.description, current);
    }
  }
  return Array.from(map.entries())
    .map(([description, v]) => ({ description, ...v }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function OperationBlock({ overview }: { overview: CentralOverview }) {
  const orders = overview.jumppark.data?.orders ?? [];
  const parkingRevenue = orders.reduce((sum, o) => sum + o.parkingAmount, 0);
  const servicesRevenue = orders.reduce((sum, o) => sum + o.servicesAmount, 0);
  const additionalsCount = orders.reduce((sum, o) => sum + o.services.length, 0);
  const averageTicket = overview.jumppark.data && orders.length > 0 ? overview.jumppark.data.dailyRevenue / orders.length : null;
  const topServices = computeTopServices(overview);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operação</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {!overview.jumppark.data ? (
          <Unavailable label={overview.jumppark.error ?? "Informação indisponível"} />
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Row label="Ordens" value={String(orders.length)} href="/movimentacoes?period=today" />
            <Row label="Veículos" value={String(overview.jumppark.data.vehicles)} href="/movimentacoes?period=today" />
            <Row label="Faturamento Estética" value={formatCurrency(servicesRevenue)} href="/lavacao?period=today" />
            <Row label="Faturamento Estacionamento" value={formatCurrency(parkingRevenue)} href="/estacionamento?period=today" />
            <Row label="Ticket médio" value={averageTicket !== null ? formatCurrency(averageTicket) : "—"} />
            <Row label="Adicionais vendidos" value={String(additionalsCount)} />
            <Row label="Clientes novos" value="Informação indisponível" muted />
            <Row label="Clientes recorrentes" value="Informação indisponível" muted />
            <div className="col-span-2 sm:col-span-3">
              <p className="mb-1 text-xs text-foreground-subtle">Serviços mais vendidos hoje</p>
              {topServices.length === 0 ? (
                <Unavailable label="Nenhum serviço registrado hoje." />
              ) : (
                <ul className="space-y-1">
                  {topServices.map((s) => (
                    <li key={s.description} className="flex items-center justify-between text-xs">
                      <span className="text-foreground-muted">
                        {s.description} ({s.count})
                      </span>
                      <span className="text-foreground">{formatCurrency(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-foreground-subtle">
          Clientes novos/recorrentes exigem um histórico de clientes que o sistema ainda não mantém — nenhum número foi inventado.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, muted, href }: { label: string; value: string; muted?: boolean; href?: string }) {
  const content = (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className={muted ? "text-xs italic text-foreground-subtle" : "font-medium text-foreground"}>{value}</p>
    </div>
  );
  if (!href) return content;
  return (
    <Link href={href} className="block rounded-lg transition-colors hover:text-accent">
      {content}
    </Link>
  );
}
