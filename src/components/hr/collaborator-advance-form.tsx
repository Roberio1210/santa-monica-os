"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { registerEmployeeAdvanceAction, type FormActionState } from "@/app/departamento-pessoal/actions";
import type { CollaboratorProfile } from "@/lib/hr/service";
import type { FinancialAccountOption } from "@/lib/hr/repository";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "mb-1 block text-xs text-foreground-subtle";

const initialFormState: FormActionState = { error: null, success: null };

/**
 * Fase 6 (20/09/2026) — "Registrar adiantamento". Mesmo padrão de `CollaboratorPaymentForm`
 * (colaborador fixo/oculto, idempotência calculada no servidor), mas com o conjunto mínimo de
 * campos pedido pela missão: valor, data, observação, conta. Nunca tem seletor de categoria — um
 * adiantamento não é um pagamento categorizado, é sempre gravado em `employee_advances`.
 */
export function CollaboratorAdvanceForm({ profile, financialAccounts, canEdit }: { profile: CollaboratorProfile; financialAccounts: FinancialAccountOption[]; canEdit: boolean }) {
  const [formState, formAction, isPending] = useActionState(registerEmployeeAdvanceAction, initialFormState);
  const [open, setOpen] = useState(false);

  if (!canEdit) return null;

  return (
    <div className="space-y-3">
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Registrar adiantamento
        </Button>
      ) : null}

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle>Registrar adiantamento — {profile.name}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="subjectId" value={profile.id} />
              <input type="hidden" name="subjectType" value={profile.type} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClasses} htmlFor="adv-amount">
                    Valor (R$)
                  </label>
                  <input id="adv-amount" name="amount" type="number" step="0.01" min="0.01" required className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="adv-date">
                    Data do adiantamento
                  </label>
                  <input id="adv-date" name="date" type="date" required className={cn(fieldClasses, "w-full")} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClasses} htmlFor="adv-account">
                    Origem/conta do adiantamento
                  </label>
                  <select id="adv-account" name="financialAccountId" required defaultValue="" className={cn(fieldClasses, "w-full")}>
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
                <label className={labelClasses} htmlFor="adv-reason">
                  Observação (opcional)
                </label>
                <textarea id="adv-reason" name="reason" rows={3} className={cn(fieldClasses, "h-auto w-full py-2")} />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Registrando..." : "Registrar adiantamento"}
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
