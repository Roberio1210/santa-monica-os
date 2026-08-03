import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportLineRow } from "@/components/inventory/audit/import-line-row";
import { fetchPurchaseImportPreview } from "@/lib/inventory/purchase-import-service";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";

export const dynamic = "force-dynamic";

export default async function ImportarComprasDetalhePage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  const [preview, allItems] = await Promise.all([fetchPurchaseImportPreview(importId), getInventoryRepository().listItems()]);
  const items = allItems.filter((i) => i.canonicalItemId === null).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const pending = preview.lines.filter((l) => l.status === "pendente" && l.valid);
  const invalid = preview.lines.filter((l) => !l.valid);
  const duplicated = preview.lines.filter((l) => l.status === "duplicado");
  const confirmed = preview.lines.filter((l) => l.status === "confirmado" || l.status === "ignorado");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Importação de compras — ${preview.filename ?? preview.fileFormat.toUpperCase()}`}
        description="Etapa 2 de 2 — confirme cada linha individualmente. Nenhuma linha vira movimentação de estoque sem uma decisão explícita."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{preview.lines.length} linha(s)</Badge>
            <Badge variant="warning">{pending.length} pendente(s)</Badge>
            <Badge variant="critical">{invalid.length} inválida(s)</Badge>
            <Badge variant="info">{duplicated.length} duplicada(s)</Badge>
            <Badge variant="positive">{confirmed.length} resolvida(s)</Badge>
          </div>
        }
      />

      {pending.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Linhas pendentes de decisão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {pending.map((line) => (
              <ImportLineRow key={line.id} line={line} importId={importId} items={items} />
            ))}
          </CardContent>
        </Card>
      )}

      {duplicated.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Compras duplicadas (já importadas antes)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {duplicated.map((line) => (
              <div key={line.id} className="rounded-lg border border-border-subtle p-2 text-sm">
                <p className="font-medium text-foreground">{line.productDescription ?? "Produto sem descrição"}</p>
                <p className="text-xs text-foreground-subtle">
                  {line.date} · {line.supplierName ?? "fornecedor não informado"} · nota {line.invoiceNumber ?? "s/n"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {invalid.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Linhas inválidas (corrigir no arquivo e reimportar)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {invalid.map((line) => (
              <div key={line.id} className="rounded-lg border border-critical/30 bg-critical-bg p-2 text-sm">
                <p className="font-medium text-foreground">Linha {line.rowIndex + 1}</p>
                <ul className="mt-1 list-inside list-disc text-xs text-critical">
                  {(line.validationErrors as string[] | null)?.map((err) => <li key={err}>{err}</li>) ?? null}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {confirmed.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Já resolvidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {confirmed.map((line) => (
              <div key={line.id} className="flex items-center justify-between rounded-lg border border-border-subtle p-2 text-sm">
                <span className="text-foreground-muted">{line.productDescription ?? "Produto sem descrição"}</span>
                <Badge variant={line.status === "ignorado" ? "outline" : "positive"}>{line.status === "ignorado" ? "Ignorada" : `Confirmada (${line.decision ?? ""})`}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
