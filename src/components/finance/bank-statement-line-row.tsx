"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { reconcileLineAction, processLineAction, ignoreLineAction, type FormActionState } from "@/app/financeiro/conta-stone/actions";
import { STONE_SETTLEMENT_LINE_TYPES } from "@/lib/finance/bankStatement/types";
import type { BankStatementLine, BankStatementLineType } from "@/lib/finance/bankStatement/types";
import type { FinancialAccountBalance } from "@/lib/finance/types";

const fieldClasses = "h-8 rounded-lg border border-border bg-background-elevated px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const RESULTING_TYPE_OPTIONS: { value: BankStatementLineType; label: string }[] = [
  { value: "pix_recebido", label: "Pix recebido (cliente)" },
  { value: "pix_enviado", label: "Pix enviado" },
  { value: "pagamento", label: "Pagamento" },
  { value: "transferencia_entrada", label: "Transferência entre contas (entrada)" },
  { value: "transferencia_saida", label: "Transferência entre contas (saída)" },
  { value: "aporte", label: "Aporte de sócio" },
  { value: "retirada", label: "Retirada de sócio" },
  { value: "tarifa", label: "Tarifa bancária" },
  { value: "mensalidade_stone", label: "Mensalidade Stone" },
  { value: "devolucao", label: "Devolução/estorno" },
  { value: "recebimento_venda_stone", label: "Recebimento de venda Stone" },
  { value: "outro", label: "Outro" },
];

const TRANSFER_TYPES = new Set(["transferencia_entrada", "transferencia_saida", "aporte", "retirada"]);

const initial: FormActionState = { error: null, success: null };

interface LinkOption {
  id: string;
  label: string;
}

interface BankStatementLineRowProps {
  line: BankStatementLine;
  financialAccountId: string;
  financialAccounts: FinancialAccountBalance[];
  openReceivables: LinkOption[];
  openPayables: LinkOption[];
}

export function BankStatementLineRow({ line, financialAccountId, financialAccounts, openReceivables, openPayables }: BankStatementLineRowProps) {
  const [reconcileState, reconcileAction, reconcilePending] = useActionState(reconcileLineAction, initial);
  const [processState, processFormAction, processPending] = useActionState(processLineAction, initial);
  const [ignoreState, ignoreFormAction, ignorePending] = useActionState(ignoreLineAction, initial);
  const [resultingType, setResultingType] = useState<BankStatementLineType>(line.type);
  const [linkMode, setLinkMode] = useState<"nenhum" | "receivable" | "payable">("nenhum");

  const alreadyProcessed = Boolean(line.linkedCashMovementId || line.linkedAccountTransferId);
  const isSettlementEligible = STONE_SETTLEMENT_LINE_TYPES.includes(line.type) && (line.status === "nao_conciliado" || line.status === "sugerido");

  if (alreadyProcessed) {
    return <p className="mt-2 text-xs text-foreground-subtle">Processada{line.processedBy ? ` por ${line.processedBy}` : ""} — não pode ser reprocessada.</p>;
  }

  if (line.status === "ignorado") return null;

  return (
    <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
      {isSettlementEligible ? (
        <form action={reconcileAction} className="flex items-center gap-2">
          <input type="hidden" name="lineId" value={line.id} />
          <input type="hidden" name="financialAccountId" value={financialAccountId} />
          <Button type="submit" size="sm" variant="outline" disabled={reconcilePending}>
            {reconcilePending ? "Conciliando..." : "Tentar conciliar com Stone"}
          </Button>
        </form>
      ) : null}

      <form action={processFormAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="lineId" value={line.id} />
        <input type="hidden" name="financialAccountId" value={financialAccountId} />
        <div>
          <label className="block text-[10px] font-medium text-foreground-muted">Classificar como</label>
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
              <label className="block text-[10px] font-medium text-foreground-muted">Vínculo</label>
              <select value={linkMode} onChange={(e) => setLinkMode(e.target.value as typeof linkMode)} className={fieldClasses}>
                <option value="nenhum">Nenhum</option>
                <option value="receivable">Conta a receber existente</option>
                <option value="payable">Conta a pagar existente</option>
              </select>
            </div>
            {linkMode === "receivable" ? (
              <div>
                <label className="block text-[10px] font-medium text-foreground-muted">Recebível</label>
                <select name="linkedAccountsReceivableId" className={fieldClasses}>
                  <option value="">Selecione</option>
                  {openReceivables.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {linkMode === "payable" ? (
              <div>
                <label className="block text-[10px] font-medium text-foreground-muted">Pagável</label>
                <select name="linkedAccountsPayableId" className={fieldClasses}>
                  <option value="">Selecione</option>
                  {openPayables.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </>
        )}

        <div>
          <label className="block text-[10px] font-medium text-foreground-muted">Seu nome</label>
          <input name="performedBy" type="text" required className={fieldClasses} />
        </div>
        <Button type="submit" size="sm" disabled={processPending}>
          {processPending ? "Processando..." : "Processar"}
        </Button>
      </form>
      {processState.error ? <p className="text-xs text-critical">{processState.error}</p> : null}
      {processState.success ? <p className="text-xs text-positive">{processState.success}</p> : null}

      <form action={ignoreFormAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="lineId" value={line.id} />
        <div>
          <label className="block text-[10px] font-medium text-foreground-muted">Justificativa para ignorar</label>
          <input name="reason" type="text" className={fieldClasses} placeholder="Nunca sem motivo auditável" />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-foreground-muted">Seu nome</label>
          <input name="performedBy" type="text" className={fieldClasses} />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={ignorePending}>
          {ignorePending ? "..." : "Ignorar"}
        </Button>
      </form>
      {reconcileState.error ? <p className="text-xs text-critical">{reconcileState.error}</p> : null}
      {ignoreState.error ? <p className="text-xs text-critical">{ignoreState.error}</p> : null}
    </div>
  );
}
