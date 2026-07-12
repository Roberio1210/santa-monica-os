"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { classifyEntityAction } from "@/app/financeiro/classificacao/actions";
import type { ClassificationMatchType, ClassificationQueueItem, CostCenter, FinancialCategory, Partner, Supplier } from "@/lib/finance/types";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "text-xs font-medium text-foreground-muted";

interface ClassifyEntityFormProps {
  item: ClassificationQueueItem;
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  suppliers: Supplier[];
  partners: Partner[];
}

export function ClassifyEntityForm({ item, categories, costCenters, suppliers, partners }: ClassifyEntityFormProps) {
  const [state, formAction, isPending] = useActionState(classifyEntityAction, { error: null });
  const [createRule, setCreateRule] = useState(false);
  const [matchType, setMatchType] = useState<ClassificationMatchType>("categoria");

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-border-subtle bg-background-elevated p-3">
      <input type="hidden" name="sourceKind" value={item.sourceKind} />
      <input type="hidden" name="sourceId" value={item.sourceId} />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClasses}>Linha da DRE</label>
          <select name="dreLine" required defaultValue="" className={fieldClasses}>
            <option value="" disabled>
              Selecione
            </option>
            <option value="receita_bruta">Receita bruta</option>
            <option value="deducoes_receita">Dedução da receita</option>
            <option value="custos_diretos">Custo direto</option>
            <option value="despesas_operacionais">Despesa operacional</option>
            <option value="resultado_financeiro">Resultado financeiro</option>
            <option value="tributos">Tributos</option>
            <option value="fora_dre">Fora da DRE (transferência/aporte/retirada/reembolso)</option>
          </select>
        </div>
        <div>
          <label className={labelClasses}>Natureza</label>
          <select name="nature" required defaultValue="" className={fieldClasses}>
            <option value="" disabled>
              Selecione
            </option>
            <option value="receita_operacional">Receita operacional</option>
            <option value="deducao_receita">Dedução da receita</option>
            <option value="custo_direto">Custo direto</option>
            <option value="despesa_operacional">Despesa operacional</option>
            <option value="resultado_financeiro">Resultado financeiro</option>
            <option value="investimento">Investimento</option>
            <option value="ativo">Ativo</option>
            <option value="passivo">Passivo</option>
            <option value="transferencia">Transferência</option>
            <option value="aporte">Aporte</option>
            <option value="retirada">Retirada</option>
            <option value="reembolso">Reembolso</option>
            <option value="nao_classificavel">Não classificável</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClasses}>Responsável pela classificação</label>
        <input name="classifiedBy" type="text" className={fieldClasses} placeholder="Quem está classificando" />
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground-muted">
        <input type="checkbox" name="reviewNeeded" />
        Marcar como revisão necessária
      </label>

      <label className="flex items-center gap-2 text-xs text-foreground-muted">
        <input type="checkbox" name="createRule" checked={createRule} onChange={(e) => setCreateRule(e.target.checked)} />
        Criar regra automática a partir desta classificação
      </label>

      {createRule ? (
        <div className="space-y-2 border-t border-border-subtle pt-2">
          <select value={matchType} onChange={(e) => setMatchType(e.target.value as ClassificationMatchType)} name="ruleMatchType" className={fieldClasses}>
            <option value="fornecedor">Por fornecedor</option>
            <option value="parceiro">Por cliente/parceiro</option>
            <option value="categoria">Por categoria</option>
            <option value="palavra_chave">Por palavra-chave na descrição</option>
          </select>
          {matchType === "fornecedor" ? (
            <select name="ruleSupplierId" className={fieldClasses} defaultValue="">
              <option value="" disabled>
                Selecione o fornecedor
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          {matchType === "parceiro" ? (
            <select name="rulePartnerId" className={fieldClasses} defaultValue="">
              <option value="" disabled>
                Selecione o cliente/parceiro
              </option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
          {matchType === "categoria" ? (
            <select name="ruleCategoryId" className={fieldClasses} defaultValue="">
              <option value="" disabled>
                Selecione a categoria
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}
          {matchType === "palavra_chave" ? <input name="ruleKeyword" type="text" className={fieldClasses} placeholder="Ex.: acordo" /> : null}
          <select name="suggestedCostCenterId" className={fieldClasses} defaultValue="">
            <option value="">Centro de custo sugerido (opcional)</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {state.error ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-2 py-1 text-xs text-critical">{state.error}</p> : null}
      {state.success ? <p className="rounded-lg border border-positive/30 bg-positive-bg px-2 py-1 text-xs text-positive">{state.success}</p> : null}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Classificando..." : "Classificar"}
      </Button>
    </form>
  );
}
