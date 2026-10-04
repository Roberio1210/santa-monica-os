import { Phone } from "lucide-react";
import { toTelHref } from "@/lib/emergency/contact-links";
import { cn } from "@/lib/utils/cn";
import type { EmergencyContact } from "@/lib/emergency/types";

function callable(contacts: EmergencyContact[]): { contact: EmergencyContact; href: string }[] {
  return contacts.map((c) => ({ contact: c, href: toTelHref(c.phone) })).filter((entry): entry is { contact: EmergencyContact; href: string } => entry.href !== null);
}

/**
 * Botão de ligação de acesso imediato — alvo de toque de 56px, número sempre visível e nunca
 * quebrado no meio (`whitespace-nowrap`); o nome quebra linha se precisar (`min-w-0`), nunca
 * empurra a largura da tela. `red-700` com texto branco = contraste AA (o `--critical` do tema
 * com branco ficaria ~3,8:1).
 */
function CallButton({ contact, href, variant }: { contact: EmergencyContact; href: string; variant: "public" | "other" }) {
  return (
    <a
      href={href}
      aria-label={`Ligar para ${contact.name} — ${contact.phone}`}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-2 transition-transform active:scale-[0.98]",
        variant === "public" ? "bg-red-700 text-white" : "border border-accent bg-accent text-accent-foreground",
      )}
    >
      <Phone className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium wrap-break-word">{contact.name}</span>
        {variant === "other" && contact.notes ? <span className="block text-xs opacity-80 wrap-break-word">{contact.notes}</span> : null}
      </span>
      <span className={cn("shrink-0 whitespace-nowrap font-bold tabular-nums", variant === "public" ? "text-xl" : "text-base")}>{contact.phone}</span>
    </a>
  );
}

/**
 * Destaque permanente: serviços públicos de emergência (vermelho) e, opcionalmente, os demais
 * contatos críticos com telefone (ex.: Tokio Marine — Assistência 24h), um botão grande por contato.
 */
export function PublicEmergencyBar({ contacts, otherCritical = [] }: { contacts: EmergencyContact[]; otherCritical?: EmergencyContact[] }) {
  const publicCalls = callable(contacts);
  const otherCalls = callable(otherCritical);

  return (
    <section aria-labelledby="emergencia-risco-vida" className="rounded-2xl border border-critical/40 bg-critical-bg p-4">
      <p id="emergencia-risco-vida" className="text-sm font-semibold text-critical">
        Em risco imediato à vida, priorize os serviços públicos de emergência.
      </p>
      {publicCalls.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {publicCalls.map(({ contact, href }) => (
            <CallButton key={contact.id} contact={contact} href={href} variant="public" />
          ))}
        </div>
      ) : null}
      {otherCalls.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {otherCalls.map(({ contact, href }) => (
            <CallButton key={contact.id} contact={contact} href={href} variant="other" />
          ))}
        </div>
      ) : null}
    </section>
  );
}
