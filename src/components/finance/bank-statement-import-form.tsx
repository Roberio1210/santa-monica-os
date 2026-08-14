"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dryRunImportAction, confirmImportAction, type DryRunState, type FormActionState } from "@/app/financeiro/conta-stone/actions";

const fieldClasses = "h-9 w-full rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialDryRunState: DryRunState = { error: null, success: null, preview: null, csvContent: null, filename: null };
const initialConfirmState: FormActionState = { error: null, success: null };

/**
 * Missão Financeiro V2.1 (Fase C) — importação em 2 passos: analisar (nunca escreve no banco) e
 * só depois confirmar. O conteúdo do CSV fica num campo oculto entre os dois passos para não
 * exigir reenvio do arquivo.
 */
export function BankStatementImportForm({ financialAccountId }: { financialAccountId: string }) {
  const [dryRunState, dryRunAction, dryRunPending] = useActionState(dryRunImportAction, initialDryRunState);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmImportAction, initialConfirmState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar extrato (CSV)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-xs text-foreground-subtle">
          Colunas esperadas: <code>data</code>, <code>descricao</code>, <code>contraparte</code> (opcional), <code>valor</code>, <code>tipo</code> (opcional — &quot;entrada&quot;/&quot;saida&quot;; sem
          essa coluna, o sinal do valor decide). Nunca duplica: reimportar o mesmo arquivo não cria linhas repetidas.
        </p>

        <form action={dryRunAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="financialAccountId" value={financialAccountId} />
          <div>
            <label htmlFor="file" className="text-xs font-medium text-foreground-muted">
              Arquivo CSV
            </label>
            <input id="file" name="file" type="file" accept=".csv,text/csv" required className={fieldClasses} />
          </div>
          <Button type="submit" variant="outline" disabled={dryRunPending}>
            {dryRunPending ? "Analisando..." : "Analisar"}
          </Button>
        </form>

        {dryRunState.error ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{dryRunState.error}</p> : null}

        {dryRunState.preview ? (
          <div className="space-y-3 rounded-lg border border-border-subtle p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{dryRunState.preview.summary.totalRows} linha(s) no arquivo</Badge>
              <Badge variant="positive">{dryRunState.preview.summary.newRows} nova(s)</Badge>
              <Badge variant="info">{dryRunState.preview.summary.duplicateRows} duplicada(s) — não serão importadas</Badge>
              {dryRunState.preview.summary.invalidRows > 0 ? <Badge variant="critical">{dryRunState.preview.summary.invalidRows} inválida(s)</Badge> : null}
            </div>

            {dryRunState.preview.summary.newRows === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhuma linha nova para importar — todas já existem ou são inválidas.</p>
            ) : (
              <form action={confirmAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="financialAccountId" value={financialAccountId} />
                <input type="hidden" name="csvContent" value={dryRunState.csvContent ?? ""} />
                <input type="hidden" name="filename" value={dryRunState.filename ?? ""} />
                <div>
                  <label htmlFor="importedBy" className="text-xs font-medium text-foreground-muted">
                    Seu nome
                  </label>
                  <input id="importedBy" name="importedBy" type="text" required className={fieldClasses} />
                </div>
                <Button type="submit" disabled={confirmPending}>
                  {confirmPending ? "Importando..." : `Confirmar importação de ${dryRunState.preview.summary.newRows} linha(s)`}
                </Button>
              </form>
            )}
          </div>
        ) : null}

        {confirmState.error ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{confirmState.error}</p> : null}
        {confirmState.success ? <p className="rounded-lg border border-positive/30 bg-positive-bg px-3 py-2 text-sm text-positive">{confirmState.success}</p> : null}
      </CardContent>
    </Card>
  );
}
