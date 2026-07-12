"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { recordAccountTransferAction } from "@/app/financeiro/fluxo-de-caixa/actions";
import type { FinancialAccountBalance } from "@/lib/finance/types";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "text-xs font-medium text-foreground-muted";

interface AccountTransferFormProps {
  financialAccounts: FinancialAccountBalance[];
}

export function AccountTransferForm({ financialAccounts }: AccountTransferFormProps) {
  const [state, formAction, isPending] = useActionState(recordAccountTransferAction, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className={labelClasses}>
            Tipo *
          </label>
          <select id="type" name="type" required defaultValue="transferencia" className={fieldClasses}>
            <option value="transferencia">Transferência entre contas</option>
            <option value="reposicao_caixa">Reposição de caixa</option>
            <option value="aporte_socios">Aporte dos sócios</option>
            <option value="retirada">Retirada</option>
          </select>
        </div>

        <div>
          <label htmlFor="date" className={labelClasses}>
            Data *
          </label>
          <input id="date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClasses} />
        </div>

        <div>
          <label htmlFor="fromAccountId" className={labelClasses}>
            Conta origem
          </label>
          <select id="fromAccountId" name="fromAccountId" defaultValue="" className={fieldClasses}>
            <option value="">Nenhuma (aporte externo)</option>
            {financialAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="toAccountId" className={labelClasses}>
            Conta destino
          </label>
          <select id="toAccountId" name="toAccountId" defaultValue="" className={fieldClasses}>
            <option value="">Nenhuma (saída do sistema)</option>
            {financialAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className={labelClasses}>
            Descrição *
          </label>
          <input id="description" name="description" type="text" required className={fieldClasses} placeholder="Ex.: Transferência Stone → Caixa físico" />
        </div>

        <div>
          <label htmlFor="amount" className={labelClasses}>
            Valor (R$) *
          </label>
          <input id="amount" name="amount" type="text" inputMode="decimal" required className={fieldClasses} placeholder="0,00" />
        </div>

        <div>
          <label htmlFor="responsibleName" className={labelClasses}>
            Usuário/Responsável
          </label>
          <input id="responsibleName" name="responsibleName" type="text" className={fieldClasses} />
        </div>

        <div>
          <label htmlFor="documentRef" className={labelClasses}>
            Documento
          </label>
          <input id="documentRef" name="documentRef" type="text" className={fieldClasses} />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className={labelClasses}>
          Observação
        </label>
        <textarea id="notes" name="notes" rows={2} className={`${fieldClasses} h-auto py-2`} />
      </div>

      {state.error ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{state.error}</p> : null}
      {state.success ? <p className="rounded-lg border border-positive/30 bg-positive-bg px-3 py-2 text-sm text-positive">{state.success}</p> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar transferência"}
      </Button>
    </form>
  );
}
