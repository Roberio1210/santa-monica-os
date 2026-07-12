import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ReceivableSettlementForm } from "@/components/finance/receivable-settlement-form";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { toAccountsReceivableView } from "@/lib/finance/status";
import { fetchFinancialAccounts } from "@/lib/finance/service";
import {
  cancelAccountsReceivableAction,
  deleteAccountsReceivableAction,
  reverseReceivableSettlementAction,
} from "@/app/financeiro/contas-a-receber/actions";
import type { AccountsReceivableStatus, FinancePaymentMethod } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

const statusLabels: Record<AccountsReceivableStatus, string> = {
  draft: "Rascunho",
  open: "Em aberto",
  partially_paid: "Parcial",
  paid: "Recebido",
  overdue: "Atrasado",
  cancelled: "Cancelado",
  reversed: "Estornado",
};

const statusVariant: Record<AccountsReceivableStatus, "outline" | "warning" | "positive" | "critical" | "default"> = {
  draft: "outline",
  open: "default",
  partially_paid: "warning",
  paid: "positive",
  overdue: "critical",
  cancelled: "outline",
  reversed: "critical",
};

const paymentMethodLabels: Record<FinancePaymentMethod, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  boleto: "Boleto",
  transferencia: "Transferência",
  outro: "Outro",
  desconhecido: "Não informado",
};

export default async function ContaAReceberDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getFinanceRepository();
  const [item, settlements, financialAccounts] = await Promise.all([
    repo.getAccountsReceivable(id),
    repo.listReceivableSettlements(id),
    fetchFinancialAccounts(),
  ]);

  if (!item) notFound();

  const asOfDate = new Date().toISOString().slice(0, 10);
  const view = toAccountsReceivableView(item, asOfDate);
  const canDelete = settlements.length === 0;
  const canReceive = view.computedStatus !== "paid" && view.computedStatus !== "cancelled";

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.description}
        description={`Vencimento ${formatDateBR(item.dueDate)} · Competência ${item.competenceDate.slice(0, 7)}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/financeiro/contas-a-receber" className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />
              Voltar
            </Link>
            <Badge variant={statusVariant[view.computedStatus]}>{statusLabels[view.computedStatus]}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Cliente/Parceiro" value={item.partyName} />
            <Row label="Categoria" value={item.categoryName ?? "Não informado"} />
            <Row label="Centro de custo" value={item.costCenterName ?? "Não informado"} />
            <Row label="Conta de recebimento" value={item.financialAccountName ?? "Não informado"} />
            <Row label="Emissão" value={formatDateBR(item.issueDate)} />
            <Row label="Vencimento" value={formatDateBR(item.dueDate)} />
            <Row label="Forma de recebimento" value={paymentMethodLabels[item.paymentMethod]} />
            <Row label="Nota fiscal" value={item.invoiceIssued ? (item.invoiceNumber ?? "Emitida, sem número informado") : "Não emitida"} />
            {item.installmentTotal ? <Row label="Parcela" value={`${item.installmentNumber}/${item.installmentTotal}`} /> : null}
            <Row label="Responsável" value={item.responsibleName ?? "Não informado"} />
            <Row label="Aprovador" value={item.approverName ?? "Não informado"} />
            {item.notes ? <Row label="Observações" value={item.notes} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Valor previsto" value={formatCurrency(item.expectedAmount)} />
            <Row label="Valor recebido" value={formatCurrency(item.receivedAmount)} />
            <Row label="Saldo em aberto" value={formatCurrency(item.outstandingAmount)} emphasis />
            {item.feeAmount !== null ? <Row label="Taxas descontadas" value={formatCurrency(item.feeAmount)} /> : null}
            {item.netAmount !== null ? <Row label="Valor líquido recebido" value={formatCurrency(item.netAmount)} /> : null}
          </CardContent>
        </Card>
      </div>

      {canReceive ? (
        <Card>
          <CardHeader>
            <CardTitle>Registrar recebimento</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ReceivableSettlementForm accountsReceivableId={item.id} outstandingAmount={item.outstandingAmount} financialAccounts={financialAccounts} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Histórico de recebimentos</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {settlements.length === 0 ? (
            <EmptyState title="Nenhum recebimento registrado" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 pr-3 font-medium">Taxa</th>
                    <th className="pb-2 pr-3 font-medium">Valor líquido</th>
                    <th className="pb-2 pr-3 font-medium">Forma</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((settlement) => (
                    <tr key={settlement.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(settlement.paidAt)}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(settlement.amount)}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{settlement.feeAmount !== null ? formatCurrency(settlement.feeAmount) : "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{settlement.netAmount !== null ? formatCurrency(settlement.netAmount) : "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{paymentMethodLabels[settlement.method]}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={settlement.reversed ? "outline" : "positive"}>{settlement.reversed ? "Estornado" : "Ativo"}</Badge>
                      </td>
                      <td className="py-2">
                        {!settlement.reversed ? (
                          <form action={reverseReceivableSettlementAction}>
                            <input type="hidden" name="settlementId" value={settlement.id} />
                            <input type="hidden" name="accountsReceivableId" value={item.id} />
                            <button type="submit" className="text-xs text-critical hover:underline">
                              Estornar
                            </button>
                          </form>
                        ) : null}
                      </td>
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
          <CardTitle>Ações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <Button asChild variant="outline">
            <Link href={`/financeiro/contas-a-receber/${item.id}/editar`}>
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
          </Button>

          {view.computedStatus !== "cancelled" ? (
            <form action={cancelAccountsReceivableAction}>
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit" variant="outline">
                Cancelar
              </Button>
            </form>
          ) : null}

          <form action={deleteAccountsReceivableAction}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="outline" disabled={!canDelete} title={!canDelete ? "Só é possível excluir contas sem recebimentos — use cancelar." : undefined}>
              Excluir definitivamente
            </Button>
          </form>
        </CardContent>
        {!canDelete ? (
          <CardContent className="pt-0 text-xs text-foreground-subtle">
            Exclusão definitiva desabilitada porque já existe recebimento registrado (mesmo estornado). Use &ldquo;Cancelar&rdquo;.
          </CardContent>
        ) : null}
      </Card>

      <p className="text-xs text-foreground-subtle">
        Ações protegidas apenas pelo gate de acesso atual (Basic Auth) — aprovação exclusiva de Robério será aplicada quando
        o sistema de usuários e papéis for implementado (ver docs/finance-module.md).
      </p>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
      <p className="text-foreground-subtle">{label}</p>
      <p className={emphasis ? "font-semibold text-foreground" : "text-foreground-muted"}>{value}</p>
    </div>
  );
}
