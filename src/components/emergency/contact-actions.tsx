import { Globe, Mail, MessageCircle, Phone } from "lucide-react";
import { buildContactActions, type ContactAction } from "@/lib/emergency/contact-links";
import { cn } from "@/lib/utils/cn";
import type { EmergencyContact } from "@/lib/emergency/types";

const ICONS: Record<ContactAction["kind"], typeof Phone> = {
  ligar: Phone,
  ligar_alternativo: Phone,
  whatsapp: MessageCircle,
  site: Globe,
  email: Mail,
};

/**
 * Botões de ação de um contato — só os que têm dado válido (`buildContactActions`). Alvo de toque
 * de 48px (`h-12`), nunca depende de hover. "Ligar" é sempre o primeiro e o único em destaque.
 */
export function ContactActions({ contact, emphasize = false }: { contact: Pick<EmergencyContact, "phone" | "phoneAlt" | "whatsapp" | "website" | "email" | "name">; emphasize?: boolean }) {
  const actions = buildContactActions(contact);
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = ICONS[action.kind];
        const primary = action.kind === "ligar";
        const external = action.kind === "site" || action.kind === "whatsapp";
        return (
          <a
            key={action.kind}
            href={action.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            aria-label={`${action.label} — ${contact.name}`}
            className={cn(
              "inline-flex h-12 min-w-[7rem] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-transform active:scale-[0.98]",
              primary && emphasize && "border-red-700 bg-red-700 text-white",
              primary && !emphasize && "border-accent bg-accent text-accent-foreground",
              !primary && "border-border bg-background-elevated text-foreground",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {action.label}
          </a>
        );
      })}
    </div>
  );
}
