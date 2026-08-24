import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers } from "@/db/schema";
import { normalizeBrazilianPhoneToE164 } from "./phone";

/**
 * Missão Z6.2 — resolve o telefone completo SÓ no momento do envio, a partir da referência
 * canônica (`customers.id`), nunca de um valor armazenado em `outbound_messages` (que só guarda
 * `phoneMasked`, para pré-visualização). Devolve `null` sempre que não for possível confirmar um
 * telefone válido — nunca inventa, nunca faz melhor esforço. Isso bloqueia corretamente o envio
 * de candidatos vindos de `post_sale_candidates`, que hoje nunca têm `customerId` (não existe
 * chave confiável entre pedidos do dia da JumpPark e `customers` — ver `postSale.ts`); esse
 * bloqueio é o comportamento correto, não uma falha desta implementação.
 */
export async function resolveRecipientPhone(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const db = getDb();
  if (!db) return null;

  const [row] = await db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!row?.phone) return null;

  return normalizeBrazilianPhoneToE164(row.phone);
}
