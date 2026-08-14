"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createContractAction, type FormActionState } from "@/app/financeiro/contratos/actions";
import type { Partner } from "@/lib/finance/types";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "text-xs font-medium text-foreground-muted";

const initialState: FormActionState = { error: null };

export function ContractForm({ partners }: { partners: Partner[] }) {
  const [state, formAction, isPending] = useActionState(createContractAction, initialState);
  const [partnerMode, setPartnerMode] = useState<"existente" | "novo">(partners.length > 0 ? "existente" : "novo");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo contrato (mensalista / parceria)</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <form action={formAction} className="space-y-4">
          <div>
            <label className={labelClasses}>Parceiro *</label>
            <div className="mt-1 flex gap-4 text-sm text-foreground-muted">
              <label className="flex items-center gap-1">
                <input type="radio" name="partnerMode" checked={partnerMode === "existente"} onChange={() => setPartnerMode("existente")} disabled={partners.length === 0} />
                Parceiro já cadastrado
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="partnerMode" checked={partnerMode === "novo"} onChange={() => setPartnerMode("novo")} />
                Novo parceiro
              </label>
            </div>
          </div>

          {partnerMode === "existente" ? (
            <div>
              <label htmlFor="partnerId" className={labelClasses}>
                Selecione o parceiro
              </label>
              <select id="partnerId" name="partnerId" required className={fieldClasses}>
                <option value="" disabled>
                  Selecione
                </option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="newPartnerName" className={labelClasses}>
                  Nome do novo parceiro *
                </label>
                <input id="newPartnerName" name="newPartnerName" type="text" required={partnerMode === "novo"} className={fieldClasses} placeholder="Ex.: Don Juan" />
              </div>
              <div>
                <label htmlFor="newPartnerType" className={labelClasses}>
                  Tipo de parceiro
                </label>
                <select id="newPartnerType" name="newPartnerType" defaultValue="contrato_mensal" className={fieldClasses}>
                  <option value="contrato_mensal">Contrato mensal</option>
                  <option value="parceria_pos_paga">Parceria pós-paga</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="title" className={labelClasses}>
                Título do contrato *
              </label>
              <input id="title" name="title" type="text" required className={fieldClasses} placeholder="Ex.: Mensalidade Don Juan" />
            </div>

            <div>
              <label htmlFor="type" className={labelClasses}>
                Tipo *
              </label>
              <select id="type" name="type" required defaultValue="mensalidade" className={fieldClasses}>
                <option value="mensalidade">Mensalidade</option>
                <option value="parceria_pos_paga">Parceria pós-paga</option>
              </select>
            </div>

            <div>
              <label htmlFor="status" className={labelClasses}>
                Situação
              </label>
              <select id="status" name="status" defaultValue="ativo" className={fieldClasses}>
                <option value="ativo">Ativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="encerrado">Encerrado</option>
              </select>
            </div>

            <div>
              <label htmlFor="baseValue" className={labelClasses}>
                Valor fixo (R$)
              </label>
              <input id="baseValue" name="baseValue" type="text" inputMode="decimal" className={fieldClasses} placeholder="Deixe em branco se variável" />
            </div>

            <div>
              <label htmlFor="startDate" className={labelClasses}>
                Início de vigência
              </label>
              <input id="startDate" name="startDate" type="date" className={fieldClasses} />
            </div>

            <div>
              <label htmlFor="dueDay" className={labelClasses}>
                Dia de vencimento
              </label>
              <input id="dueDay" name="dueDay" type="number" min={1} max={31} className={fieldClasses} />
            </div>

            <div>
              <label htmlFor="billingClosingDay" className={labelClasses}>
                Dia de fechamento (parceria pós-paga)
              </label>
              <input id="billingClosingDay" name="billingClosingDay" type="number" min={1} max={31} className={fieldClasses} />
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle p-3">
            <p className="text-xs font-medium text-foreground-muted">Benefício (opcional)</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input name="benefitDescription" type="text" placeholder="Ex.: Lavação completa" className={fieldClasses} />
              <input name="benefitQuantity" type="number" min={1} placeholder="Qtd./período" className={fieldClasses} />
              <select name="benefitPeriodType" defaultValue="mensal" className={fieldClasses}>
                <option value="mensal">Mensal</option>
                <option value="semanal">Semanal</option>
              </select>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-foreground-muted">
              <input type="checkbox" name="benefitCumulative" />
              Benefício acumula se não usado no período
            </label>
          </div>

          <div>
            <label htmlFor="notes" className={labelClasses}>
              Observações
            </label>
            <textarea id="notes" name="notes" rows={2} className={`${fieldClasses} h-auto py-2`} />
          </div>

          {state.error ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{state.error}</p> : null}

          <Button type="submit" disabled={isPending}>
            {isPending ? "Cadastrando..." : "Cadastrar contrato"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
