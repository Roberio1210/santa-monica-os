/**
 * Módulo Emergência — conversão dos campos de contato em links de ação (`tel:`, WhatsApp, site,
 * e-mail). Regra: dado ausente ou inválido devolve `null`, e a tela simplesmente não renderiza o
 * botão — nunca um link quebrado.
 */

/** `tel:` a partir de qualquer formatação ("0800 31 86546", "(48) 3333-0000", "190"). Exige ao menos 3 dígitos (números de emergência curtos). */
export function toTelHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 15) return null;
  const international = trimmed.startsWith("+");
  return `tel:${international ? "+" : ""}${digits}`;
}

/**
 * Link `wa.me` — exige número de celular/fixo completo com DDD. Números brasileiros sem DDI (10 ou
 * 11 dígitos) recebem o 55; números curtos (ex.: 190) ou 0800 nunca viram WhatsApp.
 */
export function toWhatsappHref(whatsapp: string | null | undefined): string | null {
  if (!whatsapp) return null;
  const digits = whatsapp.replace(/\D/g, "");
  if (digits.startsWith("0")) return null;
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (full.length < 12 || full.length > 15) return null;
  return `https://wa.me/${full}`;
}

/** Site — aceita com ou sem esquema; só http/https com domínio que contenha ponto. */
export function toWebsiteHref(website: string | null | undefined): string | null {
  if (!website) return null;
  const trimmed = website.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function toMailtoHref(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return `mailto:${trimmed}`;
}

export interface ContactAction {
  kind: "ligar" | "ligar_alternativo" | "whatsapp" | "site" | "email";
  label: string;
  href: string;
}

/** Ações disponíveis de um contato, na ordem de importância (ligar primeiro). Só ações com dado válido. */
export function buildContactActions(contact: { phone: string | null; phoneAlt: string | null; whatsapp: string | null; website: string | null; email: string | null }): ContactAction[] {
  const actions: ContactAction[] = [];
  const tel = toTelHref(contact.phone);
  if (tel) actions.push({ kind: "ligar", label: "Ligar", href: tel });
  const telAlt = toTelHref(contact.phoneAlt);
  if (telAlt && telAlt !== tel) actions.push({ kind: "ligar_alternativo", label: "Ligar (alternativo)", href: telAlt });
  const wa = toWhatsappHref(contact.whatsapp);
  if (wa) actions.push({ kind: "whatsapp", label: "WhatsApp", href: wa });
  const site = toWebsiteHref(contact.website);
  if (site) actions.push({ kind: "site", label: "Site", href: site });
  const mail = toMailtoHref(contact.email);
  if (mail) actions.push({ kind: "email", label: "E-mail", href: mail });
  return actions;
}
