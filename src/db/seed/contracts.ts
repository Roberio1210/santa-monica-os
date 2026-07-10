import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { contractBenefits, contracts, invoices, partners, payments, receivables, services } from "@/db/schema";

type Db = ReturnType<typeof drizzle>;

/** onConflictDoNothing() não retorna a linha quando ela já existe — busca o id nesses casos. */
async function getPartnerId(db: Db, externalIdValue: string): Promise<string> {
  const rows = await db.select({ id: partners.id }).from(partners).where(eq(partners.externalId, externalIdValue)).limit(1);
  if (!rows[0]) throw new Error(`Partner não encontrado para external_id=${externalIdValue}`);
  return rows[0].id;
}

async function getContractId(db: Db, externalIdValue: string): Promise<string> {
  const rows = await db.select({ id: contracts.id }).from(contracts).where(eq(contracts.externalId, externalIdValue)).limit(1);
  if (!rows[0]) throw new Error(`Contract não encontrado para external_id=${externalIdValue}`);
  return rows[0].id;
}

async function getReceivableId(db: Db, externalIdValue: string): Promise<string> {
  const rows = await db
    .select({ id: receivables.id })
    .from(receivables)
    .where(eq(receivables.externalId, externalIdValue))
    .limit(1);
  if (!rows[0]) throw new Error(`Receivable não encontrado para external_id=${externalIdValue}`);
  return rows[0].id;
}

/**
 * Seed das 3 regras de contrato/parceria reais informadas pelo proprietário em 10/07/2026
 * (npm run db:seed:contracts). Idempotente via `external_id` único em cada tabela — rodar mais
 * de uma vez não duplica registros (ON CONFLICT DO NOTHING).
 *
 * Só registra como `receivables`/`payments`/`invoices` eventos financeiros confirmados
 * explicitamente pelo proprietário. Contratos sem um recebimento confirmado (Funerária, Don
 * Juan) ficam apenas com a regra estrutural (contrato + benefício) — nenhuma cobrança é
 * inventada ou presumida. Nenhuma cobrança automática é implementada aqui.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida. Configure-a antes de rodar o seed de contratos.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  // --- Serviços de referência (necessários para os contratos abaixo) ---
  await db
    .insert(services)
    .values([
      {
        name: "Lavação parceria IESA",
        category: "Lavagem",
        defaultPrice: "70.00",
        source: "seed:contratos-reais",
        externalId: "lavacao-parceria-iesa",
        notes: "Valor normal por lavação avulsa dentro da parceria. Pode haver adicionais cobrados à parte.",
      },
      {
        name: "Lavação funerária",
        category: "Lavagem",
        defaultPrice: "0.00",
        source: "seed:contratos-reais",
        externalId: "lavacao-funeraria",
        notes: "Valor zero porque o serviço está incluído no contrato mensal fixo da funerária (não é cobrado à parte).",
      },
    ])
    .onConflictDoNothing({ target: services.externalId });

  // --- GRUPO IESA/NISSAN — parceria pós-paga ---
  const [iesaPartner] = await db
    .insert(partners)
    .values({
      name: "Grupo IESA/Nissan",
      type: "parceria_pos_paga",
      source: "seed:contratos-reais",
      externalId: "iesa-nissan",
      notes: "Parceria pós-paga. Registros do JumpPark lançados como dinheiro não significam necessariamente caixa recebido.",
    })
    .onConflictDoNothing({ target: partners.externalId })
    .returning({ id: partners.id });

  const iesaPartnerId = iesaPartner?.id ?? (await getPartnerId(db, "iesa-nissan"));

  const [iesaContract] = await db
    .insert(contracts)
    .values({
      partnerId: iesaPartnerId,
      title: "Parceria pós-paga — Lavação Grupo IESA/Nissan",
      type: "parceria_pos_paga",
      status: "ativo",
      billingClosingDay: 1,
      dueDay: 10,
      baseValue: null, // variável por volume de lavações (R$ 70,00 cada) + eventuais adicionais
      source: "seed:contratos-reais",
      externalId: "contrato-iesa-nissan-lavacao",
      notes:
        "Fechamento no dia 1º, pagamento previsto até o dia 10. Valor normal por lavação: R$ 70,00. Pode haver adicionais. Forma de pagamento das faturas ainda não informada pelo proprietário.",
    })
    .onConflictDoNothing({ target: contracts.externalId })
    .returning({ id: contracts.id });

  const iesaContractId = iesaContract?.id ?? (await getContractId(db, "contrato-iesa-nissan-lavacao"));

  // Único evento financeiro confirmado: recebimento de R$ 900,00 em 10/07/2026 referente a
  // junho/2026, com nota fiscal emitida e forma de pagamento NÃO informada (armazenada como
  // "desconhecida" — nunca inventada).
  const [iesaReceivable] = await db
    .insert(receivables)
    .values({
      contractId: iesaContractId,
      partnerId: iesaPartnerId,
      referenceMonth: "2026-06-01",
      amount: "900.00",
      dueDate: "2026-07-10",
      status: "pago",
      source: "seed:contratos-reais",
      externalId: "iesa-recebivel-2026-06",
      notes: "Referente ao mês anterior (junho/2026), confirmado pelo proprietário.",
    })
    .onConflictDoNothing({ target: receivables.externalId })
    .returning({ id: receivables.id });

  const iesaReceivableId = iesaReceivable?.id ?? (await getReceivableId(db, "iesa-recebivel-2026-06"));

  await db
    .insert(payments)
    .values({
      receivableId: iesaReceivableId,
      amount: "900.00",
      paidAt: "2026-07-10",
      method: "desconhecido",
      invoiceIssued: true,
      source: "seed:contratos-reais",
      externalId: "iesa-pagamento-2026-07-10",
      notes: "Forma de pagamento ainda não informada pelo proprietário — armazenada como desconhecida, nunca inventada.",
    })
    .onConflictDoNothing({ target: payments.externalId });

  await db
    .insert(invoices)
    .values({
      receivableId: iesaReceivableId,
      contractId: iesaContractId,
      number: null,
      issuedAt: null,
      amount: "900.00",
      source: "seed:contratos-reais",
      externalId: "iesa-nota-fiscal-2026-06",
      notes: "Nota fiscal emitida conforme confirmado pelo proprietário. Número e data de emissão não informados.",
    })
    .onConflictDoNothing({ target: invoices.externalId });

  // --- FUNERÁRIA — contrato mensal fixo ---
  const [funerariaPartner] = await db
    .insert(partners)
    .values({
      name: "Funerária",
      type: "contrato_mensal",
      source: "seed:contratos-reais",
      externalId: "funeraria",
      notes: "Nome fantasia completo não informado pelo proprietário nesta execução.",
    })
    .onConflictDoNothing({ target: partners.externalId })
    .returning({ id: partners.id });

  const funerariaPartnerId = funerariaPartner?.id ?? (await getPartnerId(db, "funeraria"));

  const [funerariaContract] = await db
    .insert(contracts)
    .values({
      partnerId: funerariaPartnerId,
      title: "Contrato mensal — Funerária",
      type: "mensalidade",
      status: "ativo",
      dueDay: 10,
      baseValue: "1000.00",
      source: "seed:contratos-reais",
      externalId: "contrato-funeraria",
      notes: "Dois veículos da funerária no pátio. Direito a 6 lavações mensais, não cumulativas (ver contract_benefits).",
    })
    .onConflictDoNothing({ target: contracts.externalId })
    .returning({ id: contracts.id });

  const funerariaContractId = funerariaContract?.id ?? (await getContractId(db, "contrato-funeraria"));

  await db
    .insert(contractBenefits)
    .values({
      contractId: funerariaContractId,
      description: "6 lavações mensais (Lavação funerária), não cumulativas",
      quantityPerPeriod: 6,
      periodType: "mensal",
      cumulative: false,
      source: "seed:contratos-reais",
      externalId: "beneficio-funeraria-6-lavacoes",
      notes: null,
    })
    .onConflictDoNothing({ target: contractBenefits.externalId });

  // --- DON JUAN FAST BURGER / JEAN — contrato mensal do truck, com reajuste programado ---
  const [donJuanPartner] = await db
    .insert(partners)
    .values({
      name: "Don Juan Fast Burger (Jean)",
      type: "contrato_mensal",
      source: "seed:contratos-reais",
      externalId: "don-juan-fast-burger",
      notes: null,
    })
    .onConflictDoNothing({ target: partners.externalId })
    .returning({ id: partners.id });

  const donJuanPartnerId = donJuanPartner?.id ?? (await getPartnerId(db, "don-juan-fast-burger"));

  await db
    .insert(contracts)
    .values({
      partnerId: donJuanPartnerId,
      title: "Contrato mensal do truck — Don Juan Fast Burger",
      type: "mensalidade",
      status: "ativo",
      dueDay: 15,
      // Valor varia por competência (R$ 550 até 15/07/2026, R$ 800 a partir de 15/08/2026) —
      // não há um único "valor base" correto, por isso fica null. Ver notes para o histórico.
      baseValue: null,
      source: "seed:contratos-reais",
      externalId: "contrato-don-juan-fast-burger",
      notes:
        "R$ 550,00 até 15/07/2026; R$ 800,00 a partir de 15/08/2026. Nenhum recebimento específico foi confirmado pelo proprietário nesta execução — nenhuma receivable foi criada para este contrato.",
    })
    .onConflictDoNothing({ target: contracts.externalId });

  console.log("Seed de contratos/contas a receber aplicado (ou já existente — idempotente).");
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de contratos:", error instanceof Error ? error.message : error);
  process.exit(1);
});
