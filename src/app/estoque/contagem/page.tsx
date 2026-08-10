import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { CalculationNote } from "@/components/shared/calculation-note";
import { StocktakeView } from "@/components/inventory/stocktake-view";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { generateStocktakeReference } from "@/lib/inventory/stocktake";
import { toItemView } from "@/lib/inventory/status";
import { deriveStocktakeSessions } from "@/lib/inventory/stockAnalytics";
import { formatDateBR } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function ContagemPage() {
  const [rawItems, allMovements] = await Promise.all([getInventoryRepository().listItems(), getInventoryRepository().listMovements()]);
  const items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const itemById = new Map(items.map((i) => [i.id, i]));

  const reference = generateStocktakeReference();
  const sessions = deriveStocktakeSessions(allMovements, itemById).filter((s) => s.type === "correcao_inventario");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contagem física"
        description="Compare o saldo teórico com a contagem física real. Cada divergência confirmada vira uma movimentação de correção — o saldo nunca é sobrescrito diretamente."
      />
      <StocktakeView items={items} reference={reference} />

      <Card>
        <CardHeader>
          <CardTitle>Contagens anteriores ({sessions.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {sessions.length === 0 ? (
            <EmptyState title="Nenhuma recontagem confirmada ainda." description="Contagens confirmadas por aqui aparecem nesta lista, com a diferença real por produto." />
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div key={session.reference} className="rounded-lg border border-border-subtle p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-foreground">
                      {formatDateBR(session.date)} — {session.reference}
                    </span>
                    <span className="text-foreground-muted">{session.responsible ?? "Responsável não informado"}</span>
                  </div>
                  <p className="mt-1 text-xs text-foreground-subtle">
                    {session.lines.length} linha(s) — diferença positiva total: {session.totalPositiveDifference} · diferença negativa total: {session.totalNegativeDifference}
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                          <th className="pb-2 pr-3 font-medium">Produto</th>
                          <th className="pb-2 pr-3 font-medium">Saldo anterior</th>
                          <th className="pb-2 pr-3 font-medium">Contado</th>
                          <th className="pb-2 pr-3 font-medium">Diferença</th>
                          <th className="pb-2 font-medium">Observação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.lines.map((line) => (
                          <tr key={`${session.reference}-${line.itemId}`} className="border-b border-border-subtle last:border-0">
                            <td className="py-2 pr-3 text-foreground-muted">{line.itemName}</td>
                            <td className="py-2 pr-3 text-foreground-muted">{line.previousBalance ?? "—"}</td>
                            <td className="py-2 pr-3 text-foreground-muted">{line.countedQuantity}</td>
                            <td className={`py-2 pr-3 font-medium ${line.difference !== null && line.difference < 0 ? "text-critical" : line.difference !== null && line.difference > 0 ? "text-positive" : "text-foreground-muted"}`}>
                              {line.difference !== null ? (line.difference > 0 ? `+${line.difference}` : line.difference) : "—"}
                            </td>
                            <td className="py-2 text-foreground-muted">{line.notes ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
            <CalculationNote
              source="Movimentações de Estoque, tipo correção de inventário, agrupadas pela referência compartilhada da contagem"
              formula="Diferença = saldo depois da correção − saldo antes dela (nunca a quantidade contada isolada, que é o valor absoluto recontado)"
              period="Histórico completo"
              recordsUsed={`${sessions.length} contagem(ns) confirmada(s)`}
              limitations="A carga inicial (contagem_fisica_inicial) não aparece aqui — é o ponto de partida do sistema, não uma recontagem com divergência a comparar."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
