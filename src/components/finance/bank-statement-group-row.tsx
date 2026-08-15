"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmGroupAction, rejectGroupAction, type FormActionState } from "@/app/financeiro/conta-stone/actions";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import type { BankStatementLineType } from "@/lib/finance/bankStatement/types";
import type { ClassifiedGroup } from "@/lib/finance/bankStatement/classificationService";
import type { ConfidenceTier } from "@/lib/finance/bankStatement/evidence";
import type { FinancialAccountBalance, FinancialCategory, Supplier } from "@/lib/finance/types";

const fieldClasses = "h-8 rounded-lg border border-border bg-background-elevated px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const CONFIDENCE_LABELS: Record<ConfidenceTier, string> = {
  exact: "Exato (regra ensinada)",
  high_confidence: "Alta confiança",
  review: "Revisão",
  insufficient: "Dados insuficientes",
  conflict: "Conflito",
};

const CONFIDENCE_VARIANT: Record<ConfidenceTier, "positive" | "info" | "warning" | "outline" | "critical"> = {
  exact: "positive",
  high_confidence: "info",
  review: "warning",
  insufficient: "outline",
  conflict: "critical",
};

const RESULTING_TYPE_OPTIONS: { value: BankStatementLineType; label: string }[] = [
  { value: "pix_recebido", label: "Pix recebido (cliente)" },
  { value: "pix_enviado", label: "Pix enviado" },
  { value: "pagamento", label: "Pagamento a fornecedor" },
  { value: "transferencia_entrada", label: "Transferência entre contas (entrada)" },
  { value: "transferencia_saida", label: "Transferência entre contas (saída)" },
  { value: "aporte", label: "Aporte de sócio" },
  { value: "retirada", label: "Retirada de sócio" },
  { value: "tarifa", label: "Tarifa bancária" },
  { value: "mensalidade_stone", label: "Mensalidade Stone" },
  { value: "devolucao", label: "Devolução/estorno" },
  { value: "outro", label: "Outro" },
];

const TRANSFER_TYPES = new Set(["transferencia_entrada", "transferencia_saida", "aporte", "retirada"]);

const initial: FormActionState = { error: null, success: null };

export function BankStatementGroupRow({
  classified,
  financialAccountId,
  financialAccounts,
  suppliers,
  categories,
}: {
  classified: ClassifiedGroup;
  financialAccountId: string;
  financialAccounts: FinancialAccountBalance[];
  suppliers: Supplier[];
  categories: FinancialCategory[];
}) {
  const { group, evidence } = classified;
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmGroupAction, initial);
  const [rejectState, rejectFormAction, rejectPending] = useActionState(rejectGroupAction, initial);
  const [resultingType, setResultingType] = useState<BankStatementLineType>(evidence.suggestedType ?? group.type);
  const [createRule, setCreateRule] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border-subtle p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{group.counterpartyKey || "(sem contraparte identificável)"}</p>
          <p className="text-xs text-foreground-subtle">
            {group.count} lançamento(s) · {group.direction === "entrada" ? "entrada" : "saída"} · {formatDateBR(group.periodFrom)} — {formatDateBR(group.periodTo)}
            {group.distinctMonths > 1 ? ` · ${group.distinctMonths} meses` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{formatCurrency(group.totalAmount)}</span>
          <Badge variant={CONFIDENCE_VARIANT[evidence.confidence]}>{CONFIDENCE_LABELS[evidence.confidence]}</Badge>
        </div>
      </div>

      <p className="mt-2 text-xs text-foreground-subtle">{evidence.reasonSummary}</p>
      {evidence.evidences.length > 0 ? (
        <ul className="mt-1 list-inside list-disc text-xs text-foreground-subtle">
          {evidence.evidences.map((e, i) => (
            <li key={i}>{e.detail}</li>
          ))}
        </ul>
      ) : null}

      <button type="button" className="mt-2 text-xs text-accent hover:underline" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Ocultar lançamentos" : `Ver ${group.count} lançamento(s)`}
      </button>
      {expanded ? (
        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border-subtle p-2">
          {group.lines.map((l) => (
            <div key={l.id} className="flex justify-between text-xs text-foreground-subtle">
              <span>
                {formatDateBR(l.date)} — {l.description}
              </span>
              <span>{formatCurrency(l.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {evidence.confidence !== "insufficient" || group.count > 1 ? (
        <form action={confirmAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3">
          <input type="hidden" name="financialAccountId" value={financialAccountId} />
          {group.lines.map((l) => (
            <input key={l.id} type="hidden" name="lineIds" value={l.id} />
          ))}

          <div>
            <label className="block text-[10px] font-medium text-foreground-muted">Classificar grupo como</label>
            <select name="resultingType" value={resultingType} onChange={(e) => setResultingType(e.target.value as BankStatementLineType)} className={fieldClasses}>
              {RESULTING_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {TRANSFER_TYPES.has(resultingType) ? (
            <div>
              <label className="block text-[10px] font-medium text-foreground-muted">Outra conta</label>
              <select name="counterAccountId" className={fieldClasses}>
                <option value="">Não informado</option>
                {financialAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-medium text-foreground-muted">Fornecedor</label>
                <select name="supplierId" defaultValue={evidence.suggestedSupplierId ?? ""} className={fieldClasses}>
                  <option value="">Nenhum</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-foreground-muted">Categoria</label>
                <select name="categoryId" defaultValue={evidence.suggestedCategoryId ?? ""} className={fieldClasses}>
                  <option value="">Nenhuma</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-[10px] font-medium text-foreground-muted">Seu nome</label>
            <input name="performedBy" type="text" required className={fieldClasses} />
          </div>

          <label className="flex items-center gap-1 text-xs text-foreground-muted">
            <input type="checkbox" name="createRule" checked={createRule} onChange={(e) => setCreateRule(e.target.checked)} />
            Aplicar a futuros movimentos equivalentes
          </label>
          {createRule ? (
            <>
              <input type="hidden" name="criteriaDirection" value={group.direction} />
              <input type="hidden" name="criteriaCounterpartyPattern" value={group.counterpartyKey} />
            </>
          ) : null}

          <Button type="submit" size="sm" disabled={confirmPending}>
            {confirmPending ? "Confirmando..." : `Confirmar ${group.count > 1 ? "grupo" : "lançamento"}`}
          </Button>
        </form>
      ) : null}

      <form action={rejectFormAction} className="mt-2 flex flex-wrap items-end gap-2">
        {group.lines.map((l) => (
          <input key={l.id} type="hidden" name="lineIds" value={l.id} />
        ))}
        <div>
          <label className="block text-[10px] font-medium text-foreground-muted">Ignorar — justificativa</label>
          <input name="reason" type="text" className={fieldClasses} placeholder="Nunca sem motivo auditável" />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-foreground-muted">Seu nome</label>
          <input name="performedBy" type="text" className={fieldClasses} />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={rejectPending}>
          {rejectPending ? "..." : "Ignorar grupo"}
        </Button>
      </form>

      {confirmState.error ? <p className="mt-1 text-xs text-critical">{confirmState.error}</p> : null}
      {confirmState.success ? <p className="mt-1 text-xs text-positive">{confirmState.success}</p> : null}
      {rejectState.error ? <p className="mt-1 text-xs text-critical">{rejectState.error}</p> : null}
      {rejectState.success ? <p className="mt-1 text-xs text-positive">{rejectState.success}</p> : null}
    </div>
  );
}
