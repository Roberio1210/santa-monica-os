import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { BankStatementGroupRow } from "@/components/finance/bank-statement-group-row";
import type { ClassifiedGroup } from "@/lib/finance/bankStatement/classificationService";
import type { ConfidenceTier } from "@/lib/finance/bankStatement/evidence";
import type { FinancialAccountBalance, FinancialCategory, Supplier } from "@/lib/finance/types";

const TIER_LABELS: Record<ConfidenceTier, string> = {
  exact: "Exato",
  high_confidence: "Alta confiança",
  review: "Revisão",
  insufficient: "Insuficiente",
  conflict: "Conflito",
};

function FilterLink({ label, active, tier }: { label: string; active: boolean; tier?: ConfidenceTier }) {
  const href = tier ? `?confianca=${tier}#grupos` : "#grupos";
  return (
    <Link href={href} className={`rounded-full border px-3 py-1 text-xs ${active ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground-subtle hover:text-foreground"}`}>
      {label}
    </Link>
  );
}

/**
 * Missão Financeiro V2.2 (Fase Q/R) — fila inteligente de classificação: grupos ordenados por
 * quantidade/impacto, nunca 1008 linhas abertas uma a uma. Ordenação: Fase R (quantidade, depois
 * valor total — já garantida por `groupBankStatementLines`/`buildDryRunClassificationReport`).
 */
export function BankStatementGroupReview({
  classifiedGroups,
  financialAccountId,
  financialAccounts,
  suppliers,
  categories,
  confidenceFilter,
}: {
  classifiedGroups: ClassifiedGroup[];
  financialAccountId: string;
  financialAccounts: FinancialAccountBalance[];
  suppliers: Supplier[];
  categories: FinancialCategory[];
  confidenceFilter?: ConfidenceTier;
}) {
  const filtered = confidenceFilter ? classifiedGroups.filter((c) => c.evidence.confidence === confidenceFilter) : classifiedGroups;
  const counts = classifiedGroups.reduce(
    (acc, c) => {
      acc[c.evidence.confidence] = (acc[c.evidence.confidence] ?? 0) + 1;
      return acc;
    },
    {} as Record<ConfidenceTier, number>,
  );

  return (
    <Card id="grupos">
      <CardHeader>
        <CardTitle>Grupos sugeridos — fila inteligente de classificação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-xs text-foreground-subtle">
          {classifiedGroups.length} grupo(s) encontrados a partir de {classifiedGroups.reduce((s, c) => s + c.group.count, 0)} lançamento(s) pendentes — agrupados por contraparte, direção e tipo.
          Nenhuma classificação é aplicada sem confirmação explícita (exceto quando corresponde a uma regra já ensinada).
        </p>

        <div className="flex flex-wrap gap-2">
          <FilterLink label="Todos" active={!confidenceFilter} />
          {(Object.keys(TIER_LABELS) as ConfidenceTier[]).map((tier) => (
            <FilterLink key={tier} label={`${TIER_LABELS[tier]} (${counts[tier] ?? 0})`} active={confidenceFilter === tier} tier={tier} />
          ))}
        </div>

        {filtered.length === 0 ? (
          <Unavailable label="Nenhum grupo pendente neste filtro." />
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, 50).map((classified) => (
              <BankStatementGroupRow
                key={classified.group.groupKey}
                classified={classified}
                financialAccountId={financialAccountId}
                financialAccounts={financialAccounts}
                suppliers={suppliers}
                categories={categories}
              />
            ))}
          </div>
        )}
        {filtered.length > 50 ? <p className="text-xs text-foreground-subtle">Mostrando os 50 maiores grupos deste filtro — os demais aparecem conforme os primeiros forem resolvidos.</p> : null}
      </CardContent>
    </Card>
  );
}
