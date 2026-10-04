import { Phone, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CoverageDisclaimer } from "@/components/emergency/coverage-disclaimer";
import { CoverageItem } from "@/components/emergency/coverage-item";
import { toTelHref } from "@/lib/emergency/contact-links";
import { computePolicyValidity, INSURANCE_COVERAGES, INSURANCE_POLICY, type PolicyValidity } from "@/lib/emergency/insurance";
import { formatDateBR } from "@/lib/utils/format";

const VALIDITY_BADGE: Record<PolicyValidity, { label: string; variant: "positive" | "warning" | "critical" }> = {
  vigente: { label: "Vigente", variant: "positive" },
  a_iniciar: { label: "Vigência ainda não iniciada", variant: "warning" },
  vencida: { label: "Vigência encerrada", variant: "critical" },
};

/** Seção "Seguro do estabelecimento" — resumo operacional da apólice com a ressalva obrigatória sempre visível, antes das coberturas. */
export function InsuranceSection({ todayIso }: { todayIso: string }) {
  const validity = VALIDITY_BADGE[computePolicyValidity(todayIso)];
  const assistanceHref = toTelHref(INSURANCE_POLICY.assistancePhone);

  return (
    <section aria-labelledby="emergencia-seguro" className="space-y-3">
      <h2 id="emergencia-seguro" className="text-lg font-semibold text-foreground">
        Seguro do estabelecimento
      </h2>

      <div className="rounded-2xl border border-border bg-background-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-foreground-muted" aria-hidden />
            <div>
              <p className="text-base font-semibold text-foreground">{INSURANCE_POLICY.insurer}</p>
              <p className="text-sm text-foreground-muted">Apólice {INSURANCE_POLICY.policyNumber}</p>
            </div>
          </div>
          <Badge variant={validity.variant}>{validity.label}</Badge>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-foreground-subtle">Vigência</dt>
            <dd className="text-foreground">
              {formatDateBR(INSURANCE_POLICY.startDate)} a {formatDateBR(INSURANCE_POLICY.endDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-subtle">Segurado</dt>
            <dd className="text-foreground wrap-break-word">{INSURANCE_POLICY.insuredName}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-subtle">Atividade</dt>
            <dd className="text-foreground">{INSURANCE_POLICY.declaredActivity}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-subtle">Bens</dt>
            <dd className="text-foreground">{INSURANCE_POLICY.coveredAssets}</dd>
          </div>
        </dl>

        {assistanceHref ? (
          <a
            href={assistanceHref}
            aria-label={`Ligar para a Assistência 24h ${INSURANCE_POLICY.insurer}`}
            className="mt-4 flex min-h-12 items-center gap-3 rounded-xl border border-accent bg-accent px-4 py-2 text-accent-foreground transition-transform active:scale-[0.98]"
          >
            <Phone className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 text-sm font-semibold">Assistência 24h</span>
            <span className="shrink-0 whitespace-nowrap text-base font-bold tabular-nums">{INSURANCE_POLICY.assistancePhone}</span>
          </a>
        ) : null}
      </div>

      <CoverageDisclaimer />

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">Coberturas contratadas (resumo)</h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {INSURANCE_COVERAGES.map((coverage) => (
            <CoverageItem key={coverage.key} coverage={coverage} />
          ))}
        </ul>
      </div>
    </section>
  );
}
