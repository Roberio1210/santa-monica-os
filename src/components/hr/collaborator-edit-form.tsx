"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { updateEmployeeAction, updateContractorAction, toggleCollaboratorActiveAction, type FormActionState } from "@/app/departamento-pessoal/actions";
import type { CollaboratorProfile } from "@/lib/hr/service";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "mb-1 block text-xs text-foreground-subtle";

const initialFormState: FormActionState = { error: null, success: null };

/**
 * Fase 3 do Departamento Pessoal (20/09/2026) — mesmo padrão de `ItemDetailsForm`
 * (`src/components/inventory/item-details-form.tsx`): formulário fechado por padrão, botão
 * "Editar cadastro" abre; ativar/desativar é uma action própria, separada da edição de campos.
 * A segurança de verdade está nas server actions (`requireAdmin`, fail-closed) — este componente
 * nunca decide sozinho quem pode editar, só evita mostrar o formulário à toa quando o servidor
 * vai recusar de qualquer forma.
 */
export function CollaboratorEditForm({ profile, canEdit }: { profile: CollaboratorProfile; canEdit: boolean }) {
  const updateAction = profile.type === "employee" ? updateEmployeeAction : updateContractorAction;
  const [formState, formAction, isPending] = useActionState(updateAction, initialFormState);
  const [toggleState, toggleAction, isTogglePending] = useActionState(toggleCollaboratorActiveAction, initialFormState);
  const [open, setOpen] = useState(false);

  if (!canEdit) return null;

  const expectedUpdatedAt = profile.updatedAt.toISOString();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {!open ? (
          <Button variant="outline" onClick={() => setOpen(true)}>
            Editar cadastro
          </Button>
        ) : null}
        <form action={toggleAction}>
          <input type="hidden" name="id" value={profile.id} />
          <input type="hidden" name="type" value={profile.type} />
          <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
          <input type="hidden" name="active" value={profile.active ? "false" : "true"} />
          <Button type="submit" variant="outline" disabled={isTogglePending}>
            {isTogglePending ? "Salvando..." : profile.active ? "Marcar como inativo" : "Reativar"}
          </Button>
        </form>
        {toggleState.success ? <p className="text-sm text-positive">{toggleState.success}</p> : null}
        {toggleState.error ? <p className="text-sm text-critical">{toggleState.error}</p> : null}
      </div>

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle>Editar cadastro</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form action={formAction} className="space-y-5">
              <input type="hidden" name="id" value={profile.id} />
              <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />

              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Dados pessoais</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClasses} htmlFor="cef-name">
                      {profile.type === "employee" ? "Nome completo" : "Nome/razão social"}
                    </label>
                    <input id="cef-name" name={profile.type === "employee" ? "fullName" : "businessName"} type="text" required defaultValue={profile.name} className={cn(fieldClasses, "w-full")} />
                  </div>
                  {profile.type === "contractor" ? (
                    <>
                      <div>
                        <label className={labelClasses} htmlFor="cef-taxid">
                          CPF/CNPJ
                        </label>
                        <input id="cef-taxid" name="taxId" type="text" defaultValue={profile.taxId ?? ""} className={cn(fieldClasses, "w-full")} />
                      </div>
                      <div>
                        <label className={labelClasses} htmlFor="cef-phone">
                          Telefone
                        </label>
                        <input id="cef-phone" name="contactPhone" type="text" defaultValue={profile.contactPhone ?? ""} className={cn(fieldClasses, "w-full")} />
                      </div>
                      <div>
                        <label className={labelClasses} htmlFor="cef-type">
                          Tipo
                        </label>
                        <select id="cef-type" name="type" defaultValue={profile.contractorType ?? "pessoa_fisica"} className={cn(fieldClasses, "w-full")}>
                          <option value="pessoa_fisica">Pessoa física</option>
                          <option value="pessoa_juridica">Pessoa jurídica</option>
                        </select>
                      </div>
                    </>
                  ) : null}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Dados contratuais</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClasses} htmlFor="cef-role">
                      {profile.type === "employee" ? "Função" : "Escopo do serviço"}
                    </label>
                    <input id="cef-role" name={profile.type === "employee" ? "role" : "scope"} type="text" required={profile.type === "employee"} defaultValue={profile.role ?? ""} className={cn(fieldClasses, "w-full")} />
                  </div>
                  <div>
                    <label className={labelClasses} htmlFor="cef-admission">
                      {profile.type === "employee" ? "Data de admissão" : "Início do contrato"}
                    </label>
                    <input id="cef-admission" name={profile.type === "employee" ? "admissionDate" : "contractStart"} type="date" defaultValue={profile.admissionOrStart ?? ""} className={cn(fieldClasses, "w-full")} />
                  </div>
                  {profile.type === "employee" ? (
                    <div>
                      <label className={labelClasses} htmlFor="cef-schedule">
                        Jornada
                      </label>
                      <input id="cef-schedule" name="workSchedule" type="text" defaultValue={profile.workSchedule ?? ""} className={cn(fieldClasses, "w-full")} />
                    </div>
                  ) : (
                    <div>
                      <label className={labelClasses} htmlFor="cef-contract-end">
                        Fim do contrato
                      </label>
                      <input id="cef-contract-end" name="contractEnd" type="date" defaultValue={profile.contractEnd ?? ""} className={cn(fieldClasses, "w-full")} />
                    </div>
                  )}
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Remuneração</legend>
                <p className="text-xs text-foreground-subtle">
                  Valor contratual cadastrado — nunca gera pagamento, comissão, benefício ou lançamento financeiro automaticamente. Serve só de referência.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClasses} htmlFor="cef-value">
                      {profile.type === "employee" ? "Salário base" : "Valor mensal combinado"}
                    </label>
                    <input id="cef-value" name={profile.type === "employee" ? "baseSalary" : "agreedValue"} type="number" step="0.01" min="0" defaultValue={profile.agreedValueOrBaseSalary ?? ""} className={cn(fieldClasses, "w-full")} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Observações</legend>
                <textarea name="notes" defaultValue={profile.notes ?? ""} rows={3} className={cn(fieldClasses, "h-auto w-full py-2")} />
              </fieldset>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Salvando..." : "Salvar cadastro"}
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
