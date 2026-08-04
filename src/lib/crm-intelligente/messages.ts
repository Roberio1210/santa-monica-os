import type { Customer, Vehicle } from "@/lib/attendance/types";
import type { CustomerProfile } from "@/lib/crm-intelligente/types";

/**
 * Geração de mensagens personalizadas (Missão 25, seção 9) — texto sempre montado só a partir de
 * dado real já carregado (nome, veículo, última visita, últimos serviços). Nunca afirma um
 * problema sem evidência, nunca é enviada automaticamente (nenhuma função aqui faz I/O) — o
 * chamador sempre trata o resultado como rascunho revisável.
 */
export type MessageType = "retorno" | "agradecimento" | "lembrete_manutencao" | "aviso_protecao" | "convite_lavagem" | "vip" | "recuperacao" | "pos_servico";

export const MESSAGE_TYPE_LABEL: Record<MessageType, string> = {
  retorno: "Mensagem de retorno",
  agradecimento: "Agradecimento",
  lembrete_manutencao: "Lembrete de manutenção",
  aviso_protecao: "Aviso de proteção próxima do vencimento",
  convite_lavagem: "Convite para nova lavagem",
  vip: "Mensagem de cliente VIP",
  recuperacao: "Mensagem de recuperação",
  pos_servico: "Mensagem pós-serviço",
};

export interface GeneratedMessage {
  type: MessageType;
  text: string;
  /** Avisos honestos sobre limitação do texto (ex.: sem veículo conhecido) — nunca escondidos do revisor. */
  warnings: string[];
}

function firstName(name: string | null): string {
  if (!name) return "tudo bem";
  return name.trim().split(" ")[0];
}

function vehicleMention(vehicle: Vehicle | null): { mention: string; warning: string | null } {
  if (!vehicle) return { mention: "seu veículo", warning: "Nenhum veículo vinculado a este cliente — mensagem usa termo genérico." };
  return { mention: `seu ${vehicle.model}`, warning: null };
}

/**
 * Gera o texto de uma mensagem personalizada. Nunca lança — limitações reais (sem veículo, sem
 * último serviço, sem última visita) viram avisos no rascunho, não impedem a geração.
 */
export function generateCustomerMessage(
  type: MessageType,
  params: { customer: Customer; profile: CustomerProfile; vehicle: Vehicle | null; lastServiceNames: string[] },
): GeneratedMessage {
  const { customer, profile, vehicle, lastServiceNames } = params;
  const name = firstName(customer.name);
  const { mention, warning } = vehicleMention(vehicle);
  const warnings: string[] = warning ? [warning] : [];
  const lastService = lastServiceNames[0] ?? null;
  if (!lastService) warnings.push("Nenhum serviço recente conhecido — mensagem não menciona serviço específico.");

  let text: string;
  switch (type) {
    case "retorno": {
      const days = profile.daysSinceLastVisit;
      const daysMention = days !== null ? `Já faz ${days} dia(s) desde a sua última visita` : "Faz um tempo que você não aparece por aqui";
      text = `Olá, ${name}! Tudo bem? ${daysMention}${lastService ? `, quando fizemos ${lastService}` : ""} com ${mention} na Sta Monica. Queria saber se está tudo certo e se podemos ajudar a cuidar dele(a) novamente. Temos horário disponível esta semana — quer que eu separe um pra você?`;
      break;
    }
    case "agradecimento":
      text = `Olá, ${name}! Passando para agradecer a confiança em cuidar de ${mention} com a gente. Qualquer coisa que precisar, é só chamar.`;
      break;
    case "lembrete_manutencao":
      text = `Olá, ${name}! Lembrete rápido: já faz um tempo desde o último cuidado com ${mention}${lastService ? ` (${lastService})` : ""}. Manutenção regular ajuda a manter o resultado por mais tempo — quer agendar uma avaliação?`;
      break;
    case "aviso_protecao":
      text = `Olá, ${name}! Passando para lembrar que a proteção aplicada em ${mention} pode estar próxima do período recomendado de renovação. Quer que a gente dê uma olhada para confirmar o estado atual antes de qualquer decisão?`;
      break;
    case "convite_lavagem": {
      const alreadyWashed = lastServiceNames.some((s) => s.toLowerCase().includes("lava"));
      if (alreadyWashed) warnings.push("Última visita já incluiu lavação — considere revisar antes de enviar este convite.");
      text = `Olá, ${name}! Que tal aproveitar para cuidar de ${mention} com uma lavação completa? Temos horários disponíveis esta semana.`;
      break;
    }
    case "vip":
      text = `Olá, ${name}! Você é um dos nossos clientes mais fiéis na Sta Monica, e queríamos que soubesse que isso não passa despercebido. Obrigado por confiar em nós com ${mention} — estamos sempre à disposição.`;
      break;
    case "recuperacao": {
      const days = profile.daysSinceLastVisit;
      text = `Olá, ${name}! Notamos que faz ${days !== null ? `${days} dia(s)` : "um bom tempo"} desde sua última visita com ${mention}. Sentimos sua falta! Se houve algo que possamos melhorar, adoraríamos ouvir. Se quiser voltar, temos uma condição especial para te receber de novo.`;
      break;
    }
    case "pos_servico":
      text = `Olá, ${name}! Ficou tudo certo com ${mention}${lastService ? ` depois d${lastService.toLowerCase().startsWith("a") ? "a" : "o"} ${lastService}` : ""}? Qualquer detalhe que precisar ajustar, é só nos chamar.`;
      break;
  }

  return { type, text, warnings };
}
