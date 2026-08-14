import "server-only";
import { and, ilike, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jumpParkServiceOrderItems, jumpParkServiceOrders } from "@/db/schema/jumppark";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import type { AccountsReceivableStatus } from "@/lib/finance/types";

/**
 * Missão Financeiro V2 (Prioridade 3) — fechamento mensal da parceria pós-paga IESA/Nissan.
 *
 * Achado real desta missão (auditoria direta no Neon): `jumppark_service_orders.client_name` é
 * `null` em 63 dos 81 itens reais de "Lavação Parceria IESA" (78%) — usar `classifyJumpParkOrder`
 * (que decide por `clientName`, ver `classification.ts`) perderia a maior parte do volume real.
 * O identificador confiável é a DESCRIÇÃO DO ITEM DE SERVIÇO, que corresponde ao serviço
 * cadastrado "Lavação parceria IESA" (`services.external_id = "lavacao-parceria-iesa"`,
 * `docs/financial-classification-rules.md`). Este módulo agrupa por competência (mês da ordem)
 * usando esse sinal — nunca por ordem individual (a IESA é pós-paga; a mission explicitamente
 * pede fechamento consolidado, nunca uma conta a receber por ordem).
 */

export interface IesaMonthlyClosing {
  /** "YYYY-MM" — mês de competência (data da ordem), nunca a data de cobrança/recebimento. */
  competenceMonth: string;
  serviceCount: number;
  /** external_id das ordens JumpPark distintas incluídas — nunca a identidade pessoal do cliente. */
  orderExternalIds: string[];
  /** Soma real dos itens "Lavação Parceria IESA" no mês, pelo valor de referência do serviço. */
  totalAmount: number;
  accountsReceivableId: string | null;
  billingStatus: AccountsReceivableStatus | "sem_cobranca_gerada";
  expectedAmount: number | null;
  receivedAmount: number | null;
  outstandingAmount: number | null;
  /** totalAmount (real, calculado agora) - expectedAmount (o que foi cobrado) — só quando já existe cobrança gerada para o mês. */
  difference: number | null;
}

const IESA_SERVICE_DESCRIPTION_LIKE = "%iesa%";
/** Mesmo nome usado no seed real (`src/db/seed/contracts.ts`) — usado só para achar o recebível já existente por competência, nunca para criar o parceiro. */
const IESA_PARTY_NAME_FRAGMENT = "iesa";

export async function fetchIesaMonthlyClosings(): Promise<IesaMonthlyClosing[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      month: sql<string>`to_char(${jumpParkServiceOrders.orderDate}, 'YYYY-MM')`,
      orderExternalId: jumpParkServiceOrders.externalId,
      amount: jumpParkServiceOrderItems.amount,
    })
    .from(jumpParkServiceOrderItems)
    .innerJoin(jumpParkServiceOrders, sql`${jumpParkServiceOrders.id} = ${jumpParkServiceOrderItems.serviceOrderId}`)
    .where(and(ilike(jumpParkServiceOrderItems.description, IESA_SERVICE_DESCRIPTION_LIKE)));

  const byMonth = new Map<string, { orderIds: Set<string>; totalCents: number; count: number }>();
  for (const row of rows) {
    const bucket = byMonth.get(row.month) ?? { orderIds: new Set<string>(), totalCents: 0, count: 0 };
    bucket.orderIds.add(row.orderExternalId);
    bucket.totalCents += Math.round(Number(row.amount ?? 0) * 100);
    bucket.count += 1;
    byMonth.set(row.month, bucket);
  }

  const receivables = await getFinanceRepository().listAccountsReceivable();
  const iesaReceivables = receivables.filter((r) => r.partyName.toLowerCase().includes(IESA_PARTY_NAME_FRAGMENT));

  const closings: IesaMonthlyClosing[] = [];
  for (const [month, bucket] of byMonth) {
    const receivable = iesaReceivables.find((r) => r.competenceDate.slice(0, 7) === month) ?? null;
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

export interface GenerateIesaClosingResult {
  status: "created" | "already_exists";
  accountsReceivableId: string;
}

/**
 * Gera a conta a receber consolidada de um mês de competência — nunca uma por ordem. Idempotente
 * por `externalId` (mesmo padrão/prefixo `iesa-recebivel-{competência}` já usado pelo recebível
 * histórico real de R$ 900,00, `iesa-recebivel-2026-06` — reprocessar o mesmo mês nunca duplica,
 * inclusive esse já existente).
 */
export async function generateIesaClosingReceivable(competenceMonth: string, totalAmount: number, dueDay: number, responsibleName: string): Promise<GenerateIesaClosingResult> {
  const financeRepo = getFinanceRepository();
  const externalId = `iesa-recebivel-${competenceMonth}`;

  const existing = await financeRepo.getAccountsReceivableByExternalId(externalId);
  if (existing) return { status: "already_exists", accountsReceivableId: existing.id };

  const [year, month] = competenceMonth.split("-").map(Number);
  // `month` (1-indexado, ex.: 7 para julho) usado direto como índice 0-indexado de Date.UTC já
  // aponta para o mês SEGUINTE (7 = agosto) — vencimento no mês seguinte à competência, mesma
  // regra dos contratos reais (IESA vence dia 10 do mês seguinte ao fechamento).
  const dueDate = new Date(Date.UTC(year, month, dueDay)).toISOString().slice(0, 10);

  // Mesmo parceiro/contrato do recebível histórico real (R$ 900,00, iesa-recebivel-2026-06) — nunca
  // um parceiro novo inventado; se não existir (base sem o seed de contratos), fica sem vínculo,
  // nunca bloqueia o fechamento.
  const [partners, contracts] = await Promise.all([financeRepo.listPartners(), financeRepo.listContracts()]);
  const partner = partners.find((p) => p.name.toLowerCase().includes(IESA_PARTY_NAME_FRAGMENT)) ?? null;
  const contract = contracts.find((c) => c.partnerId === partner?.id) ?? null;

  const [receivable] = await financeRepo.createAccountsReceivable({
    description: `Parceria IESA/Nissan — fechamento ${competenceMonth}`,
    partnerId: partner?.id ?? null,
    contractId: contract?.id ?? null,
    competenceDate: `${competenceMonth}-01`,
    dueDate,
    expectedAmount: totalAmount,
    status: "open",
    responsibleName,
    notes: `Fechamento consolidado gerado a partir de ${competenceMonth} — soma dos itens "Lavação Parceria IESA" registrados no JumpPark no período. Nunca uma conta por ordem individual (parceria pós-paga).`,
    externalId,
  });

  return { status: "created", accountsReceivableId: receivable.id };
}
