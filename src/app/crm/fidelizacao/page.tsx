import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageComposer } from "@/components/crm/message-composer";
import { listCustomerOverviews } from "@/lib/crm-intelligente/overview";
import { buildLoyaltyCandidates, LOYALTY_SUGGESTION_LABEL } from "@/lib/crm-intelligente/loyalty";
import { generateCustomerMessage, type MessageType } from "@/lib/crm-intelligente/messages";
import { formatCurrency } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const MESSAGE_TYPES: MessageType[] = ["vip", "agradecimento", "pos_servico"];

export default async function FidelizacaoPage() {
  const customers = await listCustomerOverviews();
  const candidates = buildLoyaltyCandidates(customers);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fidelização — Clientes que merecem atenção"
        description="Clientes VIP ou recorrentes (mesma régua do perfil do CRM). Nenhuma cortesia é concedida automaticamente — só sugerida, com motivo e histórico."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/crm">Voltar ao CRM</Link>
          </Button>
        }
      />

      {candidates.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-foreground-muted">
            {customers.length === 0
              ? "Nenhum cliente com visita registrada via Atendimento ainda — esta lista fica vazia até haver uso real do módulo Atendimento."
              : "Nenhum cliente atinge hoje o critério de VIP (5+ visitas, ativo nos últimos 90 dias) ou recorrente (3+ visitas)."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {candidates.map(({ entry, reasonEligible, suggestions, untrackedCriteria }) => {
            const messages = Object.fromEntries(
              MESSAGE_TYPES.map((type) => [type, generateCustomerMessage(type, { customer: entry.customer, profile: entry.profile, vehicle: entry.primaryVehicle, lastServiceNames: entry.lastServiceNames })]),
            ) as Record<MessageType, ReturnType<typeof generateCustomerMessage>>;

            return (
              <Card key={entry.customer.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link href={`/crm/${entry.customer.id}`} className="hover:text-accent">
                      {entry.customer.name ?? "Cliente sem nome"}
                    </Link>
                    {entry.profile.isVip && <Badge variant="positive">VIP</Badge>}
                    {!entry.profile.isVip && entry.profile.isRecurring && <Badge variant="info">Recorrente</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-foreground-subtle">Motivo da elegibilidade</p>
                      <p className="text-foreground-muted">{reasonEligible}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Total gasto / ticket médio</p>
                      <p className="text-foreground-muted">
                        {formatCurrency(entry.profile.totalSpent)} / {entry.profile.averageTicket !== null ? formatCurrency(entry.profile.averageTicket) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-subtle">Tempo como cliente</p>
                      <p className="text-foreground-muted">{entry.profile.daysAsCustomer !== null ? `${entry.profile.daysAsCustomer} dias` : "Não determinado"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-foreground-subtle">Última cortesia concedida</p>
                    <p className="text-sm text-foreground-muted">
                      {entry.lastCourtesy ? `${entry.lastCourtesy.description} em ${entry.lastCourtesy.grantedAt.slice(0, 10)} (${formatCurrency(entry.lastCourtesy.amount)})` : "Nenhuma cortesia registrada até hoje."}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs text-foreground-subtle">Sugestões (nenhuma concedida automaticamente — responsável pela decisão: Robério ou Vinícius)</p>
                    {suggestions.length === 0 ? (
                      <p className="text-sm text-foreground-muted">Nenhuma sugestão nova no momento.</p>
                    ) : (
                      <ul className="space-y-2">
                        {suggestions.map((s) => (
                          <li key={s.kind} className="rounded-lg border border-border-subtle p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-foreground">{LOYALTY_SUGGESTION_LABEL[s.kind]}</p>
                              <Badge variant="outline">{s.estimatedCost}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-foreground-muted">{s.reason}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <details className="text-xs text-foreground-subtle">
                    <summary className="cursor-pointer">Critérios pedidos sem dado real disponível hoje</summary>
                    <ul className="mt-1 list-inside list-disc">
                      {untrackedCriteria.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </details>

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
