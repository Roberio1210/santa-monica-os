"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FormActionState } from "@/app/financeiro/contas-a-receber/actions";
import type { AccountsReceivable, FinancialAccountBalance } from "@/lib/finance/types";

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

interface PartnerOption {
  id: string;
  name: string;
}

interface AccountsReceivableFormProps {
  mode: "create" | "edit";
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  partners: PartnerOption[];
  categories: CategoryOption[];
  costCenters: CostCenterOption[];
  financialAccounts: FinancialAccountBalance[];
  initialValues?: AccountsReceivable;
}

const initialState: FormActionState = { error: null };

export function AccountsReceivableForm({ mode, action, partners, categories, costCenters, financialAccounts, initialValues }: AccountsReceivableFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "Nova conta a receber" : "Editar conta a receber"}</CardTitle>
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
              placeholder="Ex.: Parceria IESA/Nissan — lavações de julho/2026"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="partnerId" className={labelClasses}>
                Cliente/Parceiro (opcional)
              </label>
              <select id="partnerId" name="partnerId" defaultValue={initialValues?.partnerId ?? ""} className={fieldClasses}>
                <option value="">Não informado</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="categoryId" className={labelClasses}>
                Categoria
              </label>
              <select id="categoryId" name="categoryId" defaultValue={initialValues?.categoryId ?? ""} className={fieldClasses}>
                <option value="">Não informado</option>
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
                Conta de recebimento
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
              <label htmlFor="expectedAmount" className={labelClasses}>
                Valor previsto (R$) *
              </label>
              <input
                id="expectedAmount"
                name="expectedAmount"
                type="text"
                inputMode="decimal"
                required
                defaultValue={initialValues?.expectedAmount}
                className={fieldClasses}
                placeholder="0,00"
              />
            </div>

            <div>
              <label htmlFor="invoiceNumber" className={labelClasses}>
                Número da nota fiscal
              </label>
              <input id="invoiceNumber" name="invoiceNumber" type="text" defaultValue={initialValues?.invoiceNumber ?? ""} className={fieldClasses} />
            </div>

            <div>
              <label htmlFor="responsibleName" className={labelClasses}>
                Responsável
              </label>
              <input id="responsibleName" name="responsibleName" type="text" defaultValue={initialValues?.responsibleName ?? ""} className={fieldClasses} placeholder="Quem lançou/acompanha" />
            </div>

            <div>
              <label htmlFor="approverName" className={labelClasses}>
                Aprovador
              </label>
              <input id="approverName" name="approverName" type="text" defaultValue={initialValues?.approverName ?? ""} className={fieldClasses} placeholder="Quem aprovou" />
            </div>

            {mode === "create" ? (
              <div>
                <label htmlFor="installmentTotal" className={labelClasses}>
                  Número de parcelas
                </label>
                <input id="installmentTotal" name="installmentTotal" type="number" min={1} max={60} defaultValue={1} className={fieldClasses} />
                <p className="mt-1 text-xs text-foreground-subtle">Acima de 1, gera parcelas vinculadas com vencimento mensal (ex.: 4x Stone).</p>
              </div>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground-muted">
            <input type="checkbox" name="invoiceIssued" defaultChecked={initialValues?.invoiceIssued} />
            Nota fiscal emitida
          </label>

          <div>
            <label htmlFor="notes" className={labelClasses}>
              Observações
            </label>
            <textarea id="notes" name="notes" rows={3} defaultValue={initialValues?.notes ?? ""} className={`${fieldClasses} h-auto py-2`} />
          </div>

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
