import { Info } from "lucide-react";

/**
 * Missão 29 — disclosure "Como foi calculado?" pedido para todo indicador do sistema gerencial.
 * `<details>` nativo (sem JS, funciona em Server Components) — não precisa de client component só
 * para abrir/fechar um texto.
 */
export function CalculationNote({
  source,
  formula,
  period,
  recordsUsed,
  recordsIgnored,
  limitations,
}: {
  /** De onde vêm os dados (ex.: "Ordens de serviço da JumpPark, sincronizadas em jumppark_service_orders"). */
  source: string;
  /** Fórmula em linguagem direta (ex.: "Soma de totalAmount de todas as ordens finalizadas no período"). */
  formula: string;
  /** Período considerado, já formatado (ex.: "01/08/2026 a 07/08/2026"). */
  period: string;
  /** O que entrou na conta, em linguagem direta (ex.: "2.065 ordens com saída registrada"). */
  recordsUsed: string;
  /** O que foi propositalmente deixado de fora (ex.: "Ordens sem saída registrada (em andamento)"). Null quando nada foi ignorado. */
  recordsIgnored?: string | null;
  /** Limitação real e honesta do número (ex.: "Não inclui despesas lançadas fora do Contas a Pagar"). Null quando não há limitação conhecida. */
  limitations?: string | null;
}) {
  return (
    <details className="group text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-foreground-subtle hover:text-foreground">
        <Info className="h-3 w-3" />
        Como foi calculado?
      </summary>
      <div className="mt-2 space-y-1.5 rounded-lg bg-background-elevated p-3 text-foreground-muted">
        <p>
          <span className="font-medium text-foreground-subtle">Fonte: </span>
          {source}
        </p>
        <p>
          <span className="font-medium text-foreground-subtle">Fórmula: </span>
          {formula}
        </p>
        <p>
          <span className="font-medium text-foreground-subtle">Período: </span>
          {period}
        </p>
        <p>
          <span className="font-medium text-foreground-subtle">Registros usados: </span>
          {recordsUsed}
        </p>
        {recordsIgnored ? (
          <p>
            <span className="font-medium text-foreground-subtle">Registros ignorados: </span>
            {recordsIgnored}
          </p>
        ) : null}
        {limitations ? (
          <p>
            <span className="font-medium text-foreground-subtle">Limitações: </span>
            {limitations}
          </p>
        ) : null}
      </div>
    </details>
  );
}
