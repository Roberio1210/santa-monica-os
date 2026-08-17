"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Unavailable } from "@/components/shared/unavailable";
import { formatCurrency } from "@/lib/utils/format";
import { generateIesaClosingAction, type FormActionState } from "@/app/financeiro/actions";
import type { IesaMonthlyClosing } from "@/lib/finance/iesaClosing";

const billingStatusLabels: Record<string, string> = {
  sem_cobranca_gerada: "Sem cobrança gerada",
  draft: "Rascunho",
  open: "Em aberto",
  partially_paid: "Parcialmente recebido",
  paid: "Recebido",
  overdue: "Vencido",
  cancelled: "Cancelado",
  reversed: "Estornado",
};

const initialState: FormActionState = { error: null, success: null };

/** Missão Financeiro V2 (Prioridade 3) — visão de fechamento mensal da parceria IESA, consolidada por competência, nunca uma cobrança por ordem. */
export function IesaClosingCard({ closings }: { closings: IesaMonthlyClosing[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parceria IESA/Nissan — fechamento por competência</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {closings.length === 0 ? (
          <Unavailable label="Nenhum serviço 'Lavação Parceria IESA' encontrado nas ordens sincronizadas do JumpPark." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                  <th className="pb-2 pr-3 font-medium">Competência</th>
                  <th className="pb-2 pr-3 font-medium">Serviços</th>
                  <th className="pb-2 pr-3 font-medium">Ordens</th>
                  <th className="pb-2 pr-3 font-medium">Valor real</th>
                  <th className="pb-2 pr-3 font-medium">Cobrança</th>
                  <th className="pb-2 pr-3 font-medium">Diferença</th>
                  <th className="pb-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {closings.map((c) => (
                  <ClosingRow key={c.competenceMonth} closing={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-foreground-subtle">
          Meses com vínculo formal ao parceiro (ordem JumpPark ↔ Grupo IESA/Nissan) somam TODOS os serviços da ordem, não só os nomeados
          &quot;IESA&quot;. Meses sem vínculo ainda formado usam o reconhecimento textual histórico (&quot;Lavação Parceria IESA&quot;), preservado
          para não alterar competências já fechadas. Gerar a cobrança nunca presume pagamento individual por ordem; é sempre um fechamento
          consolidado do mês.
        </p>
      </CardContent>
    </Card>
  );
}

function ClosingRow({ closing }: { closing: IesaMonthlyClosing }) {
  const [state, action, pending] = useActionState(generateIesaClosingAction, initialState);
  return (
    <tr className="border-b border-border-subtle align-top last:border-0">
      <td className="py-2 pr-3 font-medium text-foreground">{closing.competenceMonth}</td>
      <td className="py-2 pr-3 text-foreground-muted">{closing.serviceCount}</td>
      <td className="py-2 pr-3 text-foreground-muted">{closing.orderExternalIds.length}</td>
      <td className="py-2 pr-3 text-foreground">{formatCurrency(closing.totalAmount)}</td>
      <td className="py-2 pr-3">
        <Badge variant={closing.billingStatus === "paid" ? "positive" : closing.billingStatus === "sem_cobranca_gerada" ? "outline" : "warning"}>
          {billingStatusLabels[closing.billingStatus] ?? closing.billingStatus}
        </Badge>
      </td>
      <td className="py-2 pr-3 text-foreground-muted">
        {closing.difference !== null ? (closing.difference === 0 ? "Sem diferença" : formatCurrency(closing.difference)) : "—"}
      </td>
      <td className="py-2">
        {closing.accountsReceivableId ? (
          <span className="text-xs text-foreground-subtle">Já gerada</span>
        ) : (
          <form action={action} className="flex flex-col gap-1">
            <input type="hidden" name="competenceMonth" value={closing.competenceMonth} />
            <input type="hidden" name="totalAmount" value={closing.totalAmount} />
            <input name="responsibleName" type="text" placeholder="Seu nome" required className="h-7 w-28 rounded-lg border border-border bg-background-elevated px-2 text-xs" />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pending ? "Gerando..." : "Gerar cobrança"}
            </Button>
          </form>
        )}
        {state.error ? <p className="mt-1 text-xs text-critical">{state.error}</p> : null}
        {state.success ? <p className="mt-1 text-xs text-positive">{state.success}</p> : null}
      </td>
    </tr>
  );
}
