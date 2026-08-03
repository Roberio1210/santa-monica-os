"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { recordDuplicateDecisionAction, type FormActionState } from "@/app/estoque/auditoria/actions";
import type { DuplicateSuspectWithStatus } from "@/lib/inventory/audit-service";
import type { InventoryItem } from "@/lib/inventory/types";

const initialState: FormActionState = { error: null, success: null };

function DecisionButton({ label, variant }: { label: string; variant: "outline" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {pending ? "Enviando..." : label}
    </Button>
  );
}

function DuplicatePairCard({ suspect, itemA, itemB, performedBy }: { suspect: DuplicateSuspectWithStatus; itemA: InventoryItem; itemB: InventoryItem; performedBy: string }) {
  const [state, formAction] = useActionState(recordDuplicateDecisionAction, initialState);

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="warning">{suspect.similarity}% de similaridade</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[itemA, itemB].map((item) => (
            <div key={item.id} className="rounded-lg border border-border-subtle p-2 text-sm">
              <p className="font-medium text-foreground">{item.name}</p>
              <p className="text-xs text-foreground-subtle">
                {item.brand} · {item.category} · {item.currentQuantity} {item.unit} · custo {item.unitCost !== null ? `R$ ${item.unitCost.toFixed(2)}` : "não cadastrado"}
              </p>
            </div>
          ))}
        </div>
        <ul className="list-inside list-disc text-xs text-foreground-muted">
          {suspect.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <form action={formAction} className="contents">
            <input type="hidden" name="itemAId" value={itemA.id} />
            <input type="hidden" name="itemBId" value={itemB.id} />
            <input type="hidden" name="performedBy" value={performedBy} />
            <input type="hidden" name="decision" value="nao_sao_duplicados" />
            <DecisionButton label="Não são duplicados" variant="outline" />
          </form>
          <form action={formAction} className="contents">
            <input type="hidden" name="itemAId" value={itemA.id} />
            <input type="hidden" name="itemBId" value={itemB.id} />
            <input type="hidden" name="performedBy" value={performedBy} />
            <input type="hidden" name="decision" value="revisar_depois" />
            <DecisionButton label="Revisar depois" variant="ghost" />
          </form>
          <Button asChild variant="outline" size="sm">
            <Link href={`/estoque/auditoria/consolidar?master=${itemA.id}&merge=${itemB.id}`}>Iniciar consolidação</Link>
          </Button>
        </div>
        {state.error ? <p className="text-sm text-critical">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-positive">{state.success}</p> : null}
      </CardContent>
    </Card>
  );
}

export function DuplicatesList({ duplicates, itemById }: { duplicates: DuplicateSuspectWithStatus[]; itemById: Record<string, InventoryItem> }) {
  const [performedBy, setPerformedBy] = useState("");
  const unresolved = duplicates.filter((d) => !d.resolved);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Possíveis duplicidades</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <input
          type="text"
          placeholder="Seu nome (obrigatório para registrar uma decisão)"
          value={performedBy}
          onChange={(e) => setPerformedBy(e.target.value)}
          className="h-9 w-full max-w-sm rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
          aria-label="Responsável pela decisão"
        />

        {unresolved.length === 0 ? (
          <EmptyState title="Nenhuma duplicidade suspeita pendente" description="Todos os pares detectados já foram revisados." />
        ) : (
          <div className="space-y-3">
            {unresolved.map((suspect) => {
              const itemA = itemById[suspect.itemAId];
              const itemB = itemById[suspect.itemBId];
              if (!itemA || !itemB) return null;
              return <DuplicatePairCard key={`${suspect.itemAId}:${suspect.itemBId}`} suspect={suspect} itemA={itemA} itemB={itemB} performedBy={performedBy} />;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
