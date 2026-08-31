import "server-only";
import { getBankStatementRepository } from "@/lib/finance/bankStatement/repository-factory";
import { PIX_STONE_RECEIVED_LINE_TYPES } from "@/lib/finance/bankStatement/types";
import type { BankStatementLine } from "@/lib/finance/bankStatement/types";

/**
 * Missão Financeiro V7 (saneamento de auditoria, 30/08/2026) — forma CANÔNICA de listar Pix
 * recebidos de cliente na Stone. Nunca compare `type === "pix_recebido"` sozinho: o mesmo fato
 * ("Pix | Maquininha") é classificado como `recebimento_venda_stone` por decisão deliberada da
 * Missão V2.3 (ver `classification.ts`) — as duas são representações igualmente legítimas do
 * mesmo evento econômico.
 *
 * ATENÇÃO — `recebimento_venda_stone` NÃO é exclusivo de Pix: a mesma regra de classificação
 * também usa esse tipo para lotes de liquidação de CARTÃO ("Recebimento vendas / Antecipação",
 * "Recebível de Cartão", "Transferência entre contas Stone - Stone Principal", bandeiras de
 * débito/crédito) — 102 das 110 linhas desse tipo em agosto/2026 são liquidação de cartão, não
 * Pix (só 8 têm "Pix" na descrição). Por isso o filtro por `type` sozinho NÃO basta — é preciso
 * também exigir "pix" na descrição para as linhas desse tipo (o texto "Pix | Maquininha" está
 * sempre presente quando é de fato um Pix). `pix_recebido` já é Pix por definição, sem essa
 * exigência adicional.
 */
export async function listPixStoneReceivedLines(financialAccountId: string, dateFrom?: string, dateTo?: string): Promise<BankStatementLine[]> {
  const repo = getBankStatementRepository();
  const lines = await repo.listLines({ financialAccountId, direction: "entrada", types: [...PIX_STONE_RECEIVED_LINE_TYPES], dateFrom, dateTo });
  return lines.filter((l) => l.type === "pix_recebido" || l.description.toLowerCase().includes("pix"));
}
