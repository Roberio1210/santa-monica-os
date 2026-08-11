import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalculationNote } from "@/components/shared/calculation-note";
import { AutomaticConsumptionTrigger } from "@/components/inventory/automatic-consumption-trigger";
import { listConsumptionConfirmations } from "@/lib/jumppark-orders/consumption-history";
import { processAutomaticConsumption, AUTOMATIC_CONSUMPTION_ACTIVATED_AT } from "@/lib/jumppark-orders/automatic-consumption";
import { getInventoryConsumptionMode } from "@/lib/config/env";
import { formatCurrency } from "@/lib/utils/format";
import { saoPauloDateISO } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-foreground-subtle">{hint}</p> : null}
    </Card>
  );
}

export default async function ConsumoAutomaticoPage() {
  const today = saoPauloDateISO();
  const mode = getInventoryConsumptionMode();

  const [allConfirmations, simulation] = await Promise.all([
    listConsumptionConfirmations(),
    // dryRun: true — nunca escreve, só classifica ordens de hoje para o painel (seção 16, "modo de simulação").
    processAutomaticConsumption(today, today, { dryRun: true }),
  ]);

  const automaticToday = allConfirmations.filter((c) => c.responsibleName === "Sistema (consumo automático)" && c.confirmedAt.slice(0, 10) === today && c.status !== "estornada");
  const linesToday = automaticToday.flatMap((c) => c.lines);
  const distinctProducts = new Set(linesToday.map((l) => l.itemName));
  const knownCostToday = linesToday.some((l) => l.knownCost !== null) ? Math.round(linesToday.reduce((sum, l) => sum + (l.knownCost ?? 0), 0) * 100) / 100 : null;
  const costIncomplete = linesToday.some((l) => l.knownCost === null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consumo automático"
        description="JumpPark → serviço realizado → receita → consumo teórico → saída de estoque, sem clique por ordem quando a receita já está aprovada."
        actions={<Badge variant={mode === "automatic" ? "positive" : "outline"}>Modo: {mode}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Ordens processadas hoje" value={automaticToday.length} hint="Baixas reais confirmadas automaticamente" />
        <StatCard label="Linhas de consumo geradas hoje" value={linesToday.length} />
        <StatCard label="Produtos distintos consumidos hoje" value={distinctProducts.size} />
        <StatCard label="Custo conhecido hoje" value={knownCostToday !== null ? formatCurrency(knownCostToday) : "Não informado"} hint={costIncomplete ? "Custo parcial — algum produto sem custo cadastrado" : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pendências de hoje (simulação — nenhuma escrita)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Ordens não mapeadas" value={simulation.ordersUnmapped} />
            <StatCard label="Ordens sem receita aprovada" value={simulation.ordersWithoutApprovedRecipe} />
            <StatCard label="Requerem revisão humana" value={simulation.ordersRequiringHumanReview} hint="Categoria de veículo desconhecida ou prévia parcial" />
            <StatCard label="Falhas" value={simulation.ordersFailed} />
            <StatCard label="Duplicidades evitadas" value={simulation.ordersAlreadyConsumed} />
            <StatCard label="Prontas para consumir" value={simulation.results.filter((r) => r.wouldProcess).length} hint="Seriam processadas agora, se o botão abaixo for usado" />
          </div>
          <div className="mt-4">
            <AutomaticConsumptionTrigger />
          </div>
        </CardContent>
      </Card>

      <CalculationNote
        source="fetchEligibleOrders (mesma fonte de /estoque/ordens) + confirmações reais em inventory_consumption_confirmations com responsável 'Sistema (consumo automático)'"
        formula="Uma ordem só consome de verdade quando todos os serviços mapeados têm receita aprovada aplicável (>= 5 amostras reais de calibração) — nunca por aproximação."
        period={`Hoje (${today})`}
        recordsUsed={`${simulation.ordersEvaluated} ordem(ns) elegível(is) avaliada(s) hoje`}
        limitations={`Ativado a partir de ${AUTOMATIC_CONSUMPTION_ACTIVATED_AT} — nenhuma ordem anterior é processada (sem backfill retroativo).`}
      />
    </div>
  );
}
