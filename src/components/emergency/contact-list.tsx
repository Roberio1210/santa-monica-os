import { ContactActions } from "@/components/emergency/contact-actions";
import { buildContactActions } from "@/lib/emergency/contact-links";
import { EMERGENCY_CONTACT_CATEGORIES, EMERGENCY_CONTACT_CATEGORY_LABELS, isEmergencyContactCategory, type EmergencyContact } from "@/lib/emergency/types";

function groupByCategory(contacts: EmergencyContact[]): { category: string; label: string; contacts: EmergencyContact[] }[] {
  const groups = new Map<string, EmergencyContact[]>();
  for (const contact of contacts) {
    const category = isEmergencyContactCategory(contact.category) ? contact.category : "outro";
    groups.set(category, [...(groups.get(category) ?? []), contact]);
  }
  return EMERGENCY_CONTACT_CATEGORIES.filter((c) => groups.has(c)).map((c) => ({ category: c, label: EMERGENCY_CONTACT_CATEGORY_LABELS[c], contacts: groups.get(c)! }));
}

/**
 * Demais contatos (os de destaque do topo não se repetem aqui), agrupados por categoria na ordem
 * configurada. Só contato com pelo menos uma ação válida vira card; os que ainda não têm nenhum
 * dado de contato confirmado ficam recolhidos numa única linha "Contatos a cadastrar" — nunca
 * botão vazio, nunca link quebrado, sem poluir a Central.
 */
export function ContactList({ contacts }: { contacts: EmergencyContact[] }) {
  const reachable = contacts.filter((c) => buildContactActions(c).length > 0);
  const pending = contacts.filter((c) => buildContactActions(c).length === 0);

  return (
    <section aria-labelledby="emergencia-contatos" className="space-y-4">
      <h2 id="emergencia-contatos" className="text-lg font-semibold text-foreground">
        Outros contatos
      </h2>
      {reachable.length === 0 && pending.length === 0 ? <p className="text-sm text-foreground-muted">Nenhum outro contato ativo cadastrado.</p> : null}
      {groupByCategory(reachable).map((group) => (
        <div key={group.category} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{group.label}</h3>
          <ul className="space-y-2">
            {group.contacts.map((contact) => (
              <li key={contact.id} className="rounded-xl border border-border bg-background-panel p-4">
                <p className="text-base font-semibold text-foreground wrap-break-word">{contact.name}</p>
                {contact.phone ? <p className="text-sm tabular-nums text-foreground-muted">{contact.phone}</p> : null}
                {contact.phoneAlt ? <p className="text-sm tabular-nums text-foreground-muted">{contact.phoneAlt} (alternativo)</p> : null}
                {contact.notes ? <p className="mt-1 text-xs text-foreground-subtle wrap-break-word">{contact.notes}</p> : null}
                <div className="mt-3">
                  <ContactActions contact={contact} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {pending.length > 0 ? (
        <details className="rounded-xl border border-border-subtle bg-background-panel p-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-foreground-muted">Contatos a cadastrar ({pending.length})</summary>
          <p className="mt-2 text-sm text-foreground-subtle wrap-break-word">{pending.map((c) => c.name).join(" · ")}</p>
          <p className="mt-2 text-xs text-foreground-subtle">Telefones ainda não confirmados — o administrador cadastra em Configurações.</p>
        </details>
      ) : null}
    </section>
  );
}
