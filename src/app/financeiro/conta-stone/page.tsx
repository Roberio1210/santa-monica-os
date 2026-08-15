import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/operations/period-selector";
import { BankStatementImportForm } from "@/components/finance/bank-statement-import-form";
import { BankStatementLineList } from "@/components/finance/bank-statement-line-list";
import { fetchStoneAccountOverview } from "@/lib/finance/bankStatement/accountOverviewService";
import { fetchAccountsReceivableOverview, fetchAccountsPayableOverview, fetchFinancialAccounts } from "@/lib/finance/service";
import { formatCurrency } from "@/lib/utils/format";
import { parsePeriodParams } from "@/lib/utils/timezone";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Scale } from "lucide-react";
import type { BankStatementLineDirection, BankStatementLineStatus } from "@/lib/finance/bankStatement/types";

export const dynamic = "force-dynamic";

interface SearchParams {
  period?: string;
  from?: string;
  to?: string;
  status?: string;
  direction?: string;
}

const VALID_STATUSES: BankStatementLineStatus[] = ["conciliado", "sugerido", "nao_conciliado", "a_classificar", "ignorado"];

export default async function ContaStonePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const statusFilter = VALID_STATUSES.includes(params.status as BankStatementLineStatus) ? (params.status as BankStatementLineStatus) : undefined;
  const directionFilter = params.direction === "entrada" || params.direction === "saida" ? (params.direction as BankStatementLineDirection) : undefined;

  // O id real da conta Stone é gerado pelo banco (uuid) — nunca fixo no código (o seed em
  // memória usa "conta-stone" só como slug de teste; no Postgres real o id é outro). Resolvido
  // pelo nome, mesmo padrão já usado para o Caixa físico em /financeiro.
  const financialAccounts = await fetchFinancialAccounts();
  const stoneAccount = financialAccounts.find((a) => a.name.toLowerCase() === "stone");
  if (!stoneAccount) {
    return (
      <div className="space-y-6">
        <PageHeader title="Conta Stone" description="Conta financeira 'Stone' não encontrada em Financeiro > Contas — cadastre-a antes de usar o extrato." />
      </div>
    );
  }
  const stoneAccountId = stoneAccount.id;

  const [overview, receivableOverview, payableOverview] = await Promise.all([
    fetchStoneAccountOverview(stoneAccountId, period.from, period.to, { status: statusFilter, direction: directionFilter }),
    fetchAccountsReceivableOverview(),
    fetchAccountsPayableOverview(),
  ]);

  const openReceivables = receivableOverview.items.filter((i) => i.computedStatus === "open" || i.computedStatus === "partially_paid" || i.computedStatus === "overdue");
  const openPayables = payableOverview.items.filter((i) => i.computedStatus === "pendente" || i.computedStatus === "vencida" || i.computedStatus === "parcialmente_paga");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conta Stone"
        description="Extrato bancário real da conta Stone, reconciliado com as vendas já registradas — nunca duplica receita de uma venda já reconhecida via JumpPark/Stone adquirência."
        actions={<PeriodSelector period={period} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Saldo inicial do período" value={formatCurrency(overview.summary.openingBalance)} icon={Wallet} />
        <StatCard label="Entradas do período" value={formatCurrency(overview.summary.totalIn)} icon={ArrowDownCircle} />
        <StatCard label="Saídas do período" value={formatCurrency(overview.summary.totalOut)} icon={ArrowUpCircle} />
        <StatCard label="Saldo final do período" value={formatCurrency(overview.summary.closingBalance)} icon={Scale} />
      </div>

      <Card>
        <CardContent className="pt-4 text-sm">
          {overview.divergenceVsInformedBalance === null ? (
            <p className="text-xs text-foreground-subtle">
              Saldo bancário nunca foi conferido manualmente para esta conta — sem divergência para mostrar. Use Fluxo de Caixa &gt; Contas para registrar o saldo real do banco.
            </p>
          ) : Math.abs(overview.divergenceVsInformedBalance) < 0.01 ? (
            <p className="flex items-center gap-2 text-positive">
              <Badge variant="positive">Sem divergência</Badge> Saldo calculado bate com o último saldo bancário conferido.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-critical">
              <Badge variant="critical">Divergência de {formatCurrency(overview.divergenceVsInformedBalance)}</Badge>
              Diferença entre o saldo calculado pelo sistema e o último saldo bancário conferido manualmente — investigar antes de confiar no saldo.
            </p>
          )}
        </CardContent>
      </Card>

      <BankStatementImportForm financialAccountId={stoneAccountId} />

      <BankStatementLineList
        financialAccountId={stoneAccountId}
        lines={overview.lines}
        financialAccounts={financialAccounts.filter((a) => a.id !== stoneAccountId)}
        openReceivables={openReceivables.map((r) => ({ id: r.id, label: `${r.partyName} — ${formatCurrency(r.outstandingAmount)} (${r.description})` }))}
        openPayables={openPayables.map((p) => ({ id: p.id, label: `${p.supplierName ?? "Sem fornecedor"} — ${formatCurrency(p.outstandingAmount)} (${p.description})` }))}
        currentStatus={statusFilter}
        currentDirection={directionFilter}
      />
    </div>
  );
}
