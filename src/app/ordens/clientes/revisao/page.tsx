import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchIdentityReviewQueue, type IdentityReviewItemRow } from "@/lib/integrations/jumppark/identityReviewQuery";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { linkOrderToCustomerAction, keepSeparateAction, deferReviewAction, reopenReviewAction } from "./actions";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  kept_separate: "Mantido separado",
  deferred: "Revisar depois",
};

const statusVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  pending: "warning",
  kept_separate: "positive",
  deferred: "outline",
};

function ReviewItemCard({ item, decided }: { item: IdentityReviewItemRow; decided: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="font-mono text-base">Placa {item.plateMasked}</CardTitle>
        <Badge variant={statusVariant[item.status] ?? "outline"}>{statusLabel[item.status] ?? item.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-xs text-foreground-subtle">{item.rule}</p>

        <div>
          <p className="mb-2 text-xs font-medium text-foreground-subtle">Clientes candidatos (evidência lado a lado — impacto de uma possível fusão)</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {item.candidates.map((c) => (
              <div key={c.customerExternalId} className="rounded-lg border border-border-subtle p-3">
                <p className="font-medium text-foreground">
                  {c.customerId ? (
                    <Link href={`/ordens/clientes/${c.customerId}`} className="hover:text-accent">
                      {c.name}
                    </Link>
                  ) : (
                    c.name
                  )}
                </p>
                <p className="mt-1 text-xs text-foreground-muted">
                  {c.visitCount} visita(s) nesta placa · {formatCurrency(c.totalSpent)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {item.unresolvedOrders.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">
              Ordens antigas desta placa sem cliente identificado ({item.unresolvedOrders.length}) — escolha o cliente correto para cada uma, ou deixe como está
            </p>
            <div className="space-y-2">
              {item.unresolvedOrders.map((o) => (
                <div key={o.orderId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background-elevated p-3">
                  <div className="text-xs text-foreground-muted">
                    <Link href={`/ordens/${o.orderId}`} className="font-medium text-foreground hover:text-accent">
                      {formatDateBR(o.orderDate)}
                    </Link>
                    {" — "}
                    {o.vehicleModel ?? "Não informado"} — {formatCurrency(o.totalAmount)}
                  </div>
                  {!decided ? (
                    <div className="flex flex-wrap gap-2">
                      {item.candidates.map((c) =>
                        c.customerId ? (
                          <form key={c.customerExternalId} action={linkOrderToCustomerAction}>
                            <input type="hidden" name="orderId" value={o.orderId} />
                            <input type="hidden" name="customerId" value={c.customerId} />
                            <input type="hidden" name="plateMasked" value={item.plateMasked} />
                            <Button type="submit" size="sm" variant="outline">
                              Vincular a {c.name}
                            </Button>
                          </form>
                        ) : null,
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-foreground-subtle">Nenhuma ordem sem cliente nesta placa no momento — o item continua aqui só porque a placa tem mais de um nome distinto associado.</p>
        )}

        {item.decidedNotes ? <p className="text-xs italic text-foreground-subtle">Observação: {item.decidedNotes}</p> : null}

        <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
          {!decided ? (
            <>
              <form action={keepSeparateAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <Button type="submit" size="sm" variant="outline">
                  Manter separados
                </Button>
              </form>
              <form action={deferReviewAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <Button type="submit" size="sm" variant="outline">
                  Revisar depois
                </Button>
              </form>
            </>
          ) : (
            <form action={reopenReviewAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <Button type="submit" size="sm" variant="outline">
                Reabrir para revisão
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function IdentityReviewQueuePage() {
  const { pending, decided, databaseConfigured } = await fetchIdentityReviewQueue();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Identidades para revisar"
        description="Placas mascaradas associadas a mais de um nome de cliente distinto nas ordens da JumpPark — nunca fundidas automaticamente. Decida caso a caso; nada aqui exclui ordens e toda decisão pode ser revertida."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/ordens/clientes">Voltar a Clientes</Link>
          </Button>
        }
      />

      {!databaseConfigured ? (
        <Card>
          <CardContent className="pt-6 text-sm text-critical">Banco de dados (Neon) não configurado neste ambiente.</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="pt-4 text-sm text-foreground-muted">
              {pending.length} pendente(s) · {decided.length} já decidido(s). Um item aparece aqui quando a mesma placa (mascarada) aparece em ordens com nomes de clientes diferentes — pode
              ser homônimo fundido por engano, ou duas pessoas reais que usaram o mesmo carro. Sem telefone completo nem identificador estruturado da JumpPark, não há como provar sozinho —
              por isso a decisão fica com um humano.
            </CardContent>
          </Card>

          {pending.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-sm text-foreground-muted">Nenhum item pendente no momento.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pending.map((item) => (
                <ReviewItemCard key={item.id} item={item} decided={false} />
              ))}
            </div>
          )}

          {decided.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-foreground-subtle">Já decididos</h2>
              <div className="space-y-4">
                {decided.map((item) => (
                  <ReviewItemCard key={item.id} item={item} decided={true} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
