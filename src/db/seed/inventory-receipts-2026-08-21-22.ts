import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { inventoryItems, inventoryMovements } from "@/db/schema";
import { computeWeightedAverageCost } from "@/lib/inventory/weighted-average-cost";

/**
 * Missão — Atualização controlada do estoque e patrimônio operacional (compras 21/22-08-2026).
 *
 * Auditoria prévia (2026-08-24): "Glaco" (Soft99, quimico_volume, 120ml, unitCost null) já
 * existia — externalId "glaco-soft99", já com uso operacional confirmado (cristalização/proteção
 * de vidros) desde a Missão Z3.2/Z3.3. A compra confirmada nesta missão ("Glaco Max", Soft99,
 * 300ml, NF 22/08/2026, R$162,00) é registrada como ENTRADA sobre este mesmo item — nunca cria um
 * segundo produto. Se "Glaco Max" for, na prática, uma fórmula tecnicamente distinta do "Glaco"
 * padrão (não apenas uma embalagem maior do mesmo produto), o gestor deve confirmar/desdobrar —
 * documentado na nota da movimentação, nunca decidido silenciosamente aqui.
 *
 * Nenhum outro produto (pincéis/escovas/pulverizadores/suporte) existia no estoque — confirmado
 * por busca por nome/marca antes de escrever qualquer linha.
 *
 * Classificação usa o enum `item_classification` já existente (nenhuma coluna/enum novo criado):
 * ferramenta (pincéis/escovas), equipamento (pulverizadores, mesmo valor já usado pelo
 * "Pulverizador Azul de Spray Contínuo" Vonixx existente), patrimonio (suporte/prateleiras — a
 * opção mais próxima de "mobiliário/estrutura" já disponível no enum).
 *
 * Datas: quando a missão não deu uma data específica por item (pincéis/escovas/suporte, só o
 * cabeçalho "compras em 21 e 22/08/2026"), usa-se 21/08/2026 (a primeira das duas datas
 * confirmadas) — nunca inventado, sempre documentado na nota de cada movimentação para auditoria.
 *
 * Idempotente: entrada do Glaco usa `external_id` de movimentação próprio (nunca soma a mesma
 * entrada duas vezes); itens novos usam `external_id` único (ON CONFLICT DO NOTHING).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  const log: string[] = [];
  const RESPONSIBLE = "Robério";
  const SOURCE = "seed:compras-2026-08-21-22";

  // ---------------------------------------------------------------------------
  // 1) Glaco (Soft99) — entrada de 300ml (NF "Glaco Max", 22/08/2026, R$162,00)
  // ---------------------------------------------------------------------------
  {
    const itemExternalId = "glaco-soft99";
    const movementExternalId = "compra-2026-08-22:glaco-max-300ml";

    const [existingMovement] = await db.select({ id: inventoryMovements.id }).from(inventoryMovements).where(eq(inventoryMovements.externalId, movementExternalId)).limit(1);
    if (existingMovement) {
      log.push("Glaco: entrada de 300ml já havia sido aplicada anteriormente — nada a fazer (idempotente).");
    } else {
      const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.externalId, itemExternalId)).limit(1);
      if (!item) {
        log.push(`AVISO: item "${itemExternalId}" não encontrado — entrada do Glaco pulada (nunca criado um segundo produto sem confirmação).`);
      } else {
        const previousBalance = Number(item.currentQuantity);
        const enteredQuantity = 300; // ml — conteúdo confirmado da NF
        const unitPricePaid = Math.round((162.0 / 300) * 100) / 100; // R$0,54/ml — derivado da NF (R$162,00 / 300ml), nunca um custo inventado
        const newBalance = previousBalance + enteredQuantity;
        const currentUnitCost = item.unitCost !== null ? Number(item.unitCost) : null;
        const newUnitCost = computeWeightedAverageCost({ currentQuantity: previousBalance, currentUnitCost, enteredQuantity, unitPricePaid });

        await db.transaction(async (tx) => {
          await tx.update(inventoryItems).set({ currentQuantity: String(newBalance), unitCost: String(newUnitCost), updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));
          await tx.insert(inventoryMovements).values({
            itemId: item.id,
            type: "compra",
            quantity: String(enteredQuantity),
            unit: "ml",
            date: "2026-08-22",
            responsible: RESPONSIBLE,
            reference: null,
            supplier: null,
            unitPricePaid: String(unitPricePaid),
            previousBalance: String(previousBalance),
            newBalance: String(newBalance),
            source: SOURCE,
            externalId: movementExternalId,
            notes:
              'Compra confirmada como "Glaco Max" (Soft99, 300 ml, NF de 22/08/2026, R$162,00) — registrada como entrada do item já cadastrado "Glaco" (mesma marca, mesmo uso operacional de cristalização/proteção de vidros). Embalagem previamente cadastrada era de 120 ml; esta entrada é de uma embalagem de 300 ml — se "Glaco Max" for tecnicamente uma fórmula distinta do "Glaco" padrão, o gestor deve confirmar/desdobrar em um segundo item.',
          });
        });

        log.push(`Glaco: entrada de 300ml registrada. Saldo: ${previousBalance}ml -> ${newBalance}ml. Custo médio ponderado: ${currentUnitCost ?? "null"} -> R$${newUnitCost}/ml.`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2) Itens novos — ferramentas / equipamentos / patrimônio (nunca consumíveis)
  // ---------------------------------------------------------------------------
  interface NewItemInput {
    externalId: string;
    name: string;
    brand: string;
    category: (typeof inventoryItems.$inferInsert)["category"];
    classification: (typeof inventoryItems.$inferInsert)["classification"];
    unitCost: number | null;
    date: string;
    notes: string;
  }

  const NEW_ITEMS: NewItemInput[] = [
    {
      externalId: "kit-pinceis-work-speed-kers",
      name: "Kit 5 Pincéis para Parafusadeira Work Speed",
      brand: "Kers",
      category: "Boinas e acessórios",
      classification: "ferramenta",
      unitCost: 62.99,
      date: "2026-08-21",
      notes: 'Ferramenta reutilizável — NÃO sofre baixa automática por serviço, NÃO participa de cálculo de consumo químico. Data de compra não informada por item na missão (cabeçalho: "compras em 21 e 22/08/2026") — usada 21/08/2026, a primeira das duas datas confirmadas.',
    },
    {
      externalId: "escova-cintos-full-detail",
      name: "Escova para Cintos de Segurança",
      brand: "Full Detail",
      category: "Boinas e acessórios",
      classification: "ferramenta",
      unitCost: 30.43,
      date: "2026-08-21",
      notes: 'Ferramenta reutilizável — NÃO sofre baixa automática por serviço, NÃO participa de cálculo de consumo químico. Data de compra não informada por item na missão — usada 21/08/2026, a primeira das duas datas confirmadas.',
    },
    {
      externalId: "escova-seat-belt-dual-clean-kers",
      name: "Escova Seat Belt Dual Clean",
      brand: "Kers",
      category: "Boinas e acessórios",
      classification: "ferramenta",
      unitCost: 32.0,
      date: "2026-08-21",
      notes: 'Ferramenta reutilizável — NÃO sofre baixa automática por serviço, NÃO participa de cálculo de consumo químico. Data de compra não informada por item na missão — usada 21/08/2026, a primeira das duas datas confirmadas.',
    },
    {
      externalId: "pulverizador-snow-foam-2l-amarelo",
      name: "Pulverizador Manual Snow Foam 2L — Amarelo (3 bicos)",
      brand: "Não informado",
      category: "Equipamentos",
      classification: "equipamento",
      unitCost: null,
      date: "2026-08-22",
      notes: "Equipamento reutilizável — NÃO sofre baixa automática por lavação. Comprado em 21/08/2026, entregue em 22/08/2026 (data de entrada = entrega). Marca não confirmada na missão — nunca inventada (\"Não informado\", mesmo valor já usado em outros itens do estoque). Valor não informado/confiável — nunca inventado.",
    },
    {
      externalId: "pulverizador-snow-foam-2l-preto",
      name: "Pulverizador Manual Snow Foam 2L — Preto",
      brand: "Não informado",
      category: "Equipamentos",
      classification: "equipamento",
      unitCost: null,
      date: "2026-08-22",
      notes: "Equipamento reutilizável — NÃO sofre baixa automática por lavação. Comprado em 21/08/2026, entregue em 22/08/2026 (data de entrada = entrega). Marca não confirmada na missão — nunca inventada. Valor não informado/confiável — nunca inventado.",
    },
    {
      externalId: "pulverizador-snow-foam-2l-vermelho",
      name: "Pulverizador Manual Snow Foam 2L — Vermelho (3 bicos)",
      brand: "Não informado",
      category: "Equipamentos",
      classification: "equipamento",
      unitCost: null,
      date: "2026-08-22",
      notes: "Equipamento reutilizável — NÃO sofre baixa automática por lavação. Comprado em 21/08/2026, entregue em 22/08/2026 (data de entrada = entrega). Marca não confirmada na missão — nunca inventada. Valor não informado/confiável — nunca inventado.",
    },
    {
      externalId: "suporte-organizador-jdr-2-prateleiras",
      name: "Suporte Organizador JDR Estética Automotiva + 2 Prateleiras",
      brand: "JDR",
      category: "Outros",
      classification: "patrimonio",
      unitCost: null,
      date: "2026-08-21",
      notes: "Mobiliário/estrutura operacional — NÃO é consumível, NÃO sofre baixa de estoque. Nota fiscal/valor ainda não fornecidos nesta missão — nunca inventado; atualizar quando o documento existir. Data de compra não informada especificamente — usada 21/08/2026, a primeira das duas datas confirmadas no cabeçalho da missão.",
    },
  ];

  for (const it of NEW_ITEMS) {
    const [existing] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.externalId, it.externalId)).limit(1);
    if (existing) {
      log.push(`${it.name}: já existia (externalId "${it.externalId}") — nada a fazer.`);
      continue;
    }

    const [inserted] = await db
      .insert(inventoryItems)
      .values({
        name: it.name,
        brand: it.brand,
        category: it.category,
        currentQuantity: "1",
        unit: "unidade",
        packageCapacity: null,
        packageCount: null,
        condition: "lacrado",
        minimumStock: null,
        idealStock: null,
        unitCost: it.unitCost !== null ? String(it.unitCost) : null,
        classification: it.classification,
        lastCountDate: it.date,
        quantityStatus: "confirmed",
        source: SOURCE,
        externalId: it.externalId,
        notes: it.notes,
      })
      .onConflictDoNothing({ target: inventoryItems.externalId })
      .returning({ id: inventoryItems.id });

    if (!inserted) {
      log.push(`${it.name}: conflito ao inserir (execução concorrente?) — pulado.`);
      continue;
    }

    const movementExternalId = `compra-2026-08-2x:${it.externalId}`;
    await db
      .insert(inventoryMovements)
      .values({
        itemId: inserted.id,
        type: "compra",
        quantity: "1",
        unit: "unidade",
        date: it.date,
        responsible: RESPONSIBLE,
        reference: null,
        supplier: null,
        unitPricePaid: it.unitCost !== null ? String(it.unitCost) : null,
        previousBalance: "0",
        newBalance: "1",
        source: SOURCE,
        externalId: movementExternalId,
        notes: it.notes,
      })
      .onConflictDoNothing({ target: inventoryMovements.externalId });

    log.push(`${it.name}: item novo criado (classification="${it.classification}") + movimentação de compra registrada.`);
  }

  console.log(log.join("\n"));
  await client.end();
}

main().catch((error) => {
  console.error("Falha ao aplicar compras 21/22-08-2026:", error instanceof Error ? error.message : error);
  process.exit(1);
});
