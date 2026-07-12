import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { financialAccounts, financialCategories, costCenters, recurringBillTemplates, suppliers } from "@/db/schema";

/**
 * Fundação do módulo Contas a Pagar (10/07/2026) — npm run db:seed:accounts-payable-foundation.
 * Roda depois de chart-of-accounts.ts (precisa das categorias/centros de custo já existirem).
 *
 * Cadastra fornecedores, contas financeiras e MODELOS de recorrência — nenhuma conta a pagar é
 * criada aqui. Nenhum CNPJ/telefone/e-mail/endereço foi inventado. Os dois acordos de dívida
 * (cartão/cheque especial e empréstimo) ficam com fornecedor nulo e `pendingData: true` porque o
 * credor ainda não foi informado pelo proprietário.
 */
type Db = ReturnType<typeof drizzle>;

async function getCategoryId(db: Db, externalId: string): Promise<string | null> {
  const [row] = await db.select({ id: financialCategories.id }).from(financialCategories).where(eq(financialCategories.externalId, externalId)).limit(1);
  return row?.id ?? null;
}

async function getCostCenterId(db: Db, externalId: string): Promise<string | null> {
  const [row] = await db.select({ id: costCenters.id }).from(costCenters).where(eq(costCenters.externalId, externalId)).limit(1);
  return row?.id ?? null;
}

async function getSupplierId(db: Db, externalId: string): Promise<string | null> {
  const [row] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.externalId, externalId)).limit(1);
  return row?.id ?? null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida. Configure-a antes de rodar este seed.");
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  // --- Fornecedores (11) ---
  await db
    .insert(suppliers)
    .values([
      { name: "Mota Imobiliária", source: "seed:contas-a-pagar", externalId: "fornecedor-mota-imobiliaria" },
      { name: "Celesc", source: "seed:contas-a-pagar", externalId: "fornecedor-celesc" },
      { name: "CASAN", source: "seed:contas-a-pagar", externalId: "fornecedor-casan" },
      {
        name: "JumpPark",
        contactName: "Sergio Felipe de Oliveira e Silva",
        taxId: "40841086850",
        source: "seed:contas-a-pagar",
        externalId: "fornecedor-jumppark",
      },
      { name: "Verisure", source: "seed:contas-a-pagar", externalId: "fornecedor-verisure" },
      { name: "Vivo — Telefonia", source: "seed:contas-a-pagar", externalId: "fornecedor-vivo-telefonia" },
      { name: "Vivo — Internet", source: "seed:contas-a-pagar", externalId: "fornecedor-vivo-internet" },
      { name: "Stylus Contabilidade", source: "seed:contas-a-pagar", externalId: "fornecedor-stylus-contabilidade" },
      { name: "Verde Car", source: "seed:contas-a-pagar", externalId: "fornecedor-verde-car" },
      { name: "Auto Leds", source: "seed:contas-a-pagar", externalId: "fornecedor-auto-leds" },
      { name: "Mercado Livre", source: "seed:contas-a-pagar", externalId: "fornecedor-mercado-livre" },
    ])
    .onConflictDoNothing({ target: suppliers.externalId });
  console.log("11 fornecedores aplicados (idempotente).");

  // --- Contas financeiras (3) ---
  await db
    .insert(financialAccounts)
    .values([
      {
        name: "Stone",
        type: "conta_pagamento",
        source: "seed:contas-a-pagar",
        externalId: "conta-stone",
        notes: "Recebimentos de cartão, Pix Stone e antecipação D+1.",
      },
      {
        name: "Ailos / CredCrea",
        type: "conta_bancaria",
        source: "seed:contas-a-pagar",
        externalId: "conta-ailos-credcrea",
      },
      {
        name: "Caixa físico",
        type: "dinheiro",
        fixedFundAmount: "100.00",
        source: "seed:contas-a-pagar",
        externalId: "conta-caixa-fisico",
        notes: "Fundo fixo desejado: R$ 100,00. Reposições são transferências, não despesas.",
      },
    ])
    .onConflictDoNothing({ target: financialAccounts.externalId });
  console.log("3 contas financeiras aplicadas (idempotente).");

  // --- Modelos de recorrência (10: 8 fixos + 2 variáveis) ---
  const ccAdministrativo = await getCostCenterId(db, "cc-administrativo");
  const ccEstacionamento = await getCostCenterId(db, "cc-estacionamento");

  const catAluguel = await getCategoryId(db, "despesa-aluguel");
  const catSistemas = await getCategoryId(db, "despesa-sistemas-e-assinaturas");
  const catTelefonia = await getCategoryId(db, "despesa-telefonia");
  const catInternet = await getCategoryId(db, "despesa-internet");
  const catContabilidade = await getCategoryId(db, "despesa-contabilidade");
  const catEmprestimos = await getCategoryId(db, "despesa-emprestimos-e-financiamentos");
  const catAgua = await getCategoryId(db, "despesa-agua");
  const catEnergia = await getCategoryId(db, "despesa-energia");

  const supMota = await getSupplierId(db, "fornecedor-mota-imobiliaria");
  const supJumpPark = await getSupplierId(db, "fornecedor-jumppark");
  const supVerisure = await getSupplierId(db, "fornecedor-verisure");
  const supVivoTelefonia = await getSupplierId(db, "fornecedor-vivo-telefonia");
  const supVivoInternet = await getSupplierId(db, "fornecedor-vivo-internet");
  const supStylus = await getSupplierId(db, "fornecedor-stylus-contabilidade");
  const supCasan = await getSupplierId(db, "fornecedor-casan");
  const supCelesc = await getSupplierId(db, "fornecedor-celesc");

  const missing = [catAluguel, catSistemas, catTelefonia, catInternet, catContabilidade, catEmprestimos, catAgua, catEnergia, ccAdministrativo, ccEstacionamento].some(
    (v) => v === null,
  );
  if (missing) {
    console.error(
      "Categorias/centros de custo necessários não encontrados. Rode 'npm run db:seed:chart-of-accounts' antes deste seed. Nenhuma recorrência foi criada.",
    );
    await client.end();
    process.exit(1);
  }

  await db
    .insert(recurringBillTemplates)
    .values([
      {
        description: "Aluguel + IPTU",
        supplierId: supMota,
        categoryId: catAluguel,
        costCenterId: ccAdministrativo,
        amount: "4750.00",
        dueDay: 5,
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-aluguel-iptu",
      },
      {
        description: "JumpPark",
        supplierId: supJumpPark,
        categoryId: catSistemas,
        costCenterId: ccEstacionamento,
        amount: "125.00",
        dueDay: 10,
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-jumppark",
      },
      {
        description: "Verisure",
        supplierId: supVerisure,
        categoryId: catSistemas,
        costCenterId: ccAdministrativo,
        amount: "276.11",
        dueDay: 5,
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-verisure",
      },
      {
        description: "Vivo — Telefonia",
        supplierId: supVivoTelefonia,
        categoryId: catTelefonia,
        costCenterId: ccAdministrativo,
        amount: "41.17",
        dueDay: 25,
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-vivo-telefonia",
      },
      {
        description: "Vivo — Internet",
        supplierId: supVivoInternet,
        categoryId: catInternet,
        costCenterId: ccAdministrativo,
        amount: "92.62",
        dueDay: 15,
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-vivo-internet",
      },
      {
        description: "Stylus Contabilidade",
        supplierId: supStylus,
        categoryId: catContabilidade,
        costCenterId: ccAdministrativo,
        amount: "406.60",
        dueDay: 10,
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-stylus-contabilidade",
      },
      {
        description: "Acordo referente a cartão e cheque especial",
        supplierId: null,
        categoryId: catEmprestimos,
        costCenterId: ccAdministrativo,
        amount: "2341.09",
        dueDay: 20,
        pendingData: true,
        notes: "Credor ainda não informado pelo proprietário — dados pendentes.",
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-acordo-cartao-cheque-especial",
      },
      {
        description: "Acordo referente a empréstimo",
        supplierId: null,
        categoryId: catEmprestimos,
        costCenterId: ccAdministrativo,
        amount: "1540.86",
        dueDay: 25,
        pendingData: true,
        notes: "Credor ainda não informado pelo proprietário — dados pendentes.",
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-acordo-emprestimo",
      },
      {
        description: "Água",
        supplierId: supCasan,
        categoryId: catAgua,
        costCenterId: ccAdministrativo,
        amount: null,
        variableAmount: true,
        dueDay: null,
        notes: "Valor variável por competência — não repetir o último valor como fixo. Dia de vencimento não informado.",
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-agua-casan",
      },
      {
        description: "Energia",
        supplierId: supCelesc,
        categoryId: catEnergia,
        costCenterId: ccAdministrativo,
        amount: null,
        variableAmount: true,
        dueDay: null,
        notes: "Valor variável por competência — não repetir o último valor como fixo. Dia de vencimento não informado.",
        source: "seed:contas-a-pagar",
        externalId: "recorrencia-energia-celesc",
      },
    ])
    .onConflictDoNothing({ target: recurringBillTemplates.externalId });
  console.log("10 modelos de recorrência aplicados (idempotente). Nenhuma conta a pagar foi criada — só as regras.");

  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar seed de fundação de Contas a Pagar:", error instanceof Error ? error.message : error);
  process.exit(1);
});
