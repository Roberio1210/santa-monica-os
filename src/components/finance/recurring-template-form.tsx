"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createRecurringBillTemplateAction, type FormActionState } from "@/app/financeiro/contas-a-pagar/actions";
import type { CostCenter, FinancialCategory, Supplier } from "@/lib/finance/types";

const fieldClasses = "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "text-xs font-medium text-foreground-muted";

const initialState: FormActionState = { error: null, success: null };

/**
 * Missão de Instrumentação Gerencial — cadastro de um novo modelo de recorrência real (ex.: uma
 * assinatura nova, um aluguel novo). Nunca lança nenhuma despesa sozinho — só cria o modelo, que
 * passa a aparecer na lista abaixo para geração explícita, competência a competência.
 */
export function RecurringTemplateForm({ suppliers, categories, costCenters }: { suppliers: Supplier[]; categories: FinancialCategory[]; costCenters: CostCenter[] }) {
  const [state, formAction, isPending] = useActionState(createRecurringBillTemplateAction, initialState);
  const [variableAmount, setVariableAmount] = useState(false);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Nova recorrência
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova recorrência</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="rtf-description" className={labelClasses}>
              Descrição *
            </label>
            <input id="rtf-description" name="description" type="text" required placeholder="Ex.: Assinatura sistema X" className={fieldClasses} />
          </div>
          <div>
            <label htmlFor="rtf-category" className={labelClasses}>
              Categoria *
            </label>
            <select id="rtf-category" name="categoryId" required defaultValue="" className={fieldClasses}>
              <option value="" disabled>
                Selecione
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rtf-supplier" className={labelClasses}>
              Fornecedor/beneficiário
            </label>
            <select id="rtf-supplier" name="supplierId" defaultValue="" className={fieldClasses}>
              <option value="">Não informado</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rtf-costcenter" className={labelClasses}>
              Centro de custo
            </label>
            <select id="rtf-costcenter" name="costCenterId" defaultValue="" className={fieldClasses}>
              <option value="">Não informado</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input id="rtf-variable" type="checkbox" checked={variableAmount} onChange={(e) => setVariableAmount(e.target.checked)} className="h-4 w-4" />
            <label htmlFor="rtf-variable" className="text-sm text-foreground-muted">
              Valor variável por competência (ex.: água, energia) — nunca repetir um valor fixo quando o real muda todo mês
            </label>
            <input type="hidden" name="variableAmount" value={variableAmount ? "on" : ""} />
          </div>
          {!variableAmount ? (
            <div>
              <label htmlFor="rtf-amount" className={labelClasses}>
                Valor mensal (R$) *
              </label>
              <input id="rtf-amount" name="amount" type="text" inputMode="decimal" required={!variableAmount} placeholder="Ex.: 125,00" className={fieldClasses} />
            </div>
          ) : null}
          <div>
            <label htmlFor="rtf-dueday" className={labelClasses}>
              Dia de vencimento (1-28)
            </label>
            <input id="rtf-dueday" name="dueDay" type="text" inputMode="numeric" placeholder="Ex.: 10 (deixe em branco se variar)" className={fieldClasses} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="rtf-notes" className={labelClasses}>
              Observações
            </label>
            <input id="rtf-notes" name="notes" type="text" placeholder="Opcional" className={fieldClasses} />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Cadastrar recorrência"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
            {state.success ? <p className="text-sm text-positive">{state.success}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
