import "server-only";
import { and, eq, ilike, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jumpParkServiceOrderItems, jumpParkServiceOrders } from "@/db/schema/jumppark";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import type { AccountsReceivableStatus } from "@/lib/finance/types";

/**
 * Missão Financeiro V4.2 — generaliza o fechamento mensal consolidado (antes só IESA, ver
 * `iesaClosing.ts`) para qualquer parceiro corporativo vinculado formalmente a ordens do JumpPark
 * (`jumppark_service_orders.partner_id`). Uma ordem vinculada contribui com o valor INTEIRO de
 * seus serviços — nunca só o item cujo nome "parece" do parceiro (achado real da auditoria de
 * julho/2026: um "Polimento Peça - Nissan" na mesma ordem de uma "Lavação Parceria IESA" ficava
 * de fora do fechamento porque só o texto da lavação era reconhecido).
 *
 * `legacyFallbackKeyword` cobre ordens que AINDA não têm vínculo formal (a maior parte do
 * histórico anterior a julho/2026, quando `client_name` quase nunca vinha preenchido) — reproduz o
 * mecanismo textual antigo, nunca ampliado, para não alterar nenhum mês já fechado/auditado sem
 * confirmação explícita (ver `corporatePartnerRevenue.ts`).
 */
export interface CorporatePartnerMonthlyClosing {
  competenceMonth: string;
  serviceCount: number;
  orderExternalIds: string[];
  totalAmount: number;
  accountsReceivableId: string | null;
  billingStatus: AccountsReceivableStatus | "sem_cobranca_gerada";
  expectedAmount: number | null;
  receivedAmount: number | null;
  outstandingAmount: number | null;
  /** totalAmount (real, calculado agora) - expectedAmount (o que foi cobrado) — só quando já existe cobrança gerada para o mês. */
  difference: number | null;
}

export async function fetchCorporatePartnerMonthlyClosings(
  partnerId: string,
  accountsReceivablePartyNameFragment: string,
  legacyFallbackKeyword: string | null,
): Promise<CorporatePartnerMonthlyClosing[]> {
  const db = getDb();
  if (!db) return [];

  const linkedOrders = await db
    .select({ id: jumpParkServiceOrders.id, externalId: jumpParkServiceOrders.externalId, orderDate: jumpParkServiceOrders.orderDate })
    .from(jumpParkServiceOrders)
    .where(eq(jumpParkServiceOrders.partnerId, partnerId));

  const linkedOrderIds = linkedOrders.map((o) => o.id);
  const linkedItems = linkedOrderIds.length === 0 ? [] : await db.select({ orderId: jumpParkServiceOrderItems.serviceOrderId, amount: jumpParkServiceOrderItems.amount }).from(jumpParkServiceOrderItems).where(inArray(jumpParkServiceOrderItems.serviceOrderId, linkedOrderIds));

  const legacyRows = !legacyFallbackKeyword
    ? []
    : await db
        .select({
          orderId: jumpParkServiceOrders.id,
          orderExternalId: jumpParkServiceOrders.externalId,
          orderDate: jumpParkServiceOrders.orderDate,
          amount: jumpParkServiceOrderItems.amount,
        })
        .from(jumpParkServiceOrderItems)
        .innerJoin(jumpParkServiceOrders, eq(jumpParkServiceOrders.id, jumpParkServiceOrderItems.serviceOrderId))
        .where(and(isNull(jumpParkServiceOrders.partnerId), ilike(jumpParkServiceOrderItems.description, `%${legacyFallbackKeyword}%`)));

  const byMonth = new Map<string, { orderIds: Set<string>; totalCents: number; count: number }>();

  const orderById = new Map(linkedOrders.map((o) => [o.id, o]));
  for (const item of linkedItems) {
    const order = orderById.get(item.orderId);
    if (!order) continue;
    const month = order.orderDate.slice(0, 7);
    const bucket = byMonth.get(month) ?? { orderIds: new Set<string>(), totalCents: 0, count: 0 };
    bucket.orderIds.add(order.externalId);
    bucket.totalCents += Math.round(Number(item.amount ?? 0) * 100);
    bucket.count += 1;
    byMonth.set(month, bucket);
  }

  for (const row of legacyRows) {
    const month = row.orderDate.slice(0, 7);
    const bucket = byMonth.get(month) ?? { orderIds: new Set<string>(), totalCents: 0, count: 0 };
    bucket.orderIds.add(row.orderExternalId);
    bucket.totalCents += Math.round(Number(row.amount ?? 0) * 100);
    bucket.count += 1;
    byMonth.set(month, bucket);
  }

  const receivables = await getFinanceRepository().listAccountsReceivable();
  const partnerReceivables = receivables.filter((r) => r.partyName.toLowerCase().includes(accountsReceivablePartyNameFragment.toLowerCase()));

  const closings: CorporatePartnerMonthlyClosing[] = [];
  for (const [month, bucket] of byMonth) {
    const receivable = partnerReceivables.find((r) => r.competenceDate.slice(0, 7) === month) ?? null;
    const totalAmount = bucket.totalCents / 100;
    closings.push({
      competenceMonth: month,
      serviceCount: bucket.count,
      orderExternalIds: [...bucket.orderIds],
      totalAmount,
      accountsReceivableId: receivable?.id ?? null,
      billingStatus: receivable?.status ?? "sem_cobranca_gerada",
      expectedAmount: receivable?.expectedAmount ?? null,
      receivedAmount: receivable?.receivedAmount ?? null,
      outstandingAmount: receivable?.outstandingAmount ?? null,
      difference: receivable ? Math.round((totalAmount - receivable.expectedAmount) * 100) / 100 : null,
    });
  }

  return closings.sort((a, b) => a.competenceMonth.localeCompare(b.competenceMonth));
}

export interface GenerateCorporatePartnerClosingResult {
  status: "created" | "already_exists" | "updated";
  accountsReceivableId: string;
}

/**
 * Gera (ou, quando `allowAmountCorrection` for true e o valor real divergir, corrige) a conta a
 * receber consolidada de um mês de competência — nunca uma por ordem. Idempotente por `externalId`
 * (`{externalIdPrefix}-recebivel-{competência}`). A correção de valor é uma ação EXPLÍCITA (nunca
 * automática): só ocorre quando o chamador passa `allowAmountCorrection: true` — proteção contra
 * sobrescrever silenciosamente um valor já conferido/pago.
 */
export async function generateCorporatePartnerClosingReceivable(
  externalIdPrefix: string,
  partnerNameFragment: string,
  competenceMonth: string,
  totalAmount: number,
  dueDay: number,
  responsibleName: string,
  allowAmountCorrection = false,
): Promise<GenerateCorporatePartnerClosingResult> {
  const financeRepo = getFinanceRepository();
  const externalId = `${externalIdPrefix}-recebivel-${competenceMonth}`;

  const existing = await financeRepo.getAccountsReceivableByExternalId(externalId);
  if (existing) {
    if (!allowAmountCorrection || existing.expectedAmount === totalAmount) return { status: "already_exists", accountsReceivableId: existing.id };
    await financeRepo.updateAccountsReceivable({
      id: existing.id,
      expectedAmount: totalAmount,
      notes: `${existing.notes ?? ""}\nCorrigido de ${existing.expectedAmount} para ${totalAmount} por ${responsibleName} em ${new Date().toISOString().slice(0, 10)} — reconciliação item a item com a planilha oficial encontrou serviços (ex.: polimentos) não capturados pelo reconhecimento textual anterior.`.trim(),
    });
    return { status: "updated", accountsReceivableId: existing.id };
  }

  const [year, month] = competenceMonth.split("-").map(Number);
  const dueDate = new Date(Date.UTC(year, month, dueDay)).toISOString().slice(0, 10);

  const [partners, contracts] = await Promise.all([financeRepo.listPartners(), financeRepo.listContracts()]);
  const partner = partners.find((p) => p.name.toLowerCase().includes(partnerNameFragment.toLowerCase())) ?? null;
  const contract = contracts.find((c) => c.partnerId === partner?.id) ?? null;

  const [receivable] = await financeRepo.createAccountsReceivable({
    description: `${partner?.name ?? partnerNameFragment} — fechamento ${competenceMonth}`,
    partnerId: partner?.id ?? null,
    contractId: contract?.id ?? null,
    competenceDate: `${competenceMonth}-01`,
    dueDate,
    expectedAmount: totalAmount,
    status: "open",
    responsibleName,
    notes: `Fechamento consolidado gerado a partir de ${competenceMonth} — soma de todos os serviços vinculados ao parceiro no JumpPark no período. Nunca uma conta por ordem individual (parceria pós-paga).`,
    externalId,
  });

  return { status: "created", accountsReceivableId: receivable.id };
}
