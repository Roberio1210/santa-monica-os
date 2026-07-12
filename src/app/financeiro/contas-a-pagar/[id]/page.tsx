import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PayableSettlementForm } from "@/components/finance/payable-settlement-form";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { toAccountsPayableView } from "@/lib/finance/status";
import { fetchFinancialAccounts } from "@/lib/finance/service";
import {
  cancelAccountsPayableAction,
  deleteAccountsPayableAction,
  reversePayableSettlementAction,
} from "@/app/financeiro/contas-a-pagar/actions";
import type { AccountsPayableStatus, FinancePaymentMethod } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

const statusLabels: Record<AccountsPayableStatus, string> = {
  rascunho: "Rascunho",
  pendente: "Pendente",
  parcialmente_paga: "Parcialmente paga",
  paga: "Paga",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

const statusVariant: Record<AccountsPayableStatus, "outline" | "warning" | "positive" | "critical" | "default"> = {
  rascunho: "outline",
  pendente: "default",
  parcialmente_paga: "warning",
  paga: "positive",
  vencida: "critical",
  cancelada: "outline",
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

export default async function ContaAPagarDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getFinanceRepository();
  const [item, settlements, financialAccounts] = await Promise.all([
    repo.getAccountsPayable(id),
    repo.listPayableSettlements(id),
    fetchFinancialAccounts(),
  ]);

  if (!item) notFound();

  const asOfDate = new Date().toISOString().slice(0, 10);
  const view = toAccountsPayableView(item, asOfDate);
  const canDelete = settlements.length === 0;
  const canPay = view.computedStatus !== "paga" && view.computedStatus !== "cancelada";

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.description}
        description={`Vencimento ${formatDateBR(item.dueDate)} · Competência ${item.competenceDate.slice(0, 7)}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/financeiro/contas-a-pagar" className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />
              Voltar
            </Link>
            <Badge variant={statusVariant[view.computedStatus]}>{statusLabels[view.computedStatus]}</Badge>
          </div>
        }
      />

      {item.pendingData ? (
        <Card>
          <CardContent className="pt-4">
            <Badge variant="warning">Dados pendentes</Badge>
            <p className="mt-2 text-sm text-foreground-muted">
              Este cadastro tem informação real ainda não confirmada pelo proprietário (ex.: credor não informado). Nada foi
              inventado — complete quando a informação existir.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Fornecedor" value={item.supplierName ?? "Não informado"} />
            <Row label="Categoria" value={item.categoryName} />
            <Row label="Centro de custo" value={item.costCenterName ?? "Não informado"} />
            <Row label="Conta de pagamento" value={item.financialAccountName ?? "Não informado"} />
            <Row label="Emissão" value={formatDateBR(item.issueDate)} />
            <Row label="Vencimento" value={formatDateBR(item.dueDate)} />
            <Row label="Forma de pagamento" value={paymentMethodLabels[item.paymentMethod]} />
            <Row label="Documento" value={item.documentNumber ?? "Não informado"} />
            {item.installmentTotal ? <Row label="Parcela" value={`${item.installmentNumber}/${item.installmentTotal}`} /> : null}
            {item.notes ? <Row label="Observações" value={item.notes} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <Row label="Valor original" value={formatCurrency(item.originalAmount)} />
            <Row label="Valor pago" value={formatCurrency(item.paidAmount)} />
            <Row label="Saldo em aberto" value={formatCurrency(item.outstandingAmount)} emphasis />
          </CardContent>
        </Card>
      </div>

      {canPay ? (
        <Card>
          <CardHeader>
            <CardTitle>Registrar pagamento</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <PayableSettlementForm accountsPayableId={item.id} outstandingAmount={item.outstandingAmount} financialAccounts={financialAccounts} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Histórico de baixas</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {settlements.length === 0 ? (
            <EmptyState title="Nenhum pagamento registrado" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
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
                      <td className="py-2 pr-3 text-foreground-muted">{paymentMethodLabels[settlement.method]}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={settlement.reversed ? "outline" : "positive"}>{settlement.reversed ? "Estornada" : "Ativa"}</Badge>
                      </td>
                      <td className="py-2">
                        {!settlement.reversed ? (
                          <form action={reversePayableSettlementAction}>
                            <input type="hidden" name="settlementId" value={settlement.id} />
                            <input type="hidden" name="accountsPayableId" value={item.id} />
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
            <Link href={`/financeiro/contas-a-pagar/${item.id}/editar`}>
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
          </Button>

          {view.computedStatus !== "cancelada" ? (
            <form action={cancelAccountsPayableAction}>
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit" variant="outline">
                Cancelar
              </Button>
            </form>
          ) : null}

          <form action={deleteAccountsPayableAction}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="outline" disabled={!canDelete} title={!canDelete ? "Só é possível excluir contas sem pagamentos — use cancelar." : undefined}>
              Excluir definitivamente
            </Button>
          </form>
        </CardContent>
        {!canDelete ? (
          <CardContent className="pt-0 text-xs text-foreground-subtle">
            Exclusão definitiva desabilitada porque já existe pagamento registrado (mesmo estornado). Use &ldquo;Cancelar&rdquo;.
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
