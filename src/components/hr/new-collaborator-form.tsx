"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { createEmployeeAction, createContractorAction, type FormActionState } from "@/app/departamento-pessoal/actions";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "mb-1 block text-xs text-foreground-subtle";

const initialFormState: FormActionState = { error: null, success: null };

/**
 * Fase 5 do Departamento Pessoal (20/09/2026) — "Novo colaborador" em `/departamento-pessoal`
 * (listagem, não a ficha individual). Primeiro passo é sempre a escolha CLT/PJ — cada tipo mostra
 * SOMENTE os campos que a tabela correspondente (`employees`/`contractors`) realmente tem. Em
 * caso de sucesso, a própria server action redireciona para a ficha do novo colaborador — este
 * componente nunca navega sozinho.
 */
export function NewCollaboratorForm({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"employee" | "contractor" | null>(null);
  const [employeeState, employeeAction, employeePending] = useActionState(createEmployeeAction, initialFormState);
  const [contractorState, contractorAction, contractorPending] = useActionState(createContractorAction, initialFormState);

  if (!canEdit) return null;

  function closeAndReset() {
    setOpen(false);
    setType(null);
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Novo colaborador
        </Button>
      ) : null}

      {open && !type ? (
        <Card>
          <CardHeader>
            <CardTitle>Novo colaborador — qual o vínculo?</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3 pt-0">
            <Button type="button" onClick={() => setType("employee")}>
              CLT
            </Button>
            <Button type="button" onClick={() => setType("contractor")}>
              Prestador de serviço / PJ
            </Button>
            <Button type="button" variant="outline" onClick={closeAndReset}>
              Cancelar
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {open && type === "employee" ? (
        <Card>
          <CardHeader>
            <CardTitle>Novo colaborador — CLT</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form action={employeeAction} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClasses} htmlFor="ncf-emp-name">
                    Nome completo
                  </label>
                  <input id="ncf-emp-name" name="fullName" type="text" required className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-emp-role">
                    Função
                  </label>
                  <input id="ncf-emp-role" name="role" type="text" required className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-emp-admission">
                    Data de admissão (opcional)
                  </label>
                  <input id="ncf-emp-admission" name="admissionDate" type="date" className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-emp-schedule">
                    Jornada (opcional)
                  </label>
                  <input id="ncf-emp-schedule" name="workSchedule" type="text" className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-emp-salary">
                    Salário base (opcional)
                  </label>
                  <input id="ncf-emp-salary" name="baseSalary" type="number" step="0.01" min="0" className={cn(fieldClasses, "w-full")} />
                  <p className="mt-1 text-xs text-foreground-subtle">Só um valor de referência cadastral — nunca gera pagamento.</p>
                </div>
              </div>
              <div>
                <label className={labelClasses} htmlFor="ncf-emp-notes">
                  Observações (opcional)
                </label>
                <textarea id="ncf-emp-notes" name="notes" rows={3} className={cn(fieldClasses, "h-auto w-full py-2")} />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={employeePending}>
                  {employeePending ? "Cadastrando..." : "Cadastrar CLT"}
                </Button>
                <Button type="button" variant="outline" onClick={closeAndReset}>
                  Cancelar
                </Button>
                {employeeState.error ? <p className="text-sm text-critical">{employeeState.error}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {open && type === "contractor" ? (
        <Card>
          <CardHeader>
            <CardTitle>Novo colaborador — Prestador de serviço / PJ</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form action={contractorAction} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClasses} htmlFor="ncf-con-name">
                    Nome/razão social
                  </label>
                  <input id="ncf-con-name" name="businessName" type="text" required className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-con-type">
                    Tipo
                  </label>
                  <select id="ncf-con-type" name="type" required defaultValue="pessoa_fisica" className={cn(fieldClasses, "w-full")}>
                    <option value="pessoa_fisica">Pessoa física</option>
                    <option value="pessoa_juridica">Pessoa jurídica</option>
                  </select>
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-con-taxid">
                    CPF/CNPJ (opcional)
                  </label>
                  <input id="ncf-con-taxid" name="taxId" type="text" className={cn(fieldClasses, "w-full")} />
                  <p className="mt-1 text-xs text-foreground-subtle">Se já existir um prestador com o mesmo CPF/CNPJ, o cadastro é bloqueado.</p>
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-con-phone">
                    Telefone (opcional)
                  </label>
                  <input id="ncf-con-phone" name="contactPhone" type="text" className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-con-scope">
                    Escopo do serviço (opcional)
                  </label>
                  <input id="ncf-con-scope" name="scope" type="text" className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-con-start">
                    Início do contrato (opcional)
                  </label>
                  <input id="ncf-con-start" name="contractStart" type="date" className={cn(fieldClasses, "w-full")} />
                </div>
                <div>
                  <label className={labelClasses} htmlFor="ncf-con-value">
                    Valor mensal combinado (opcional)
                  </label>
                  <input id="ncf-con-value" name="agreedValue" type="number" step="0.01" min="0" className={cn(fieldClasses, "w-full")} />
                  <p className="mt-1 text-xs text-foreground-subtle">Só um valor de referência cadastral — nunca gera pagamento.</p>
                </div>
              </div>
              <div>
                <label className={labelClasses} htmlFor="ncf-con-notes">
                  Observações (opcional)
                </label>
                <textarea id="ncf-con-notes" name="notes" rows={3} className={cn(fieldClasses, "h-auto w-full py-2")} />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={contractorPending}>
                  {contractorPending ? "Cadastrando..." : "Cadastrar PJ"}
                </Button>
                <Button type="button" variant="outline" onClick={closeAndReset}>
                  Cancelar
                </Button>
                {contractorState.error ? <p className="text-sm text-critical">{contractorState.error}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
