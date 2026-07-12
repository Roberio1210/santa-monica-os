import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  accountsReceivable,
  contractBenefits,
  contractValuePeriods,
  contracts,
  invoices,
  partners,
  payments,
  services,
} from "@/db/schema";

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

async function getAccountsReceivableId(db: Db, externalIdValue: string): Promise<string> {
  const rows = await db
    .select({ id: accountsReceivable.id })
    .from(accountsReceivable)
    .where(eq(accountsReceivable.externalId, externalIdValue))
    .limit(1);
  if (!rows[0]) throw new Error(`Conta a receber não encontrada para external_id=${externalIdValue}`);
  return rows[0].id;
}

/**
 * Seed das 3 regras de contrato/parceria reais informadas pelo proprietário em 10/07/2026
 * (npm run db:seed:contracts). Idempotente via `external_id` único em cada tabela — rodar mais
 * de uma vez não duplica registros (ON CONFLICT DO NOTHING).
 *
 * Só registra em `accounts_receivable`/`payments`/`invoices` eventos financeiros confirmados
 * explicitamente pelo proprietário. Contratos sem um recebimento confirmado (Funerária, Don
 * Juan) ficam apenas com a regra estrutural (contrato + benefício/vigência) — nenhuma cobrança é
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
  // junho/2026 (competência do mês anterior), com nota fiscal emitida e forma de pagamento NÃO
  // informada (armazenada como "desconhecida" — nunca inventada). O caixa entra em 10/07/2026,
  // mas a competência (o período a que o valor se refere) permanece junho/2026 — essas duas
  // datas nunca devem ser confundidas na UI (ver /financeiro/contas-a-receber).
  const [iesaReceivable] = await db
    .insert(accountsReceivable)
    .values({
      partnerId: iesaPartnerId,
      contractId: iesaContractId,
      description: "Parceria IESA/Nissan — lavações de junho/2026",
      competenceDate: "2026-06-01",
      issueDate: null,
      dueDate: "2026-07-10",
      expectedAmount: "900.00",
      receivedAmount: "900.00",
      outstandingAmount: "0.00",
      status: "paid",
      paymentMethod: "desconhecido",
      invoiceNumber: null,
      invoiceIssued: true,
      receivedAt: "2026-07-10",
      source: "seed:contratos-reais",
      externalId: "iesa-recebivel-2026-06",
      notes:
        "Recebido em 10/07/2026, mas referente à competência de junho/2026. Registros do JumpPark lançados como dinheiro não significam necessariamente caixa recebido — este valor confirma o recebimento real relatado pelo proprietário.",
    })
    .onConflictDoNothing({ target: accountsReceivable.externalId })
    .returning({ id: accountsReceivable.id });

  const iesaReceivableId = iesaReceivable?.id ?? (await getAccountsReceivableId(db, "iesa-recebivel-2026-06"));

  await db
    .insert(payments)
    .values({
      accountsReceivableId: iesaReceivableId,
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
      accountsReceivableId: iesaReceivableId,
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
      notes: "Pagamento realizado em nome de Elana Casanova (informado pelo proprietário no módulo Contas a Receber, 12/07/2026).",
    })
    .onConflictDoNothing({ target: partners.externalId })
    .returning({ id: partners.id });

  const donJuanPartnerId = donJuanPartner?.id ?? (await getPartnerId(db, "don-juan-fast-burger"));

  const [donJuanContract] = await db
    .insert(contracts)
    .values({
      partnerId: donJuanPartnerId,
      title: "Contrato mensal do truck — Don Juan Fast Burger",
      type: "mensalidade",
      status: "ativo",
      dueDay: 15,
      // Valor varia por competência (R$ 550 até 15/07/2026, R$ 800 a partir de 15/08/2026) —
      // não há um único "valor base" correto, por isso fica null. A vigência exata está em
      // contract_value_periods (abaixo).
      baseValue: null,
      source: "seed:contratos-reais",
      externalId: "contrato-don-juan-fast-burger",
      notes:
        "R$ 550,00 até 15/07/2026; R$ 800,00 a partir de 15/08/2026. Nenhum recebimento específico foi confirmado pelo proprietário nesta execução — nenhuma conta a receber foi criada para este contrato, apenas a regra de vigência.",
    })
    .onConflictDoNothing({ target: contracts.externalId })
    .returning({ id: contracts.id });

  const donJuanContractId = donJuanContract?.id ?? (await getContractId(db, "contrato-don-juan-fast-burger"));

  await db
    .insert(contractValuePeriods)
    .values([
      {
        contractId: donJuanContractId,
        amount: "550.00",
        effectiveFrom: null, // data de início real não informada — nunca inferida
        effectiveUntil: "2026-07-15",
        source: "seed:contratos-reais",
        externalId: "don-juan-valor-550",
        notes: "Vigente até 15/07/2026 (data informada pelo proprietário). Início da vigência não informado.",
      },
      {
        contractId: donJuanContractId,
        amount: "800.00",
        effectiveFrom: "2026-08-15",
        effectiveUntil: null,
        source: "seed:contratos-reais",
        externalId: "don-juan-valor-800",
        notes:
          "Vigente a partir de 15/08/2026 (data informada pelo proprietário). O período entre 16/07/2026 e 14/08/2026 não foi coberto por nenhuma informação do proprietário — não foi inventado nenhum valor para essa lacuna.",
      },
    ])
    .onConflictDoNothing({ target: contractValuePeriods.externalId });

  // --- WECHARGE — cliente corporativo do Estacionamento ---
  // Informado pelo proprietário no módulo Contas a Receber (12/07/2026). Sem regra de
  // cobrança/vigência confirmada ainda (nem valor, nem periodicidade) — por isso só o partner é
  // criado aqui, sem contrato. Tipo "outro" porque não se sabe se é parceria pós-paga ou
  // mensalidade. Cada conta a receber lançada para este cliente informa o centro de custo
  // Estacionamento diretamente (ver /financeiro/contas-a-receber).
  await db
    .insert(partners)
    .values({
      name: "WeCharge",
      type: "outro",
      source: "seed:contas-a-receber",
      externalId: "wecharge",
      notes: "Cliente corporativo do Estacionamento. Regra de cobrança/vigência ainda não confirmada pelo proprietário.",
    })
    .onConflictDoNothing({ target: partners.externalId });

  // Backfill idempotente: quando o partner Don Juan já existia (seed anterior, sem esta nota),
  // grava o dado real informado agora. Não sobrescreve nenhuma nota já preenchida manualmente.
  await db
    .update(partners)
    .set({ notes: "Pagamento realizado em nome de Elana Casanova (informado pelo proprietário no módulo Contas a Receber, 12/07/2026)." })
    .where(and(eq(partners.externalId, "don-juan-fast-burger"), isNull(partners.notes)));

  console.log("Seed de contratos/contas a receber aplicado (ou já existente — idempotente).");
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de contratos:", error instanceof Error ? error.message : error);
  process.exit(1);
});
