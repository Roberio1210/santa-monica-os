"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FormActionState } from "@/app/financeiro/contas-a-pagar/actions";
import type { AccountsPayable, FinancialAccountBalance, Supplier } from "@/lib/finance/types";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "text-xs font-medium text-foreground-muted";

interface CategoryOption {
  id: string;
  name: string;
}

interface CostCenterOption {
  id: string;
  name: string;
}

interface AccountsPayableFormProps {
  mode: "create" | "edit";
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  suppliers: Supplier[];
  categories: CategoryOption[];
  costCenters: CostCenterOption[];
  financialAccounts: FinancialAccountBalance[];
  initialValues?: AccountsPayable;
}

const initialState: FormActionState = { error: null };

export function AccountsPayableForm({ mode, action, suppliers, categories, costCenters, financialAccounts, initialValues }: AccountsPayableFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "Nova conta a pagar" : "Editar conta a pagar"}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form action={formAction} className="space-y-4">
          {mode === "edit" && initialValues ? <input type="hidden" name="id" value={initialValues.id} /> : null}

          <div>
            <label htmlFor="description" className={labelClasses}>
              Descrição *
            </label>
            <input
              id="description"
              name="description"
              type="text"
              required
              defaultValue={initialValues?.description}
              className={fieldClasses}
              placeholder="Ex.: Aluguel + IPTU — julho/2026"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="supplierId" className={labelClasses}>
                Fornecedor (opcional)
              </label>
              <select id="supplierId" name="supplierId" defaultValue={initialValues?.supplierId ?? ""} className={fieldClasses}>
                <option value="">Não informado</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="categoryId" className={labelClasses}>
                Categoria *
              </label>
              <select id="categoryId" name="categoryId" required defaultValue={initialValues?.categoryId ?? ""} className={fieldClasses}>
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
              <label htmlFor="costCenterId" className={labelClasses}>
                Centro de custo
              </label>
              <select id="costCenterId" name="costCenterId" defaultValue={initialValues?.costCenterId ?? ""} className={fieldClasses}>
                <option value="">Não informado</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="financialAccountId" className={labelClasses}>
                Conta de pagamento
              </label>
              <select id="financialAccountId" name="financialAccountId" defaultValue={initialValues?.financialAccountId ?? ""} className={fieldClasses}>
                <option value="">Não decidido ainda</option>
                {financialAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="competenceDate" className={labelClasses}>
                Competência *
              </label>
              <input id="competenceDate" name="competenceDate" type="date" required defaultValue={initialValues?.competenceDate} className={fieldClasses} />
            </div>

            <div>
              <label htmlFor="issueDate" className={labelClasses}>
                Data de emissão
              </label>
              <input id="issueDate" name="issueDate" type="date" defaultValue={initialValues?.issueDate ?? ""} className={fieldClasses} />
            </div>

            <div>
              <label htmlFor="dueDate" className={labelClasses}>
                Vencimento *
              </label>
              <input id="dueDate" name="dueDate" type="date" required defaultValue={initialValues?.dueDate} className={fieldClasses} />
            </div>

            <div>
              <label htmlFor="originalAmount" className={labelClasses}>
                Valor original (R$) *
              </label>
              <input
                id="originalAmount"
                name="originalAmount"
                type="text"
                inputMode="decimal"
                required
                defaultValue={initialValues?.originalAmount}
                className={fieldClasses}
                placeholder="0,00"
              />
            </div>

            <div>
              <label htmlFor="paymentMethod" className={labelClasses}>
                Forma de pagamento
              </label>
              <select id="paymentMethod" name="paymentMethod" defaultValue={initialValues?.paymentMethod ?? "desconhecido"} className={fieldClasses}>
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
              <label htmlFor="documentNumber" className={labelClasses}>
                Número do documento
              </label>
              <input id="documentNumber" name="documentNumber" type="text" defaultValue={initialValues?.documentNumber ?? ""} className={fieldClasses} />
            </div>

            {mode === "create" ? (
              <div>
                <label htmlFor="installmentTotal" className={labelClasses}>
                  Número de parcelas
                </label>
                <input id="installmentTotal" name="installmentTotal" type="number" min={1} max={60} defaultValue={1} className={fieldClasses} />
                <p className="mt-1 text-xs text-foreground-subtle">Acima de 1, gera parcelas vinculadas com vencimento mensal.</p>
              </div>
            ) : null}
          </div>

          <div>
            <label htmlFor="notes" className={labelClasses}>
              Observações
            </label>
            <textarea id="notes" name="notes" rows={3} defaultValue={initialValues?.notes ?? ""} className={`${fieldClasses} h-auto py-2`} />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground-muted">
            <input type="checkbox" name="pendingData" defaultChecked={initialValues?.pendingData} />
            Cadastro com dados pendentes (ex.: credor ainda não confirmado) — nunca inventar a informação faltante.
          </label>

          {state.error ? (
            <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{state.error}</p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : mode === "create" ? "Cadastrar" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
