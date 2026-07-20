import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import type { BusinessObjective } from "@/lib/zezinho/objective/types";
import type { Fact, Finding, Recommendation } from "@/lib/zezinho/reasoning/types";

/**
 * Recomendações (Etapa 4, quinta camada) — nascem do objetivo + dos fatos/achados já produzidos,
 * nunca de nada novo. Cada recomendação carrega ação, motivo, evidência, prioridade, risco e como
 * verificar (seção "RECOMENDAÇÕES" do pedido). No máximo 3, para nunca virar um despejo.
 */

function byKey(facts: Fact[]): Map<string, Fact> {
  return new Map(facts.map((f) => [f.key, f]));
}

function recommendClientRetention(facts: Fact[]): Recommendation[] {
  const atRiskCustomers = facts.filter((f) => f.key.startsWith("crm_customer_"));
  if (atRiskCustomers.length === 0) {
    return [{ action: "Nenhuma ligação prioritária hoje.", reason: "Não há clientes marcados como em risco ou perdidos no CRM neste momento.", evidenceFactKeys: [], priority: "baixa", risk: null, howToVerify: "Revisar a lista de clientes novamente em alguns dias." }];
  }
  return atRiskCustomers.slice(0, 3).map((c, i) => ({
    action: `Ligar para ${c.label} hoje.`,
    reason: c.statement,
    evidenceFactKeys: [c.key],
    priority: i === 0 ? "alta" : "media",
    risk: "O cliente pode já ter migrado para outro fornecedor.",
    howToVerify: "Confirmar se o cliente retorna ou agenda um novo serviço após o contato.",
  }));
}

function recommendServiceMix(facts: Fact[], entities: ExtractedEntities): Recommendation[] {
  const f = byKey(facts);
  const recs: Recommendation[] = [];
  const ticket = f.get("avgTicket");
  const bronze = f.get("packageBronze");

  if (entities.packageMentioned === "Bronze") {
    recs.push({
      action: "Respeitar a escolha do cliente pela Bronze — não insistir no upgrade do pacote inteiro.",
      reason: "Pressionar por um pacote maior tende a afastar quem já decidiu o que quer.",
      evidenceFactKeys: [],
      priority: "alta",
      risk: "Insistir demais pode gerar rejeição e perder a venda toda.",
      howToVerify: "Acompanhar se a taxa de recusa em aborgagens consultivas é menor que em ofertas diretas de upgrade.",
    });
    recs.push({
      action: "Perguntar sobre o estado do veículo (faróis opacos, interior sujo) e oferecer um adicional pontual, não o pacote inteiro.",
      reason: "Adicionais avulsos têm barreira de aceitação menor que trocar de pacote.",
      evidenceFactKeys: [],
      priority: "media",
      risk: null,
      howToVerify: "Medir quantos adicionais avulsos são aceitos com essa abordagem.",
    });
    return recs;
  }

  if (ticket && ticket.direction === "queda") {
    recs.push({
      action: "Priorizar a oferta de adicionais (higienização, revitalização de faróis, vitrificação) no momento da entrada do veículo.",
      reason: ticket.statement,
      evidenceFactKeys: [ticket.key],
      priority: "alta",
      risk: "Cliente pode recusar o adicional se a oferta parecer forçada.",
      howToVerify: "Acompanhar o ticket médio na próxima semana.",
    });
  }

  if (bronze && bronze.direction === "aumento") {
    recs.push({
      action: "Na entrada, perguntar o que o cliente busca (rapidez ou resultado/durabilidade) antes de oferecer o upgrade de pacote.",
      reason: bronze.statement,
      evidenceFactKeys: [bronze.key],
      priority: "media",
      risk: "Pressionar demais pode afastar o cliente.",
      howToVerify: "Ver se a taxa de conversão de Bronze para Silver/Gold sobe.",
    });
  }

  if (recs.length === 0) {
    recs.push({ action: "Manter a oferta atual — os números de mix/ticket não mostram um ponto de atenção claro agora.", reason: "Nenhum sinal de queda de ticket ou concentração excessiva em Bronze neste período.", evidenceFactKeys: [], priority: "baixa", risk: null, howToVerify: "Reavaliar no próximo período." });
  }

  return recs.slice(0, 3);
}

function recommendPricing(facts: Fact[], text: string): Recommendation[] {
  const f = byKey(facts);
  const ticket = f.get("avgTicket");
  const isDiscountQuestion = text.includes("desconto");

  if (isDiscountQuestion) {
    if (ticket && ticket.direction === "queda") {
      return [{
        action: "Eu testaria um desconto pontual e pequeno antes de generalizar — por exemplo, só para quem está decidindo entre você e outro fornecedor.",
        reason: `${ticket.statement} Isso sugere que o problema pode não ser só de conversão, e um desconto amplo pode piorar o ticket ainda mais.`,
        evidenceFactKeys: [ticket.key],
        priority: "media",
        risk: "Desconto generalizado pode virar expectativa permanente do cliente.",
        howToVerify: "Comparar a taxa de conversão e o ticket médio do grupo com desconto contra o restante por 2 semanas.",
      }];
    }
    return [{
      action: "Eu não daria desconto amplo agora — testaria primeiro em um grupo pequeno.",
      reason: "Sem sinal de queda no ticket médio, não há evidência de que o preço seja a barreira de conversão.",
      evidenceFactKeys: ticket ? [ticket.key] : [],
      priority: "media",
      risk: "Cortar preço sem necessidade reduz margem à toa.",
      howToVerify: "Rastrear se os clientes que não convertem mencionam preço como motivo antes de decidir por desconto.",
    }];
  }

  if (ticket && ticket.direction === "aumento") {
    return [{
      action: "Eu não mexeria no preço agora.",
      reason: `${ticket.statement} O ticket já está subindo organicamente.`,
      evidenceFactKeys: [ticket.key],
      priority: "baixa",
      risk: "Aumentar preço num momento de alta pode alienar clientes sensíveis a preço sem necessidade.",
      howToVerify: "Continuar acompanhando o ticket médio; só considerar aumento se ele estabilizar.",
    }];
  }

  return [{
    action: "Antes de aumentar preço, eu testaria outra coisa: reforçar a oferta de adicionais no atendimento atual.",
    reason: "Aumentar preço direto tem risco maior de perder cliente sensível a preço do que aumentar o ticket por adicional.",
    evidenceFactKeys: ticket ? [ticket.key] : [],
    priority: "media",
    risk: "Aumento de preço mal calibrado pode reduzir volume.",
    howToVerify: "Medir a taxa de aceitação de adicionais antes de decidir sobre preço.",
  }];
}

function recommendStaffing(facts: Fact[]): Recommendation[] {
  const f = byKey(facts);
  const vehicles = f.get("vehicles");
  const ticket = f.get("avgTicket");

  const parts: string[] = ["Não tenho produtividade individual da equipe."];
  if (vehicles && ticket) {
    parts.push(`Como indício operacional, consigo observar que ${vehicles.direction === "aumento" ? "o volume de veículos cresceu" : vehicles.direction === "queda" ? "o volume de veículos caiu" : "o volume de veículos ficou estável"} enquanto ${ticket.direction === "queda" ? "o ticket médio caiu" : ticket.direction === "aumento" ? "o ticket médio subiu" : "o ticket médio ficou estável"}.`);
  }

  return [{
    action: vehicles?.direction === "aumento" ? "Antes de contratar, eu testaria redistribuir os horários de pico com a equipe atual." : "Eu não contrataria agora com base só nesse indício.",
    reason: parts.join(" "),
    evidenceFactKeys: [vehicles?.key, ticket?.key].filter((k): k is string => !!k),
    priority: "media",
    risk: "Contratar sem dado real de capacidade pode gerar custo fixo desnecessário.",
    howToVerify: "Registrar horas de espera ou recusa de atendimento por falta de equipe antes de decidir.",
  }];
}

/**
 * `recipe_gap` é a chave de um ACHADO (`findings`), não de um fato — bug corrigido: a versão
 * anterior procurava essa chave dentro de `facts`, onde ela nunca existe, então a recomendação de
 * calibração nunca era gerada mesmo quando o alerta real de "serviços sem receita" estava presente.
 */
function recommendInventory(facts: Fact[], findings: Finding[]): Recommendation[] {
  const recipeGapFinding = findings.find((f) => f.key === "recipe_gap");
  if (recipeGapFinding) {
    const evidenceFact = facts.find((f) => f.key === recipeGapFinding.factKeys[0]);
    return [{
      action: "Calibrar as receitas de consumo dos serviços que ainda não têm — sem isso não dá para afirmar desperdício com segurança.",
      reason: recipeGapFinding.statement,
      evidenceFactKeys: evidenceFact ? [evidenceFact.key] : [],
      priority: "alta",
      risk: null,
      howToVerify: "Depois de calibrado, comparar consumo esperado vs. real por ordem em /estoque/calibracao.",
    }];
  }
  return [{
    action: "Acompanhar os itens quase no fim antes que faltem.",
    reason: "É o único sinal direto de estoque disponível agora.",
    evidenceFactKeys: facts.filter((f) => f.key === "inventory_near_empty").map((f) => f.key),
    priority: "media",
    risk: null,
    howToVerify: "Ver /estoque/produtos filtrando por itens quase vazios.",
  }];
}

function genericFromDiagnosis(mainStatement: string | null): Recommendation[] {
  if (!mainStatement) return [];
  return [{ action: "Acompanhar esse indicador de perto no próximo período.", reason: mainStatement, evidenceFactKeys: [], priority: "media", risk: null, howToVerify: "Comparar o mesmo número na próxima análise para confirmar se a tendência se mantém." }];
}

export function deriveRecommendations(facts: Fact[], findings: Finding[], objective: BusinessObjective | null, entities: ExtractedEntities, rawTextNormalized: string, mainHypothesis: string | null): Recommendation[] {
  switch (objective) {
    case "client_retention":
      return recommendClientRetention(facts);
    case "improve_service_mix":
      return recommendServiceMix(facts, entities);
    case "evaluate_pricing":
      return recommendPricing(facts, rawTextNormalized);
    case "staffing_capacity":
      return recommendStaffing(facts);
    case "reduce_costs":
      if (entities.topic === "estoque") return recommendInventory(facts, findings);
      return genericFromDiagnosis(mainHypothesis);
    default:
      return genericFromDiagnosis(mainHypothesis);
  }
}
