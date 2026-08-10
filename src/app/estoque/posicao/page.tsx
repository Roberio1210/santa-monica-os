import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalculationNote } from "@/components/shared/calculation-note";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { PositionTable } from "@/components/inventory/position-table";
import { fetchStockGerencial } from "@/lib/inventory/stockGerencial";
import { resolvePeriod } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

export default async function PosicaoEstoquePage() {
  const result = await fetchStockGerencial(resolvePeriod("month"));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Posição atual do estoque"
        description="Todos os produtos, com saldo, custo, última movimentação e status — filtrável e paginado."
        actions={
          <>
            <StorageModeBadge mode={result.storageMode} />
            <Button asChild variant="outline" size="sm">
              <Link href="/estoque">Voltar para Estoque</Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <PositionTable rows={result.position} />
          <div className="mt-4">
            <CalculationNote
              source="Movimentações de Estoque (inventory_movements) + cadastro de produtos (inventory_items)"
              formula="Saldo, custo médio e último custo vêm diretamente do produto e do histórico de movimentações — nada é recalculado além do que o próprio livro-razão já registra. Status: ZERADO (saldo=0) > CRÍTICO (saldo ≤ mínimo) > BAIXO (saldo ≤ 1.5× mínimo) > SEM MOVIMENTAÇÃO (180+ dias sem nenhuma movimentação) > NORMAL."
              period="Situação atual — não depende de período selecionado"
              recordsUsed={`${result.position.length} produto(s)`}
              limitations="Estoque mínimo, quando não cadastrado, nunca é inferido — o produto só pode cair em BAIXO/CRÍTICO se tiver um mínimo definido manualmente."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
