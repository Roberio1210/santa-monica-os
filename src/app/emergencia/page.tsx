import { ContactList } from "@/components/emergency/contact-list";
import { DataModeNotice } from "@/components/emergency/data-mode-notice";
import { InsuranceSection } from "@/components/emergency/insurance-section";
import { ProtocolGrid } from "@/components/emergency/protocol-grid";
import { PublicEmergencyBar } from "@/components/emergency/public-emergency-bar";
import { fetchEmergencyCentral, selectHighlightedContacts } from "@/lib/emergency/service";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Central de Emergência — Fase 1 (04/10/2026): contatos, protocolos ("O que aconteceu?") e
 * resumo do seguro. Mobile-first, dentro do layout atual (AppShell). Sem polling nem atualização
 * automática: os dados são lidos uma vez por acesso (2 consultas, ver `service.ts`). Registro de
 * ocorrências, anexos, JumpPark, Zézinho e alertas ficam para as próximas fases
 * (docs/emergency-module.md).
 */
export const dynamic = "force-dynamic";

export default async function EmergenciaPage() {
  const { mode, contacts, protocols } = await fetchEmergencyCentral();
  const { publicServices, otherCritical } = selectHighlightedContacts(contacts);
  const highlightedIds = new Set([...publicServices, ...otherCritical].map((c) => c.id));

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 space-y-8 pb-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">EMERGÊNCIA</h1>
        <p className="mt-1 text-sm text-foreground-muted">Central de apoio e procedimentos da Santa Mônica</p>
      </header>

      <DataModeNotice mode={mode} />

      <PublicEmergencyBar contacts={publicServices} otherCritical={otherCritical} />

      <ProtocolGrid protocols={protocols} />

      <ContactList contacts={contacts.filter((c) => !highlightedIds.has(c.id))} />

      <InsuranceSection todayIso={saoPauloDateISO()} />
    </div>
  );
}
