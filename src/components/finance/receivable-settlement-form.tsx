"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { recordReceivablePaymentAction } from "@/app/financeiro/contas-a-receber/actions";
import type { FinancialAccountBalance } from "@/lib/finance/types";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "text-xs font-medium text-foreground-muted";

interface ReceivableSettlementFormProps {
  accountsReceivableId: string;
  outstandingAmount: number;
  financialAccounts: FinancialAccountBalance[];
}

export function ReceivableSettlementForm({ accountsReceivableId, outstandingAmount, financialAccounts }: ReceivableSettlementFormProps) {
  const [state, formAction, isPending] = useActionState(recordReceivablePaymentAction, { error: null });
  const [allowOverpayment, setAllowOverpayment] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="accountsReceivableId" value={accountsReceivableId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="amount" className={labelClasses}>
            Valor recebido (R$) *
          </label>
          <input id="amount" name="amount" type="text" inputMode="decimal" required defaultValue={outstandingAmount} className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="paidAt" className={labelClasses}>
            Data do recebimento *
          </label>
          <input id="paidAt" name="paidAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="method" className={labelClasses}>
            Forma de recebimento
          </label>
          <select id="method" name="method" defaultValue="desconhecido" className={fieldClasses}>
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
          <label htmlFor="financialAccountId" className={labelClasses}>
            Conta/caixa de entrada
          </label>
          <select id="financialAccountId" name="financialAccountId" className={fieldClasses}>
            <option value="">Não informado</option>
            {financialAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="feeAmount" className={labelClasses}>
            Taxa (R$) — ex.: taxa Stone
          </label>
          <input id="feeAmount" name="feeAmount" type="text" inputMode="decimal" className={fieldClasses} placeholder="Deixe em branco se não houver taxa" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground-muted">
        <input type="checkbox" name="allowOverpayment" checked={allowOverpayment} onChange={(e) => setAllowOverpayment(e.target.checked)} />
        Confirmar recebimento acima do saldo em aberto (só marque se tiver certeza)
      </label>

      {state.error ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{state.error}</p> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar recebimento"}
      </Button>
    </form>
  );
}
