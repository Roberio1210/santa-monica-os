import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Unavailable } from "@/components/shared/unavailable";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { fetchProductDetail } from "@/lib/inventory/product-detail";
import type { InventoryStatus, MovementType } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

const statusMeta: Record<InventoryStatus, { label: string; variant: "positive" | "warning" | "critical" | "outline" }> = {
  ok: { label: "OK", variant: "positive" },
  atencao: { label: "Atenção", variant: "warning" },
  comprar: { label: "Comprar", variant: "critical" },
  sem_minimo: { label: "Sem mínimo definido", variant: "outline" },
};

const movementLabels: Record<MovementType, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste_inventario: "Ajuste de inventário",
  perda: "Perda",
  consumo_interno: "Consumo interno",
  compra: "Compra",
  contagem_fisica_inicial: "Contagem física inicial",
  ajuste_positivo: "Ajuste positivo",
  ajuste_negativo: "Ajuste negativo",
  avaria: "Avaria",
  vencimento: "Vencimento",
  devolucao: "Devolução",
  transferencia: "Transferência",
  consumo_teste_calibracao: "Consumo de calibração",
  correcao_inventario: "Correção de inventário",
};

function IndicatorCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-foreground-subtle">{hint}</p> : null}
    </Card>
  );
}

export default async function ProdutoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchProductDetail(id);
  if (!detail) notFound();

  const { item, movements, recipes, relatedItems, lastEntryDate, lastConsumptionDate, autonomy } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.name}
        description={`${item.brand} — ${item.category}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={statusMeta[item.status].variant}>{statusMeta[item.status].label}</Badge>
            {item.quantityStatus === "measurement_pending" ? <Badge variant="warning">Medição pendente</Badge> : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <IndicatorCard label="Saldo atual" value={`${item.currentQuantity} ${item.unit}`} hint={item.fillPercent !== null ? `${item.fillPercent}% da embalagem` : undefined} />
        <IndicatorCard label="Custo médio" value={item.unitCost !== null ? formatCurrency(item.unitCost) : "Não informado"} />
        <IndicatorCard label="Valor em estoque" value={item.stockValue !== null ? formatCurrency(item.stockValue) : "Não informado"} />
        <IndicatorCard label="Última entrada" value={lastEntryDate ? formatDateBR(lastEntryDate) : "Sem registro"} />
        <IndicatorCard label="Último consumo" value={lastConsumptionDate ? formatDateBR(lastConsumptionDate) : "Sem registro"} />
        <IndicatorCard
          label="Autonomia estimada"
          value={autonomy.services !== null ? `${autonomy.services} serviço(s)` : autonomy.reason}
          hint={autonomy.consumptionPerService !== null ? `${autonomy.consumptionPerService} ${item.unit}/serviço` : undefined}
        />
        <IndicatorCard label="Estoque mínimo" value={item.minimumStock !== null ? `${item.minimumStock} ${item.unit}` : "Estoque mínimo ainda não configurado"} />
        <IndicatorCard label="Última contagem" value={formatDateBR(item.lastCountDate)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Nome canônico" value={item.name} />
            <Row label="Nome original" value={item.originalName ?? "Igual ao nome canônico"} />
            <Row label="Marca" value={item.brand} />
            <Row label="Categoria" value={item.category} />
            <Row label="Estado físico" value={{ liquido: "Líquido", massa: "Massa", peca: "Peça" }[item.physicalState]} />
            <Row label="Unidade-base" value={item.unit} />
            <Row label="Embalagem" value={item.packageCapacity !== null ? `${item.packageCapacity} ${item.unit} × ${item.packageCount ?? 1}` : "Não informado"} />
            <Row label="Condição" value={item.condition} />
            <Row label="Localização" value="Não informado" />
            <Row label="Fornecedor" value="Não informado" />
            <Row label="Observações" value={item.notes ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produtos relacionados</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {relatedItems.length === 0 ? (
              <EmptyState title="Nenhum lote relacionado." description="Este é o único item cadastrado com esta marca e nome." />
            ) : (
              <ul className="space-y-2">
                {relatedItems.map((related) => (
                  <li key={related.id}>
                    <Link href={`/estoque/produtos/${related.id}`} className="flex items-center justify-between rounded-lg border border-border-subtle p-2 text-sm hover:border-accent/50 hover:bg-background-elevated">
                      <span className="text-foreground-muted">{related.name}</span>
                      <span className="flex items-center gap-2">
                        {related.quantityStatus === "measurement_pending" ? <Badge variant="warning">Medição pendente</Badge> : null}
                        <span className="text-foreground">
                          {related.currentQuantity} {related.unit}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receitas relacionadas</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recipes.length === 0 ? (
            <EmptyState title="Nenhuma receita ainda usa este produto." description="Crie uma receita em /estoque/receitas para vincular este produto a um serviço." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Serviço</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Etapa</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Consumo esperado</th>
                    <th className="pb-2 font-medium">Amostras</th>
                  </tr>
                </thead>
                <tbody>
                  {recipes.map(({ recipe, serviceName }) => (
                    <tr key={recipe.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/estoque/receitas/${recipe.id}`} className="font-medium text-foreground hover:text-accent hover:underline">
                          {serviceName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.vehicleCategory}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.processStep}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.status}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.quantityPerService !== null ? `${recipe.quantityPerService} ${recipe.unit}` : "Aguardando calibração"}</td>
                      <td className="py-2 text-foreground-muted">{recipe.sampleCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimentações — {movements.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {movements.length === 0 ? (
            <EmptyState title="Nenhuma movimentação registrada." />
          ) : (
            <ol className="space-y-2">
              {movements.map((m) => (
                <li key={m.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{movementLabels[m.type]}</Badge>
                      <span className="text-foreground-muted">{formatDateBR(m.date)}</span>
                    </div>
                    <span className="font-medium text-foreground">
                      {m.quantity} {m.unit}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-subtle">
                    <span>
                      Saldo: {m.previousBalance !== null ? m.previousBalance : <Unavailable label="não registrado" />} → {m.newBalance ?? <Unavailable label="não registrado" />}
                    </span>
                    {m.reference ? <span>Ref.: {m.reference}</span> : null}
                    {m.responsible ? <span>Responsável: {m.responsible}</span> : null}
                  </div>
                  {m.notes ? <p className="mt-1 text-xs text-foreground-muted">{m.notes}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-1.5 last:border-0">
      <span className="text-foreground-subtle">{label}</span>
      <span className="text-right text-foreground-muted">{value}</span>
    </div>
  );
}
