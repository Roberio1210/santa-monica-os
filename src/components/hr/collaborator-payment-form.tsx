"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { registerEmployeePaymentAction, type FormActionState } from "@/app/departamento-pessoal/actions";
import { CATEGORY_LABELS, RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES } from "@/lib/hr/costSummary";
import type { CollaboratorProfile } from "@/lib/hr/service";
import type { FinancialAccountOption } from "@/lib/hr/repository";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "mb-1 block text-xs text-foreground-subtle";

const initialFormState: FormActionState = { error: null, success: null };

/**
 * Fase 4 (20/09/2026) — "Registrar pagamento". O colaborador nunca é escolhido aqui: `subjectId`/
 * `subjectType` vêm ocultos, fixados pela ficha que renderizou este componente — não existe
 * seletor de colaborador no formulário, então não há como trocar silenciosamente quem recebe.
 * Sem idempotency key no cliente — ela é calculada no SERVIDOR (`actions.ts`), determinística a
 * partir dos valores enviados, então o `disabled={isPending}` abaixo é só a proteção de UX; a
 * garantia real contra duplo clique/refresh/retry está no `UNIQUE` do banco.
 */
export function CollaboratorPaymentForm({ profile, financialAccounts, canEdit }: { profile: CollaboratorProfile; financialAccounts: FinancialAccountOption[]; canEdit: boolean }) {
  const [formState, formAction, isPending] = useActionState(registerEmployeePaymentAction, initialFormState);
  const [open, setOpen] = useState(false);

  if (!canEdit) return null;

  return (
    <div className="space-y-3">
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Registrar pagamento
        </Button>
      ) : null}

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle>Registrar pagamento — {profile.name}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="subjectId" value={profile.id} />
              <input type="hidden" name="subjectType" value={profile.type} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClasses} htmlFor="cpf-category">
                    Categoria
                  </label>
                  <select id="cpf-category" name="category" required defaultValue="" className={cn(fieldClasses, "w-full")}>
                    <option value="" disabled>
                      Selecione...
                    </option>
                    {RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-foreground-subtle">Adiantamento tem uma ação própria — não fica nesta lista.</p>
                </div>
                <div>
                  <label className={labelClasses} htmlFor="cpf-amount">
                    Valor (R$)
                  </label>
                  <input id="cpf-amount" name="amount" type="number" step="0.01" min="0.01" required className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="cpf-date">
                    Data do pagamento
                  </label>
                  <input id="cpf-date" name="date" type="date" required className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="cpf-competence">
                    Competência (opcional)
                  </label>
                  <input id="cpf-competence" name="competenceDate" type="date" className={cn(fieldClasses, "w-full")} />
                  <p className="mt-1 text-xs text-foreground-subtle">Deixe em branco se a competência for a mesma data do pagamento. Nunca deduzida automaticamente.</p>
                </div>
                <div>
                  <label className={labelClasses} htmlFor="cpf-account">
                    Origem/conta do pagamento
                  </label>
                  <select id="cpf-account" name="financialAccountId" required defaultValue="" className={cn(fieldClasses, "w-full")}>
                    <option value="" disabled>
                      Selecione...
                    </option>
                    {financialAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClasses} htmlFor="cpf-description">
                  Descrição
                </label>
                <input id="cpf-description" name="description" type="text" required className={cn(fieldClasses, "w-full")} />
              </div>

              <div>
                <label className={labelClasses} htmlFor="cpf-notes">
                  Observações (opcional)
                </label>
                <textarea id="cpf-notes" name="notes" rows={3} className={cn(fieldClasses, "h-auto w-full py-2")} />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Registrando..." : "Registrar pagamento"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                {formState.success ? <p className="text-sm text-positive">{formState.success}</p> : null}
                {formState.error ? <p className="text-sm text-critical">{formState.error}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
