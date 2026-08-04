import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { formatCurrency } from "@/lib/utils/format";
import type { CentralOverview } from "@/lib/operations/central";
import { listCustomerOverviews } from "@/lib/crm-intelligente/overview";

export async function ClientsBlock({ overview }: { overview: CentralOverview }) {
  const orders = overview.jumppark.data?.orders ?? [];
  const servedToday = Array.from(new Set(orders.map((o) => o.clientName).filter((name): name is string => Boolean(name))));

  const overdueByClient = new Map<string, number>();
  for (const item of overview.accountsReceivable.data?.items ?? []) {
    if (item.computedStatus !== "overdue") continue;
    overdueByClient.set(item.partyName, Math.round(((overdueByClient.get(item.partyName) ?? 0) + item.outstandingAmount) * 100) / 100);
  }
  const overdueClients = Array.from(overdueByClient.entries()).sort((a, b) => b[1] - a[1]);

  // Missão 25: "sem retorno 30+ dias" agora é real (CRM Inteligente/Atendimento) — as demais
  // (novos hoje/recorrentes hoje/principais do mês) continuam Unavailable: exigem visitas
  // filtradas por dia, que só a Missão 25 seção 1 (Histórico Operacional) vai trazer.
  const customers = await listCustomerOverviews();
  const noReturn30 = customers.filter((c) => c.profile.daysSinceLastVisit !== null && c.profile.daysSinceLastVisit >= 30).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clientes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div>
          <p className="text-xs text-foreground-subtle">Clientes atendidos hoje</p>
          {overview.jumppark.data ? (
            <p className="text-lg font-semibold text-foreground">{servedToday.length}</p>
          ) : (
            <Unavailable />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-foreground-subtle">Clientes novos hoje</p>
            <Unavailable label="Informação indisponível" />
          </div>
          <div>
            <p className="text-xs text-foreground-subtle">Clientes recorrentes hoje</p>
            <Unavailable label="Informação indisponível" />
          </div>
          <div>
            <p className="text-xs text-foreground-subtle">Sem retorno há 30+ dias</p>
            {customers.length === 0 ? (
              <Unavailable label="Sem histórico de visitas" />
            ) : (
              <Link href="/crm/sem-retorno" className="text-lg font-semibold text-foreground hover:text-accent">
                {noReturn30}
              </Link>
            )}
          </div>
          <div>
            <p className="text-xs text-foreground-subtle">Principais clientes do mês</p>
            <Unavailable label="Informação indisponível" />
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-foreground-subtle">Clientes com contas vencidas</p>
          {!overview.accountsReceivable.data ? (
            <Unavailable label={overview.accountsReceivable.error ?? "Informação indisponível"} />
          ) : overdueClients.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhum cliente com conta vencida.</p>
          ) : (
            <ul className="space-y-1">
              {overdueClients.slice(0, 5).map(([name, amount]) => (
                <li key={name}>
                  <Link href="/financeiro/contas-a-receber" className="flex items-center justify-between text-sm hover:text-accent">
                    <span className="text-foreground-muted">{name}</span>
                    <span className="font-medium text-critical">{formatCurrency(amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
