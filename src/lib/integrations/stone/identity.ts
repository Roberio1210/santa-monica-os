import { createHash } from "node:crypto";

/**
 * Identidade e idempotência (Sprint 7.0, Z2, decisão do usuário) — cada parcela de cada
 * transação precisa de uma chave externa estável, para nunca duplicar quando o mesmo arquivo Stone
 * for reprocessado. Nunca usa só valor+data (colide facilmente entre vendas diferentes no mesmo
 * dia) — combina NSU, código de autorização, identificador do cliente, terminal, data de captura,
 * número da parcela e valor. Determinística: a mesma entrada sempre produz a mesma chave, em
 * qualquer execução — é isso que permite, no futuro (Z3+, quando existir persistência), um índice
 * único nesta chave para impedir duplicidade sem precisar de nenhuma lógica adicional.
 *
 * Este checkpoint não persiste nada — só garante que a geração da chave é determinística
 * (testado explicitamente) e pronta para servir de chave primária/índice único depois.
 */

export interface TransactionIdentityInput {
  /** NSU — identificador único da transação gerado pela adquirente. */
  acquirerTransactionKey: string;
  authorizationCode: string;
  /** "Nosso Número" (boleto) ou código do sistema cliente — pode não existir. */
  initiatorTransactionKey: string | null;
  establishmentCode: string;
  terminalSerialNumber: string | null;
  capturedAt: string;
  installmentNumber: number;
  amount: number;
}

/**
 * Chave externa estável de uma parcela — sempre o mesmo hash para a mesma combinação de campos,
 * em qualquer execução/processo (nenhuma aleatoriedade, nenhum timestamp de geração entra na
 * chave). `amount` é normalizado para 2 casas decimais antes de entrar na chave, para nunca deixar
 * uma diferença de representação de ponto flutuante (`10.1` vs `10.10`) gerar uma chave diferente
 * para o mesmo valor real.
 */
export function buildTransactionExternalKey(input: TransactionIdentityInput): string {
  const parts = [
    input.acquirerTransactionKey,
    input.authorizationCode,
    input.initiatorTransactionKey ?? "",
    input.establishmentCode,
    input.terminalSerialNumber ?? "",
    input.capturedAt,
    String(input.installmentNumber),
    input.amount.toFixed(2),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
