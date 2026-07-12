"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createCashMovementAction } from "@/app/financeiro/fluxo-de-caixa/actions";
import type { CostCenter, FinancialAccountBalance, FinancialCategory, Partner, Supplier } from "@/lib/finance/types";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "text-xs font-medium text-foreground-muted";

interface CashMovementFormProps {
  financialAccounts: FinancialAccountBalance[];
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  partners: Partner[];
  suppliers: Supplier[];
}

export function CashMovementForm({ financialAccounts, categories, costCenters, partners, suppliers }: CashMovementFormProps) {
  const [state, formAction, isPending] = useActionState(createCashMovementAction, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="date" className={labelClasses}>
            Data *
          </label>
          <input id="date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClasses} />
        </div>

        <div>
          <label htmlFor="type" className={labelClasses}>
            Tipo *
          </label>
          <select id="type" name="type" required defaultValue="entrada" className={fieldClasses}>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </div>

        <div>
          <label htmlFor="nature" className={labelClasses}>
            Natureza
          </label>
          <select id="nature" name="nature" defaultValue="" className={fieldClasses}>
            <option value="">Não informado</option>
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
            <option value="ajuste">Ajuste</option>
            <option value="estorno">Estorno</option>
            <option value="taxa_bancaria">Taxa bancária</option>
            <option value="tarifa">Tarifa</option>
            <option value="juros">Juros</option>
          </select>
        </div>

        <div>
          <label htmlFor="financialAccountId" className={labelClasses}>
            Conta financeira *
          </label>
          <select id="financialAccountId" name="financialAccountId" required defaultValue="" className={fieldClasses}>
            <option value="" disabled>
              Selecione
            </option>
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
          <input id="description" name="description" type="text" required className={fieldClasses} placeholder="Ex.: Taxa Stone do dia" />
        </div>

        <div>
          <label htmlFor="amount" className={labelClasses}>
            Valor (R$) *
          </label>
          <input id="amount" name="amount" type="text" inputMode="decimal" required className={fieldClasses} placeholder="0,00" />
        </div>

        <div>
          <label htmlFor="categoryId" className={labelClasses}>
            Categoria
          </label>
          <select id="categoryId" name="categoryId" defaultValue="" className={fieldClasses}>
            <option value="">Não informado</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type === "receita" ? "receita" : "despesa"})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="costCenterId" className={labelClasses}>
            Centro de custo
          </label>
          <select id="costCenterId" name="costCenterId" defaultValue="" className={fieldClasses}>
            <option value="">Não informado</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="partnerId" className={labelClasses}>
            Cliente/Parceiro
          </label>
          <select id="partnerId" name="partnerId" defaultValue="" className={fieldClasses}>
            <option value="">Não informado</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="supplierId" className={labelClasses}>
            Fornecedor
          </label>
          <select id="supplierId" name="supplierId" defaultValue="" className={fieldClasses}>
            <option value="">Não informado</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
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

        <div>
          <label htmlFor="competenceDate" className={labelClasses}>
            Competência
          </label>
          <input id="competenceDate" name="competenceDate" type="date" className={fieldClasses} />
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
        {isPending ? "Registrando..." : "Registrar lançamento"}
      </Button>
    </form>
  );
}
