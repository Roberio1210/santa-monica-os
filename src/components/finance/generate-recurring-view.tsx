"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { generateRecurringAccountsPayableAction } from "@/app/financeiro/contas-a-pagar/actions";
import type { RecurringGenerationStatusItem } from "@/lib/finance/service";

const fieldClasses =
  "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface GenerateRecurringViewProps {
  competenceMonth: string;
  items: RecurringGenerationStatusItem[];
}

export function GenerateRecurringView({ competenceMonth, items }: GenerateRecurringViewProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(generateRecurringAccountsPayableAction, { error: null, success: null, results: [] });
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.filter((i) => !i.alreadyGenerated && !i.template.variableAmount).map((i) => [i.template.id, true])),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  function handleMonthChange(value: string) {
    router.push(`/financeiro/contas-a-pagar/gerar-recorrentes?mes=${value}`);
  }

  const pending = items.filter((i) => !i.alreadyGenerated);
  const alreadyGenerated = items.filter((i) => i.alreadyGenerated);

  const previewRows = useMemo(() => {
    return pending
      .filter((i) => selected[i.template.id])
      .map((i) => {
        const amount = i.template.variableAmount ? Number((amounts[i.template.id] ?? "0").replace(",", ".")) : i.template.amount;
        return { item: i, amount: amount ?? 0 };
      });
  }, [pending, selected, amounts]);

  const previewValid = previewRows.every((r) => Number.isFinite(r.amount) && r.amount > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Competência</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-2 pt-0">
          <div>
            <label htmlFor="mes" className="block text-xs text-foreground-subtle">
              Mês
            </label>
            <input id="mes" type="month" defaultValue={competenceMonth} onChange={(e) => handleMonthChange(e.target.value)} className={fieldClasses} />
          </div>
        </CardContent>
      </Card>

      <form action={formAction} className="space-y-6">
        <input type="hidden" name="competenceMonth" value={competenceMonth} />

        <Card>
          <CardHeader>
            <CardTitle>Modelos para gerar — competência {competenceMonth}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div>
              <label htmlFor="responsibleName" className="block text-xs text-foreground-subtle">
                Responsável pela geração
              </label>
              <input id="responsibleName" name="responsibleName" type="text" className={`${fieldClasses} max-w-xs`} />
            </div>

            {pending.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Todas as recorrências já foram geradas para esta competência.</p>
            ) : (
              <div className="space-y-2">
                {pending.map((item) => (
                  <RecurringRow
                    key={item.template.id}
                    item={item}
                    checked={Boolean(selected[item.template.id])}
                    onToggle={(checked) => setSelected((s) => ({ ...s, [item.template.id]: checked }))}
                    amount={amounts[item.template.id] ?? ""}
                    onAmountChange={(value) => setAmounts((a) => ({ ...a, [item.template.id]: value }))}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {alreadyGenerated.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Já geradas nesta competência</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1 text-sm">
                {alreadyGenerated.map((item) => (
                  <li key={item.template.id} className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
                    <span className="text-foreground-muted">
                      <Badge variant="positive" className="mr-2">
                        Já gerada
                      </Badge>
                      {item.template.description}
                    </span>
                    {item.existingAccountsPayableId ? (
                      <Link href={`/financeiro/contas-a-pagar/${item.existingAccountsPayableId}`} className="text-xs text-accent hover:underline">
                        Abrir conta
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {previewRows.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Prévia — {previewRows.length} conta(s) serão criadas</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                      <th className="pb-2 pr-3 font-medium">Descrição</th>
                      <th className="pb-2 pr-3 font-medium">Fornecedor</th>
                      <th className="pb-2 pr-3 font-medium">Categoria</th>
                      <th className="pb-2 pr-3 font-medium">Centro de custo</th>
                      <th className="pb-2 pr-3 font-medium">Vencimento</th>
                      <th className="pb-2 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map(({ item, amount }) => (
                      <tr key={item.template.id} className="border-b border-border-subtle last:border-0">
                        <td className="py-2 pr-3 text-foreground">
                          {item.template.description}
                          {item.template.pendingData ? (
                            <Badge variant="warning" className="ml-2">
                              Dados pendentes
                            </Badge>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-foreground-muted">{item.template.supplierName ?? "Não informado"}</td>
                        <td className="py-2 pr-3 text-foreground-muted">—</td>
                        <td className="py-2 pr-3 text-foreground-muted">—</td>
                        <td className="py-2 pr-3 text-foreground-muted">{item.dueDate ? formatDateBR(item.dueDate) : "Sem dia fixo — usa a data da competência"}</td>
                        <td className={`py-2 font-medium ${amount > 0 ? "text-foreground" : "text-critical"}`}>{amount > 0 ? formatCurrency(amount) : "Valor necessário"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {state.error ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{state.error}</p> : null}
        {state.success ? <p className="rounded-lg border border-positive/30 bg-positive-bg px-3 py-2 text-sm text-positive">{state.success}</p> : null}

        {state.results.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Resultado da geração</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1 text-sm">
                {state.results.map((r) => (
                  <li key={r.templateId} className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
                    <span className="text-foreground-muted">
                      <Badge variant={r.status === "criada" ? "positive" : r.status === "ja_existia" ? "outline" : "critical"} className="mr-2">
                        {r.status === "criada" ? "Criada" : r.status === "ja_existia" ? "Já existia" : "Erro"}
                      </Badge>
                      {r.description}
                      {r.message ? <span className="ml-2 text-xs text-critical">{r.message}</span> : null}
                    </span>
                    {r.accountsPayableId ? (
                      <Link href={`/financeiro/contas-a-pagar/${r.accountsPayableId}`} className="text-xs text-accent hover:underline">
                        Abrir conta
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Button type="submit" disabled={isPending || previewRows.length === 0 || !previewValid}>
          {isPending ? "Gerando..." : `Confirmar geração (${previewRows.length})`}
        </Button>
      </form>
    </div>
  );
}

function RecurringRow({
  item,
  checked,
  onToggle,
  amount,
  onAmountChange,
}: {
  item: RecurringGenerationStatusItem;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  amount: string;
  onAmountChange: (value: string) => void;
}) {
  const { template, dueDate } = item;
  return (
    <div className="rounded-lg border border-border-subtle p-3">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="templateIds" value={template.id} checked={checked} onChange={(e) => onToggle(e.target.checked)} className="mt-1" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{template.description}</span>
            {template.pendingData ? <Badge variant="warning">Dados pendentes</Badge> : null}
            {template.variableAmount ? <Badge variant="outline">Valor variável</Badge> : null}
          </div>
          <p className="text-xs text-foreground-subtle">
            {template.supplierName ?? "Fornecedor não informado"} · {dueDate ? `Vence ${formatDateBR(dueDate)}` : "Sem dia fixo de vencimento"}
            {!template.variableAmount && template.amount !== null ? ` · ${formatCurrency(template.amount)}` : ""}
          </p>

          {template.variableAmount ? (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-foreground-subtle">Valor necessário *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  name={`amount_${template.id}`}
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  className={fieldClasses}
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground-subtle">Documento</label>
                <input type="text" name={`documentNumber_${template.id}`} className={fieldClasses} />
              </div>
              <div>
                <label className="block text-xs text-foreground-subtle">Data de emissão</label>
                <input type="date" name={`issueDate_${template.id}`} className={fieldClasses} />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs text-foreground-subtle">Observação</label>
                <input type="text" name={`notes_${template.id}`} className={fieldClasses} />
              </div>
            </div>
          ) : null}
        </div>
      </label>
    </div>
  );
}
