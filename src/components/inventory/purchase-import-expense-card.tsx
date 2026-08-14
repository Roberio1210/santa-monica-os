"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { linkPurchaseImportToExpenseAction, type FormActionState } from "@/app/estoque/auditoria/actions";
import type { AccountsPayable, FinancialAccountBalance } from "@/lib/finance/types";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "text-xs font-medium text-foreground-muted";

const initialState: FormActionState = { error: null, success: null };

interface PurchaseImportExpenseCardProps {
  purchaseImportId: string;
  existingExpense: AccountsPayable | null;
  suggestedSupplierName: string | null;
  financialAccounts: FinancialAccountBalance[];
}

/**
 * Missão Financeiro V2 (Prioridade 8) — ponte Compra de Estoque → Conta a Pagar. Só aparece
 * quando todas as linhas da importação já foram resolvidas (ver `page.tsx`); nunca lança despesa
 * automática para compras antigas sem confirmação explícita do usuário.
 */
export function PurchaseImportExpenseCard({ purchaseImportId, existingExpense, suggestedSupplierName, financialAccounts }: PurchaseImportExpenseCardProps) {
  const [state, formAction, isPending] = useActionState(linkPurchaseImportToExpenseAction, initialState);

  if (existingExpense) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Despesa financeira</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-foreground-muted">
          <div className="flex items-center justify-between rounded-lg border border-border-subtle p-3">
            <div>
              <p className="font-medium text-foreground">{existingExpense.description}</p>
              <p className="text-xs text-foreground-subtle">Vencimento {formatDateBR(existingExpense.dueDate)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="positive">{formatCurrency(existingExpense.originalAmount)}</Badge>
              <Badge variant="outline">{existingExpense.status}</Badge>
            </div>
          </div>
          <p className="mt-2 text-xs text-foreground-subtle">Esta compra já gerou uma conta a pagar — reenviar o formulário nunca cria uma segunda.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lançar despesa financeira</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="purchaseImportId" value={purchaseImportId} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="supplierText" className={labelClasses}>
                Fornecedor (nome exato do cadastro) *
              </label>
              <input
                id="supplierText"
                name="supplierText"
                type="text"
                required
                defaultValue={suggestedSupplierName ?? ""}
                className={fieldClasses}
                placeholder="Ex.: Farben"
              />
              <p className="mt-1 text-xs text-foreground-subtle">Precisa corresponder a um fornecedor já cadastrado em Financeiro &gt; Fornecedores — nunca inventa o vínculo.</p>
            </div>

            <div>
              <label htmlFor="financialAccountId" className={labelClasses}>
                Conta de pagamento
              </label>
              <select id="financialAccountId" name="financialAccountId" defaultValue="" className={fieldClasses}>
                <option value="">Não decidido ainda</option>
                {financialAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="dueDate" className={labelClasses}>
                Vencimento *
              </label>
              <input id="dueDate" name="dueDate" type="date" required className={fieldClasses} />
            </div>

            <div>
              <label htmlFor="paymentMethod" className={labelClasses}>
                Forma de pagamento
              </label>
              <select id="paymentMethod" name="paymentMethod" defaultValue="desconhecido" className={fieldClasses}>
                <option value="desconhecido">Não informado</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="pix">Pix</option>
                <option value="boleto">Boleto</option>
                <option value="transferencia">Transferência</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <div>
              <label htmlFor="installmentTotal" className={labelClasses}>
                Número de parcelas
              </label>
              <input id="installmentTotal" name="installmentTotal" type="number" min={1} max={60} defaultValue={1} className={fieldClasses} />
            </div>
          </div>

          <div>
            <label htmlFor="notes" className={labelClasses}>
              Observações
            </label>
            <textarea id="notes" name="notes" rows={2} className={`${fieldClasses} h-auto py-2`} />
          </div>

          {state.error ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{state.error}</p> : null}
          {state.success ? <p className="rounded-lg border border-positive/30 bg-positive-bg px-3 py-2 text-sm text-positive">{state.success}</p> : null}

          <Button type="submit" disabled={isPending}>
            {isPending ? "Lançando..." : "Lançar despesa"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
