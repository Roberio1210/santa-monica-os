"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { createClassificationRuleAction, deleteClassificationRuleAction } from "@/app/financeiro/classificacao/actions";
import type { ClassificationMatchType, ClassificationRule, CostCenter, FinancialCategory, Partner, Supplier } from "@/lib/finance/types";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const matchTypeLabels: Record<ClassificationMatchType, string> = {
  fornecedor: "Fornecedor",
  parceiro: "Cliente/Parceiro",
  categoria: "Categoria",
  palavra_chave: "Palavra-chave",
};

interface ClassificationRulesViewProps {
  rules: ClassificationRule[];
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  suppliers: Supplier[];
  partners: Partner[];
}

export function ClassificationRulesView({ rules, categories, costCenters, suppliers, partners }: ClassificationRulesViewProps) {
  const [state, formAction, isPending] = useActionState(createClassificationRuleAction, { error: null });
  const [matchType, setMatchType] = useState<ClassificationMatchType>("fornecedor");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Regras automáticas — {rules.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {rules.length === 0 ? (
            <EmptyState title="Nenhuma regra cadastrada" />
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between rounded-lg border border-border-subtle p-2 text-sm">
                  <div>
                    <Badge variant="outline" className="mr-2">
                      {matchTypeLabels[rule.matchType]}
                    </Badge>
                    <span className="text-foreground">{rule.supplierName ?? rule.partnerName ?? rule.categoryName ?? rule.keyword}</span>
                    {rule.reviewNeeded ? (
                      <Badge variant="warning" className="ml-2">
                        Revisão
                      </Badge>
                    ) : null}
                    <p className="text-xs text-foreground-subtle">
                      {rule.dreLine} · {rule.nature}
                      {rule.suggestedCostCenterName ? ` · ${rule.suggestedCostCenterName}` : ""}
                    </p>
                  </div>
                  <form action={deleteClassificationRuleAction}>
                    <input type="hidden" name="id" value={rule.id} />
                    <button type="submit" className="text-xs text-critical hover:underline">
                      Remover
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nova regra</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <form action={formAction} className="space-y-2">
            <select value={matchType} onChange={(e) => setMatchType(e.target.value as ClassificationMatchType)} name="matchType" className={fieldClasses}>
              <option value="fornecedor">Por fornecedor</option>
              <option value="parceiro">Por cliente/parceiro</option>
              <option value="categoria">Por categoria</option>
              <option value="palavra_chave">Por palavra-chave na descrição</option>
            </select>
            {matchType === "fornecedor" ? (
              <select name="supplierId" className={fieldClasses} defaultValue="">
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
              <select name="partnerId" className={fieldClasses} defaultValue="">
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
              <select name="categoryId" className={fieldClasses} defaultValue="">
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
            {matchType === "palavra_chave" ? <input name="keyword" type="text" className={fieldClasses} placeholder="Ex.: acordo" /> : null}

            <select name="dreLine" required defaultValue="" className={fieldClasses}>
              <option value="" disabled>
                Linha da DRE
              </option>
              <option value="receita_bruta">Receita bruta</option>
              <option value="deducoes_receita">Dedução da receita</option>
              <option value="custos_diretos">Custo direto</option>
              <option value="despesas_operacionais">Despesa operacional</option>
              <option value="resultado_financeiro">Resultado financeiro</option>
              <option value="tributos">Tributos</option>
              <option value="fora_dre">Fora da DRE</option>
            </select>

            <select name="nature" required defaultValue="" className={fieldClasses}>
              <option value="" disabled>
                Natureza
              </option>
              <option value="receita_operacional">Receita operacional</option>
              <option value="deducao_receita">Dedução da receita</option>
              <option value="custo_direto">Custo direto</option>
              <option value="despesa_operacional">Despesa operacional</option>
              <option value="resultado_financeiro">Resultado financeiro</option>
              <option value="transferencia">Transferência</option>
              <option value="aporte">Aporte</option>
              <option value="retirada">Retirada</option>
              <option value="reembolso">Reembolso</option>
              <option value="nao_classificavel">Não classificável</option>
            </select>

            <select name="suggestedCostCenterId" className={fieldClasses} defaultValue="">
              <option value="">Centro de custo sugerido (opcional)</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-xs text-foreground-muted">
              <input type="checkbox" name="reviewNeeded" />
              Marcar como revisão necessária
            </label>

            {state.error ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-2 py-1 text-xs text-critical">{state.error}</p> : null}
            {state.success ? <p className="rounded-lg border border-positive/30 bg-positive-bg px-2 py-1 text-xs text-positive">{state.success}</p> : null}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Criando..." : "Criar regra"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
