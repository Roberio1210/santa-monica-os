import { BreakableText } from "@/components/emergency/breakable-text";
import { formatCurrency } from "@/lib/utils/format";
import type { InsuranceCoverage } from "@/lib/emergency/insurance";

/** Uma cobertura do resumo da apólice: LMI, participação e condições — só o que a apólice informa, nada calculado. */
export function CoverageItem({ coverage }: { coverage: InsuranceCoverage }) {
  return (
    <li className="min-w-0 rounded-xl border border-border bg-background-panel p-3">
      <p className="text-sm font-semibold text-foreground wrap-break-word">
        <BreakableText text={coverage.name} />
      </p>
      <dl className="mt-1 space-y-0.5 text-sm text-foreground-muted">
        <div>
          <dt className="inline">LMI:</dt>
          <dd className="ml-1 inline font-medium tabular-nums text-foreground">{formatCurrency(coverage.lmi)}</dd>
        </div>
        {coverage.participation ? (
          <div>
            <dt className="inline">Participação:</dt>
            <dd className="ml-1 inline">
              {coverage.participation.percent}% dos prejuízos, mínimo {formatCurrency(coverage.participation.minimum)}
            </dd>
          </div>
        ) : null}
        {coverage.indemnityPeriodMonths !== null ? (
          <div>
            <dt className="inline">Período indenitário:</dt>
            <dd className="ml-1 inline">{coverage.indemnityPeriodMonths} meses</dd>
          </div>
        ) : null}
        {coverage.condition ? (
          <div>
            <dt className="inline">Condição indicada:</dt>
            <dd className="ml-1 inline">{coverage.condition}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}
