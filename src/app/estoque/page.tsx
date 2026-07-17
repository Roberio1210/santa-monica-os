import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { fetchEstoqueOverview } from "@/lib/inventory/overview";
import { getStorageMode } from "@/lib/storage/mode";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Beaker,
  Boxes,
  CalendarClock,
  ClipboardList,
  FlaskConical,
  PackageSearch,
  ShieldCheck,
  Split,
  Wrench,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface OverviewCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  href: string;
}

function OverviewCard({ label, value, hint, icon: Icon, href }: OverviewCardProps) {
  return (
    <Link href={href} className="block rounded-xl" aria-label={`${label}: ${value}. Ver detalhes.`}>
      <Card className="cursor-pointer p-4 transition-colors hover:border-accent/50 hover:bg-background-elevated">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium text-foreground-muted">{label}</p>
          <Icon className="h-4 w-4 text-foreground-subtle" />
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {hint ? <p className="mt-1 text-xs text-foreground-subtle">{hint}</p> : null}
      </Card>
    </Link>
  );
}

export default async function EstoquePage() {
  const overview = await fetchEstoqueOverview();
  const storageMode = getStorageMode();
  const dq = overview.dataQuality;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        description="Painel operacional — insumos, consumo e calibração da Estética Automotiva."
        actions={<StorageModeBadge mode={storageMode} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <OverviewCard label="Produtos ativos" value={String(overview.activeItemsCount)} icon={Boxes} href="/estoque/produtos" />
        <OverviewCard label="Estoque baixo" value={String(overview.lowStockCount)} hint="com mínimo configurado" icon={AlertTriangle} href="/estoque/produtos?status=atencao" />
        <OverviewCard label="Itens críticos" value={String(overview.criticalCount)} hint="abaixo do mínimo" icon={ShieldCheck} href="/estoque/produtos?status=comprar" />
        <OverviewCard
          label="Medição pendente"
          value={String(dq.measurementPending.length)}
          icon={PackageSearch}
          href="/estoque/produtos?quantityStatus=measurement_pending"
        />
        <OverviewCard label="Receitas em calibração" value={String(overview.recipesInCalibration)} icon={Beaker} href="/estoque/receitas?status=em_calibracao" />
        <OverviewCard label="Receitas aprovadas" value={String(overview.recipesApproved)} icon={FlaskConical} href="/estoque/receitas?status=aprovada" />
        <OverviewCard label="Serviços sem receita" value={String(dq.servicesWithoutRecipe.length)} icon={Wrench} href="/estoque/pendencias" />
        <OverviewCard label="Movimentações do mês" value={String(overview.monthMovementsCount)} icon={ClipboardList} href="/estoque/movimentacoes" />
        <OverviewCard
          label="Consumo confirmado no mês"
          value={String(overview.monthConsumptionCount)}
          icon={CalendarClock}
          href="/estoque/movimentacoes?type=consumo_interno"
        />
        <OverviewCard label="Divergências de contagem" value={String(overview.monthDivergenceCount)} hint="no mês" icon={Split} href="/estoque/movimentacoes?type=correcao_inventario" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Módulos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <Button asChild variant="outline">
            <Link href="/estoque/produtos">Produtos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/movimentacoes">Movimentações</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/contagem">Contagem física</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/receitas">Receitas</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/calibracao">Calibração</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/mapeamentos">Mapeamentos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/pendencias">Pendências</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/estoque/compras-sugeridas">Compras sugeridas</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
