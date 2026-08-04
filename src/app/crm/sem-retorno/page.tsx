import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageComposer } from "@/components/crm/message-composer";
import { listCustomerOverviews } from "@/lib/crm-intelligente/overview";
import { generateCustomerMessage, type MessageType } from "@/lib/crm-intelligente/messages";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const PRESETS = [30, 45, 60, 90] as const;
const MESSAGE_TYPES: MessageType[] = ["retorno", "recuperacao"];

export default async function ClientesSemRetornoPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias } = await searchParams;
  const minDays = dias ? Math.max(1, Number.parseInt(dias, 10) || 30) : 30;

  const customers = await listCustomerOverviews();
  const withoutReturn = customers
    .filter((c) => c.profile.daysSinceLastVisit !== null && c.profile.daysSinceLastVisit >= minDays)
    .sort((a, b) => (b.profile.daysSinceLastVisit ?? 0) - (a.profile.daysSinceLastVisit ?? 0));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes sem retorno"
        description="Clientes com visita registrada, mas sem retorno recente — dado real do Atendimento (AttendanceRepository), mesma fonte do CRM."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/crm">Voltar ao CRM</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtro por período sem retorno</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button key={preset} asChild variant={preset === minDays ? "default" : "outline"} size="sm">
                <Link href={`/crm/sem-retorno?dias=${preset}`}>Mais de {preset} dias</Link>
              </Button>
            ))}
            <form className="flex items-center gap-2" action="/crm/sem-retorno">
              <input
                type="number"
                name="dias"
                min={1}
                defaultValue={PRESETS.includes(minDays as (typeof PRESETS)[number]) ? undefined : minDays}
                placeholder="Personalizado (dias)"
                className="h-9 w-40 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
              <Button type="submit" variant="outline" size="sm">
                Aplicar
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-foreground-muted">
        {withoutReturn.length} cliente(s) sem retorno há mais de {minDays} dias, de {customers.length} cliente(s) com visita conhecida.
      </p>

      {withoutReturn.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-foreground-muted">
            {customers.length === 0
              ? "Nenhum cliente com visita registrada via Atendimento ainda — esta lista fica vazia até haver uso real do módulo Atendimento."
              : `Nenhum cliente sem retorno há mais de ${minDays} dias.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {withoutReturn.map((c) => {
            const messages = Object.fromEntries(
              MESSAGE_TYPES.map((type) => [type, generateCustomerMessage(type, { customer: c.customer, profile: c.profile, vehicle: c.primaryVehicle, lastServiceNames: c.lastServiceNames })]),
            ) as Record<MessageType, ReturnType<typeof generateCustomerMessage>>;

            return (
              <Card key={c.customer.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link href={`/crm/${c.customer.id}`} className="hover:text-accent">
                      {c.customer.name ?? "Cliente sem nome"}
                    </Link>
                    <Badge variant={c.status === "perdido" ? "critical" : "warning"}>{c.profile.daysSinceLastVisit} dia(s) sem retorno</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-foreground-subtle">Telefone</p>
                      <p className="text-foreground-muted">{c.customer.phone ?? "Não informado"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Veículo</p>
                      <p className="text-foreground-muted">{c.primaryVehicle ? `${c.primaryVehicle.brand ?? ""} ${c.primaryVehicle.model ?? ""}`.trim() || "Não informado" : "Não informado"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Placa</p>
                      <p className="text-foreground-muted">{c.primaryVehicle?.plate ?? "Não informada"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Última visita</p>
                      <p className="text-foreground-muted">{c.profile.lastVisitAt ? formatDateBR(c.profile.lastVisitAt.slice(0, 10)) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Serviço realizado (última visita)</p>
                      <p className="text-foreground-muted">{c.lastServiceNames.length > 0 ? c.lastServiceNames.join(", ") : "Não registrado"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Frequência histórica</p>
                      <p className="text-foreground-muted">{c.profile.visitCount} visita(s) conhecida(s)</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Ticket médio</p>
                      <p className="text-foreground-muted">{c.profile.averageTicket !== null ? formatCurrency(c.profile.averageTicket) : "Sem ordens com valor"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Recomendações pendentes</p>
                      <p className="text-foreground-muted">{c.pendingRecommendationsCount}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-subtle">Observações</p>
                    <p className="text-sm text-foreground-muted">{c.customer.notes ?? "Nenhuma observação registrada."}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground-subtle">Última mensagem registrada</p>
                    <p className="text-sm text-foreground-muted">Nenhuma mensagem registrada ainda — o sistema não persiste histórico de envio nesta fase.</p>
                  </div>

                  <MessageComposer messages={messages} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
