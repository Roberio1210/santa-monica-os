import "server-only";
import { fetchOperationalOrders, type OperationalOrder } from "@/lib/integrations/jumppark/operations-summary";
import { saoPauloDateISO } from "@/lib/utils/timezone";

/**
 * Missão Z4 — candidatos a pós-venda do dia. Fonte: `fetchOperationalOrders` (mesma função real
 * já usada por `full_period_comparison`/`/movimentacoes` — nenhuma consulta nova ao JumpPark),
 * que já devolve telefone/placa MASCARADOS por padrão (`clientPhoneMasked`/`plateMasked`) — nunca
 * enviamos o dado sem máscara ao Zézinho (mesma regra explícita de `operational-view.ts`).
 *
 * Importante (achado da auditoria desta missão): os clientes atendidos HOJE vêm do JumpPark
 * (sistema externo, só nome em texto livre + telefone/placa mascarados) — um domínio DIFERENTE
 * do CRM interno (`attendance`/`crm-intelligente`, usado por `inactiveCustomers.ts`). Não existe
 * chave confiável para cruzar as duas fontes por cliente sem risco de mismatch (nome duplicado,
 * grafia diferente) — por isso a mensagem aqui é gerada por uma função própria, mais simples,
 * baseada só no que o JumpPark realmente confirma (nome, veículo, serviço), e NUNCA reaproveita
 * `generateCustomerMessage` (que exige um `CustomerProfile` do domínio interno).
 */

export type PostSaleCategory = "A" | "B" | "C" | "D";

export const POST_SALE_CATEGORY_LABEL: Record<PostSaleCategory, string> = {
  A: "Solicitar avaliação Google",
  B: "Verificar satisfação antes de pedir avaliação",
  C: "Não abordar agora",
  D: "Situação requer atenção humana",
};

export interface PostSaleCandidate {
  orderExternalId: string;
  customerName: string | null;
  vehicleModel: string;
  serviceNames: string[];
  phoneMasked: string | null;
  category: PostSaleCategory;
  categoryReason: string;
  messageDraft: string;
}

const REVIEW_WORTHY = /lava|higieniz|cristaliz/i;
const FOLLOW_UP_FIRST = /poliment|vitrific|far[oó]is|far[oó]l|couro|plastic/i;
const LOW_TICKET_ONLY = /estacionamento|ozônio|ozonio/i;

/** Pura — nunca faz I/O. Nunca detecta categoria D: nenhuma fonte real de reclamação/insatisfação está disponível hoje (ver relatório da missão) — sempre exige checagem humana para esse caso. */
export function classifyPostSale(order: Pick<OperationalOrder, "services">): { category: PostSaleCategory; reason: string } {
  const names = order.services.map((s) => s.description).join(" | ");
  if (FOLLOW_UP_FIRST.test(names)) return { category: "B", reason: "Serviço de resultado técnico (polimento/vitrificação/faróis/couro/plásticos) — vale confirmar satisfação antes de pedir avaliação." };
  if (REVIEW_WORTHY.test(names)) return { category: "A", reason: "Lavação/higienização concluída — bom candidato a pedido de avaliação." };
  if (LOW_TICKET_ONLY.test(names)) return { category: "C", reason: "Serviço pontual (estacionamento/ozônio) — não é prioridade de pós-venda hoje." };
  return { category: "C", reason: "Serviço não reconhecido automaticamente — revisar manualmente antes de abordar." };
}

function firstName(name: string | null): string {
  if (!name) return "tudo bem";
  return name.trim().split(" ")[0];
}

/** Pura. Nunca usa a mesma frase para todo mundo (varia por categoria + serviço + veículo real). Nunca inventa modelo de veículo. Usa "seu {veículo}" (mesmo padrão gramaticalmente neutro de `crm-intelligente/messages.ts`) — nunca tenta flexionar artigo por gênero do nome do modelo. */
export function draftPostSaleMessage(order: Pick<OperationalOrder, "clientName" | "vehicleModel" | "services">, category: PostSaleCategory): string {
  const name = firstName(order.clientName);
  const vehicleMention = order.vehicleModel && order.vehicleModel.trim().length > 0 ? `seu ${order.vehicleModel}` : "seu veículo";
  const service = (order.services[0]?.description ?? "o serviço de hoje").toLowerCase();

  if (category === "A") {
    return `Oi, ${name}! Tudo bem? Passando para saber o que achou do resultado de ${service} em ${vehicleMention}. Se ficou satisfeito, adoraríamos que deixasse uma avaliação pra gente — ajuda muito!`;
  }
  if (category === "B") {
    return `Oi, ${name}! Tudo bem? Ficou tudo certo com ${vehicleMention} depois de ${service}? Qualquer detalhe que quiser ajustar, é só chamar.`;
  }
  return `Oi, ${name}! Passando para agradecer a confiança em cuidar de ${vehicleMention} com a gente hoje.`;
}

export interface PostSaleResult {
  jumpparkConfigured: boolean;
  error: string | null;
  candidates: PostSaleCandidate[];
}

export async function fetchPostSaleCandidates(): Promise<PostSaleResult> {
  const todayIso = saoPauloDateISO();
  const { orders, jumpparkConfigured, error } = await fetchOperationalOrders(todayIso, todayIso);

  const candidates: PostSaleCandidate[] = orders
    .filter((o) => o.services.length > 0)
    .map((order) => {
      const { category, reason } = classifyPostSale(order);
      return {
        orderExternalId: order.externalId,
        customerName: order.clientName,
        vehicleModel: order.vehicleModel,
        serviceNames: order.services.map((s) => s.description),
        phoneMasked: order.clientPhoneMasked,
        category,
        categoryReason: reason,
        messageDraft: draftPostSaleMessage(order, category),
      };
    });

  return { jumpparkConfigured, error, candidates };
}
