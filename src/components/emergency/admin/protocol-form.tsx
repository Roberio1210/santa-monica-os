"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateProtocolAction, type FormActionState } from "@/app/configuracoes/emergencia/actions";
import { fieldClasses, labelClasses, textareaClasses } from "@/components/emergency/admin/contact-form";
import { formatStepsText } from "@/lib/emergency/validation";
import { POTENTIAL_COVERAGE_LABEL, type InsuranceCoverage } from "@/lib/emergency/insurance";
import {
  EMERGENCY_PRIORITIES,
  EMERGENCY_PRIORITY_LABELS,
  EMERGENCY_PROTOCOL_CATEGORIES,
  EMERGENCY_PROTOCOL_CATEGORY_LABELS,
  type EmergencyContact,
  type EmergencyProtocol,
  type EmergencyProtocolStep,
} from "@/lib/emergency/types";

const initialState: FormActionState = { error: null, success: null };

/**
 * Edição de protocolo. Passos: um por linha, na ordem; linha iniciada com "!" é passo crítico
 * (destacado em vermelho na Central). A lista inteira é regravada e o estado anterior fica em
 * `audit_logs`.
 */
export function ProtocolForm({
  protocol,
  steps,
  contacts,
  coverages,
}: {
  protocol: EmergencyProtocol;
  steps: EmergencyProtocolStep[];
  contacts: EmergencyContact[];
  coverages: InsuranceCoverage[];
}) {
  const [state, formAction, isPending] = useActionState(updateProtocolAction, initialState);
  const prefix = `protocol-${protocol.id}`;
  const activeContacts = contacts.filter((c) => c.active);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={protocol.id} />
      <input type="hidden" name="expectedUpdatedAt" value={protocol.updatedAt.toISOString()} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClasses} htmlFor={`${prefix}-title`}>
            Título
          </label>
          <input id={`${prefix}-title`} name="title" required defaultValue={protocol.title} className={fieldClasses} />
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-category`}>
            Categoria
          </label>
          <select id={`${prefix}-category`} name="category" defaultValue={protocol.category} className={fieldClasses}>
            {EMERGENCY_PROTOCOL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EMERGENCY_PROTOCOL_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-priority`}>
            Prioridade
          </label>
          <select id={`${prefix}-priority`} name="priority" defaultValue={protocol.priority} className={fieldClasses}>
            {EMERGENCY_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {EMERGENCY_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-displayOrder`}>
            Ordem de exibição
          </label>
          <input id={`${prefix}-displayOrder`} name="displayOrder" type="number" min={0} step={1} defaultValue={protocol.displayOrder} className={fieldClasses} />
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-priorityContactId`}>
            Contato prioritário
          </label>
          <select id={`${prefix}-priorityContactId`} name="priorityContactId" defaultValue={protocol.priorityContactId ?? ""} className={fieldClasses}>
            <option value="">Nenhum</option>
            {activeContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClasses} htmlFor={`${prefix}-description`}>
            Descrição
          </label>
          <textarea id={`${prefix}-description`} name="description" required rows={2} defaultValue={protocol.description} className={textareaClasses} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClasses} htmlFor={`${prefix}-steps`}>
            Passos (um por linha, na ordem; comece a linha com &quot;!&quot; para marcar como crítico)
          </label>
          <textarea id={`${prefix}-steps`} name="steps" required rows={Math.max(6, steps.length + 1)} defaultValue={formatStepsText(steps)} className={textareaClasses} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClasses} htmlFor={`${prefix}-warning`}>
            Aviso destacado (opcional)
          </label>
          <textarea id={`${prefix}-warning`} name="warning" rows={2} defaultValue={protocol.warning ?? ""} className={textareaClasses} />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className={labelClasses}>{POTENTIAL_COVERAGE_LABEL} (exibida sempre com a ressalva do seguro)</legend>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {coverages.map((coverage) => (
              <label key={coverage.key} className="flex min-h-11 items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name="potentialCoverageKeys" value={coverage.key} defaultChecked={protocol.potentialCoverageKeys.includes(coverage.key)} className="h-4 w-4" />
                {coverage.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <label className={labelClasses} htmlFor={`${prefix}-notes`}>
            Observações
          </label>
          <textarea id={`${prefix}-notes`} name="notes" rows={2} defaultValue={protocol.notes ?? ""} className={textareaClasses} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending} className="h-11">
          {isPending ? "Salvando..." : "Salvar protocolo"}
        </Button>
        {state.success ? <p className="text-sm text-positive">{state.success}</p> : null}
        {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
      </div>
    </form>
  );
}
