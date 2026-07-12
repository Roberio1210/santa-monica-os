"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { ClassifyEntityForm } from "@/components/finance/classify-entity-form";
import type { ClassificationQueueItem, CostCenter, FinancialCategory, Partner, Supplier } from "@/lib/finance/types";

const reasonLabels: Record<ClassificationQueueItem["reason"], string> = {
  sem_classificacao: "Sem classificação",
  revisao_necessaria: "Revisão necessária",
  despesa_compartilhada_sem_rateio: "Despesa compartilhada sem rateio",
  acordo_sem_detalhamento: "Acordo sem detalhamento",
  fornecedor_sem_regra: "Fornecedor sem regra",
  cliente_sem_regra: "Cliente sem regra",
};

interface ClassificationQueueViewProps {
  items: ClassificationQueueItem[];
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  suppliers: Supplier[];
  partners: Partner[];
}

export function ClassificationQueueView({ items, categories, costCenters, suppliers, partners }: ClassificationQueueViewProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fila de classificação — {items.length}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <EmptyState title="Nenhuma pendência" description="Todos os lançamentos estão classificados." />
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const key = `${item.sourceKind}:${item.sourceId}`;
              const expanded = expandedKey === key;
              return (
                <div key={key} className="rounded-lg border border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : key)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-background-elevated/50"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.reason === "revisao_necessaria" ? "warning" : "critical"}>{reasonLabels[item.reason]}</Badge>
                      <span className="text-foreground-muted">{formatDateBR(item.date)}</span>
                      <span className="text-foreground">{item.description}</span>
                      {item.partyName ? <span className="text-foreground-subtle">({item.partyName})</span> : null}
                    </span>
                    <span className="font-medium text-foreground">{formatCurrency(item.amount)}</span>
                  </button>
                  {expanded ? (
                    <div className="border-t border-border-subtle p-3">
                      <ClassifyEntityForm item={item} categories={categories} costCenters={costCenters} suppliers={suppliers} partners={partners} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
