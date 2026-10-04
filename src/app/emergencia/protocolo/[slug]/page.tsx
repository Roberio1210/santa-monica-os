import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BreakableText } from "@/components/emergency/breakable-text";
import { ContactActions } from "@/components/emergency/contact-actions";
import { CoverageDisclaimer } from "@/components/emergency/coverage-disclaimer";
import { CoverageItem } from "@/components/emergency/coverage-item";
import { DataModeNotice } from "@/components/emergency/data-mode-notice";
import { ProtocolIcon } from "@/components/emergency/protocol-icon";
import { PublicEmergencyBar } from "@/components/emergency/public-emergency-bar";
import { buildContactActions } from "@/lib/emergency/contact-links";
import { POTENTIAL_COVERAGE_LABEL } from "@/lib/emergency/insurance";
import { fetchEmergencyProtocol } from "@/lib/emergency/service";
import { EMERGENCY_PRIORITY_LABELS } from "@/lib/emergency/types";
import { cn } from "@/lib/utils/cn";

/**
 * Protocolo operacional de um tipo de emergência — conteúdo vindo do banco
 * (`emergency_protocols`/`emergency_protocol_steps`), nunca escrito neste componente. 3 consultas
 * por acesso (protocolo, passos, contatos), sem polling.
 */
export const dynamic = "force-dynamic";

export default async function EmergenciaProtocoloPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const view = await fetchEmergencyProtocol(slug);
  if (!view) notFound();

  const { mode, protocol, priorityContact, publicEmergencyContacts, potentialCoverages } = view;
  const critical = protocol.priority === "critica";
  const priorityContactCallable = priorityContact ? buildContactActions(priorityContact).length > 0 : false;

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 space-y-6 pb-8">
      <Link href="/emergencia" className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm text-foreground-muted active:text-foreground">
        <ChevronLeft className="h-5 w-5" />
        Central de Emergência
      </Link>

      <DataModeNotice mode={mode} />

      <header className="flex items-start gap-3">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", critical ? "bg-critical-bg text-critical" : "bg-background-elevated text-foreground-muted")}>
          <ProtocolIcon slug={protocol.slug} className="h-7 w-7" />
        </div>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground wrap-break-word">
            <BreakableText text={protocol.title} />
          </h1>
          <Badge variant={critical ? "critical" : protocol.priority === "alta" ? "warning" : "outline"}>Prioridade {EMERGENCY_PRIORITY_LABELS[protocol.priority].toLowerCase()}</Badge>
          <p className="text-sm text-foreground-muted">{protocol.description}</p>
        </div>
      </header>

      {/* Protocolo crítico: os serviços públicos sobem para logo abaixo do título (risco à vida vem primeiro). */}
      {critical ? <PublicEmergencyBar contacts={publicEmergencyContacts} /> : null}

      {priorityContact ? (
        <section aria-labelledby="protocolo-contato" className="space-y-2 rounded-2xl border border-border bg-background-panel p-4">
          <h2 id="protocolo-contato" className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Contato prioritário
          </h2>
          <p className="text-base font-semibold text-foreground wrap-break-word">
            {priorityContact.name}
            {priorityContactCallable && priorityContact.phone ? <span className="ml-2 whitespace-nowrap font-bold tabular-nums">{priorityContact.phone}</span> : null}
          </p>
          {priorityContactCallable ? (
            <ContactActions contact={priorityContact} emphasize={critical} />
          ) : (
            <p className="text-sm text-foreground-subtle">Telefone a cadastrar. Em risco à vida, use os serviços públicos de emergência.</p>
          )}
        </section>
      ) : null}

      {protocol.warning ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-critical/40 bg-critical-bg p-4 text-sm text-foreground">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-critical" aria-hidden />
          <p className="min-w-0 wrap-break-word">{protocol.warning}</p>
        </div>
      ) : null}

      <section aria-labelledby="protocolo-passos" className="space-y-3">
        <h2 id="protocolo-passos" className="text-lg font-semibold text-foreground">
          Passo a passo
        </h2>
        <ol className="space-y-2">
          {protocol.steps.map((step) => (
            <li
              key={step.id}
              className={cn("flex gap-3 rounded-xl border p-3 text-base", step.isCritical ? "border-critical/40 bg-critical-bg font-medium text-foreground" : "border-border bg-background-panel text-foreground")}
            >
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums", step.isCritical ? "bg-red-700 text-white" : "bg-background-elevated text-foreground-muted")}>
                {step.position}
              </span>
              <span className="min-w-0 wrap-break-word">{step.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {potentialCoverages.length > 0 ? (
        <section aria-labelledby="protocolo-cobertura" className="space-y-3">
          <h2 id="protocolo-cobertura" className="text-lg font-semibold text-foreground">
            {POTENTIAL_COVERAGE_LABEL}
          </h2>
          <CoverageDisclaimer />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {potentialCoverages.map((coverage) => (
              <CoverageItem key={coverage.key} coverage={coverage} />
            ))}
          </ul>
        </section>
      ) : null}

      {protocol.notes ? (
        <section aria-labelledby="protocolo-observacoes" className="space-y-1">
          <h2 id="protocolo-observacoes" className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Observações
          </h2>
          <p className="whitespace-pre-line text-sm text-foreground-muted">{protocol.notes}</p>
        </section>
      ) : null}

      {!critical ? <PublicEmergencyBar contacts={publicEmergencyContacts} /> : null}
    </div>
  );
}
