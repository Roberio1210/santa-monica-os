"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createContactAction, updateContactAction, type FormActionState } from "@/app/configuracoes/emergencia/actions";
import { EMERGENCY_CONTACT_CATEGORIES, EMERGENCY_CONTACT_CATEGORY_LABELS, EMERGENCY_PRIORITIES, EMERGENCY_PRIORITY_LABELS, type EmergencyContact } from "@/lib/emergency/types";

export const fieldClasses = "h-11 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
export const textareaClasses = "w-full rounded-lg border border-border bg-background-elevated px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
export const labelClasses = "mb-1 block text-xs text-foreground-subtle";

const initialState: FormActionState = { error: null, success: null };

/**
 * Formulário de contato (criação quando `contact` é omitido, edição caso contrário). A segurança
 * real está nas server actions (`requireAdmin`, fail-closed) — este componente só é renderizado
 * para admin, mas nunca decide permissão sozinho.
 */
export function ContactForm({ contact }: { contact?: EmergencyContact }) {
  const [state, formAction, isPending] = useActionState(contact ? updateContactAction : createContactAction, initialState);
  const prefix = contact ? `contact-${contact.id}` : "contact-new";

  return (
    <form action={formAction} className="space-y-3">
      {contact ? (
        <>
          <input type="hidden" name="id" value={contact.id} />
          <input type="hidden" name="expectedUpdatedAt" value={contact.updatedAt.toISOString()} />
        </>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClasses} htmlFor={`${prefix}-name`}>
            Nome
          </label>
          <input id={`${prefix}-name`} name="name" required defaultValue={contact?.name ?? ""} className={fieldClasses} />
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-category`}>
            Categoria
          </label>
          <select id={`${prefix}-category`} name="category" defaultValue={contact?.category ?? "outro"} className={fieldClasses}>
            {EMERGENCY_CONTACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EMERGENCY_CONTACT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-priority`}>
            Prioridade
          </label>
          <select id={`${prefix}-priority`} name="priority" defaultValue={contact?.priority ?? "normal"} className={fieldClasses}>
            {EMERGENCY_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {EMERGENCY_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-phone`}>
            Telefone
          </label>
          <input id={`${prefix}-phone`} name="phone" type="tel" inputMode="tel" defaultValue={contact?.phone ?? ""} className={fieldClasses} />
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-phoneAlt`}>
            Telefone alternativo
          </label>
          <input id={`${prefix}-phoneAlt`} name="phoneAlt" type="tel" inputMode="tel" defaultValue={contact?.phoneAlt ?? ""} className={fieldClasses} />
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-whatsapp`}>
            WhatsApp (com DDD)
          </label>
          <input id={`${prefix}-whatsapp`} name="whatsapp" type="tel" inputMode="tel" defaultValue={contact?.whatsapp ?? ""} className={fieldClasses} />
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-email`}>
            E-mail
          </label>
          <input id={`${prefix}-email`} name="email" type="email" defaultValue={contact?.email ?? ""} className={fieldClasses} />
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-website`}>
            Site
          </label>
          <input id={`${prefix}-website`} name="website" defaultValue={contact?.website ?? ""} className={fieldClasses} />
        </div>
        <div>
          <label className={labelClasses} htmlFor={`${prefix}-displayOrder`}>
            Ordem de exibição
          </label>
          <input id={`${prefix}-displayOrder`} name="displayOrder" type="number" min={0} step={1} defaultValue={contact?.displayOrder ?? 0} className={fieldClasses} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClasses} htmlFor={`${prefix}-notes`}>
            Observações
          </label>
          <textarea id={`${prefix}-notes`} name="notes" rows={2} defaultValue={contact?.notes ?? ""} className={textareaClasses} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending} className="h-11">
          {isPending ? "Salvando..." : contact ? "Salvar contato" : "Criar contato"}
        </Button>
        {state.success ? <p className="text-sm text-positive">{state.success}</p> : null}
        {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
      </div>
    </form>
  );
}
