import { formatCurrency } from "@/lib/utils/format";
import { metricSentence } from "@/lib/zezinho/response-builder";
import { normalize } from "@/lib/zezinho/date-parser";
import { getAiProviderConfig, type AiProviderConfig } from "@/lib/zezinho/ai-provider";
import type { ManagerialPlan } from "@/lib/zezinho/planner/managerialPlan";
import type { ZezinhoAnswer, ZezinhoLink } from "@/lib/zezinho/types";

/**
 * Narrador gerencial (Sprint 4.0, Z4) — único ponto que transforma um `ManagerialPlan` em prosa.
 * Substitui por completo o narrador antigo (`narrator/narrate.ts`, removido nesta checkpoint):
 * nada de switch por intenção única, nada de template desconectado do contexto. Tudo aqui é
 * composto a partir do que o `ManagerialPlan` já trouxe — nenhum número, tendência ou
 * causalidade é calculado neste arquivo, só a prosa ao redor do que já foi apurado.
 *
 * Comprimento e profundidade variam por `plan.questionScope` (seção 2 do checkpoint) — nunca a
 * mesma estrutura de seções para "Oi." e para "Como estamos hoje?".
 */

export interface NarrateOptions {
  /** "Bom dia"/"Boa tarde"/"Boa noite", calculado pelo chamador a partir do horário atual — o narrador nunca lê o relógio sozinho, para continuar puro e testável. */
  greetingWord: string;
  usedOpeners: string[];
  /** Injetável nos testes — por padrão lê o ambiente real via `getAiProviderConfig()`. */
  aiConfig?: AiProviderConfig;
}

export interface NarrateResult {
  answer: ZezinhoAnswer;
  openerUsed: string | null;
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
}

function pick(candidates: string[], used: string[]): string {
  const unused = candidates.filter((c) => !used.includes(c));
  return unused[0] ?? candidates[0];
}

// --- Leitores de fatos naturais a partir do OperationalContext (nunca recalculam nada) ---

function describeMovement(plan: ManagerialPlan): string | null {
  const jp = plan.context.byCapability.jumppark_period_summary;
  if (!jp || jp.id !== "jumppark_period_summary" || jp.status !== "ok") return null;
  const revenue = jp.metrics.find((m) => m.key === "revenue");
  const vehicles = jp.metrics.find((m) => m.key === "vehicles");
  const avgTicket = jp.metrics.find((m) => m.key === "avgTicket");
  if (!revenue || !vehicles) return null;

  if (revenue.b === null) {
    const ticketPart = avgTicket && avgTicket.a > 0 ? ` e ticket médio de ${formatCurrency(avgTicket.a)}` : "";
    return `Até agora foram ${formatCurrency(revenue.a)} em serviços, com ${vehicles.a} veículo(s)${ticketPart}.`;
  }
  return `${metricSentence(revenue)}. ${metricSentence(vehicles)}.`;
}

function describeGoal(plan: ManagerialPlan): string | null {
  const g = plan.context.byCapability.goal_progress;
  if (!g || g.id !== "goal_progress" || g.status !== "ok" || !g.progress) return null;
  const p = g.progress;
  const paceLabel: Record<typeof p.pace, string> = {
    acima_do_ritmo: "acima do ritmo necessário para a meta",
    no_ritmo: "no ritmo necessário para a meta",
    abaixo_do_ritmo: "abaixo do ritmo necessário para a meta",
    indeterminado: "com ritmo ainda indefinido",
  };
  let text = `${p.goal.label} está em ${formatCurrency(p.currentAmount)}, ${p.percentComplete}% da meta de ${formatCurrency(p.goal.targetAmount)}, ${paceLabel[p.pace]}.`;
  if (p.projectedAmount !== null) {
    const daysLeft = p.daysTotal - p.daysElapsed;
    const confidenceNote = daysLeft > 15 || p.pace === "indeterminado" ? " — projeção de confiança média, ainda restam muitos dias" : "";
    text += ` Mantido o ritmo atual, a projeção é de ${formatCurrency(p.projectedAmount)}${confidenceNote}.`;
  }
  if (p.nextBonusTier && p.amountToNextBonus !== null) {
    text += ` Faltam ${formatCurrency(p.amountToNextBonus)} para a próxima faixa de bônus.`;
  }
  return text;
}

function describeCash(plan: ManagerialPlan): string | null {
  const c = plan.context.byCapability.cash_ledger_totals;
  if (!c || c.id !== "cash_ledger_totals" || c.status !== "ok") return null;
  const entradas = c.metrics.find((m) => m.key === "cashEntradas");
  const saidas = c.metrics.find((m) => m.key === "cashSaidas");
  if (!entradas || !saidas) return null;
  return `Entraram ${formatCurrency(entradas.a)} no caixa e saíram ${formatCurrency(saidas.a)}.`;
}

function describeInventory(plan: ManagerialPlan): string | null {
  const inv = plan.context.byCapability.inventory_status;
  if (!inv || inv.id !== "inventory_overview" || inv.status !== "ok") return null;
  const s = inv.summary;
  if (s.nearEmptyCount === 0 && s.lowStockCount === 0) return "O estoque está em boa situação — nenhum item crítico no momento.";
  const parts: string[] = [];
  if (s.nearEmptyCount > 0) parts.push(`${s.nearEmptyCount} item(ns) quase acabando`);
  if (s.lowStockCount > 0) parts.push(`${s.lowStockCount} com estoque baixo`);
  return `No estoque, ${parts.join(" e ")}.`;
}

function describeAccountsPayable(plan: ManagerialPlan): string | null {
  const ap = plan.context.byCapability.accounts_payable;
  if (!ap || ap.id !== "accounts_payable" || ap.status !== "ok" || !ap.summary) return null;
  if (ap.summary.totalOverdue > 0) return `Há ${formatCurrency(ap.summary.totalOverdue)} em contas a pagar vencidas.`;
  return "Não há contas a pagar vencidas.";
}

function describeAccountsReceivable(plan: ManagerialPlan): string | null {
  const ar = plan.context.byCapability.accounts_receivable;
  if (!ar || ar.id !== "accounts_receivable" || ar.status !== "ok" || !ar.dashboard) return null;
  const d = ar.dashboard;
  if (d.overdueTotal > 0) return `Há ${formatCurrency(d.overdueTotal)} em atraso a receber.`;
  return `Previsto a receber esta semana: ${formatCurrency(d.receiveThisWeek)}.`;
}

function describeClientRetention(plan: ManagerialPlan): string | null {
  const fact = plan.facts.find((f) => f.key === "crm_at_risk_count");
  return fact ? fact.statement : null;
}

/**
 * Clima como contexto operacional, nunca como número decorativo (seção 7) — nunca converte
 * chuva em impacto de faturamento sem histórico real que sustente. Só entra na resposta quando o
 * clima foi realmente uma capacidade requisitada (evita comentário de clima em pergunta de
 * estoque, por exemplo).
 */
function describeWeather(plan: ManagerialPlan): string | null {
  if (!plan.capabilitiesRequested.includes("weather_forecast")) return null;
  const w = plan.context.byCapability.weather_forecast;
  if (!w || w.id !== "weather_forecast") return null;
  if (w.status !== "ok" || !w.forecast.current) {
    return w.status === "not_configured" ? "Não consegui incluir o clima porque a integração ainda não está configurada." : null;
  }
  const rainyDay = w.forecast.dailyForecast.find((d) => d.willRain);
  if (!rainyDay) return `O tempo está firme agora (${w.forecast.current.condition}, ${w.forecast.current.temperature}°C).`;
  return `A previsão indica chuva nos próximos dias — isso tende a reduzir a demanda espontânea de lavação externa, então vale aproveitar antes disso para reforçar agendamentos e adicionais.`;
}

function describeHistoricalComparison(plan: ManagerialPlan): string | null {
  const h = plan.context.byCapability.historical_pattern;
  const jp = plan.context.byCapability.jumppark_period_summary;
  if (!h || h.id !== "historical_pattern" || h.status !== "ok" || !h.pattern || h.pattern.sampleWeeks === 0 || h.pattern.typicalVehicles === null) return null;
  if (!jp || jp.id !== "jumppark_period_summary" || jp.status !== "ok") return null;
  const vehicles = jp.metrics.find((m) => m.key === "vehicles");
  if (!vehicles) return null;
  const p = h.pattern;
  const qualityNote = p.sampleQuality === "insuficiente" ? " — amostra pequena, indicativo, não conclusivo" : "";
  return `Até agora tivemos ${vehicles.a} veículo(s), contra uma média de ${p.typicalVehicles} nas últimas ${p.sampleWeeks} ocorrência(s) deste dia da semana neste horário${qualityNote}.`;
}

/** Ordem de relevância dos "pontos principais" — nunca todos ao mesmo tempo, no máximo 3 (seção 12). */
function mainPoints(plan: ManagerialPlan): string[] {
  return [describeMovement(plan), describeGoal(plan), describeCash(plan), describeInventory(plan), describeAccountsPayable(plan), describeClientRetention(plan)].filter((s): s is string => !!s).slice(0, 3);
}

// --- Opinião gerencial (seção 4 e 6) — sempre derivada de `plan.risks`/`opportunities`/`recommendations`, nunca inventada ---

const RISK_OPENERS = ["Minha maior preocupação agora é que", "Eu ficaria atento a", "O ponto que mais me chama atenção é que"];
const OPPORTUNITY_OPENERS = ["A principal oportunidade que vejo agora é", "Um ponto a favor é que", "Vejo espaço para"];
const PRIORITY_OPENERS = ["Minha prioridade agora seria", "Se eu estivesse conduzindo a operação agora, faria o seguinte:", "O que eu faria agora:"];

function riskLine(plan: ManagerialPlan, usedOpeners: string[]): string {
  const risk = plan.risks[0];
  if (risk) return `${pick(RISK_OPENERS, usedOpeners)} ${lowerFirst(risk.statement)}`;
  if (plan.contextQuality.overallLevel === "low" || plan.contextQuality.availableSources.length === 0) return "Não tenho dados suficientes para apontar um risco com segurança.";
  return "Não vejo nenhum risco operacional relevante neste momento.";
}

function opportunityLine(plan: ManagerialPlan, usedOpeners: string[]): string | null {
  const opportunity = plan.opportunities[0];
  return opportunity ? `${pick(OPPORTUNITY_OPENERS, usedOpeners)} ${lowerFirst(opportunity.statement)}` : null;
}

function priorityLine(plan: ManagerialPlan, usedOpeners: string[]): string | null {
  const rec = plan.recommendations[0];
  if (!rec) return null;
  return `${pick(PRIORITY_OPENERS, usedOpeners)} ${lowerFirst(rec.action)}${rec.reason ? ` ${rec.reason}` : ""}`;
}

/** Confiança qualitativa e explicável (seção 5) — nunca um percentual solto. Silenciosa quando alta, para não virar refrão. */
function confidenceFooter(plan: ManagerialPlan): string | null {
  const q = plan.contextQuality;
  if (q.overallLevel === "high") return null;
  if (q.overallLevel === "medium") {
    const reason = q.confidenceReducers[0] ? ` (${q.confidenceReducers[0]})` : "";
    return `Considero essa leitura de confiança média${reason}.`;
  }
  return "Ainda tenho poucos dados reais reunidos agora, então essa leitura tem confiança baixa.";
}

// --- Reconhecimento emocional / social (seções 3 e 11) ---

function emotionalAcknowledgment(plan: ManagerialPlan): string | null {
  const normalized = normalize(plan.rawText);
  if (/\bpreocup/.test(normalized)) return "Entendo, Robério. Vamos olhar isso pelos dados.";
  if (/\bpuxad[oa]\b/.test(normalized)) return "Bora ver como está de fato.";
  return null;
}

function generalKnowledgeNote(aiConfig: AiProviderConfig): string {
  if (!aiConfig.enabled) {
    return "Consigo analisar a Santa Mônica com os dados do sistema, mas a resposta geral depende de um provedor de IA generativa, que ainda não está configurado aqui.";
  }
  return `Você já tem um provedor de IA (${aiConfig.provider}) configurado, mas a conexão para responder perguntas gerais ainda não foi implementada neste checkpoint — meu foco aqui continua nos dados reais da Sta Mônica.`;
}

// --- Composição por escopo (seção 2) ---

const CONVERSATIONAL_GREETING = (greetingWord: string) => [`${greetingWord}, Robério! Tudo certo por aqui, acompanhando a operação. Como posso te ajudar?`, `${greetingWord}! Por aqui tudo certo. Em que posso ajudar?`];
const CONVERSATIONAL_SMALL_TALK = ["Tudo certo por aqui, acompanhando a operação. Como posso te ajudar?", "Tudo em ordem por aqui! O que você quer saber?"];
const FAREWELLS = ["Até mais, Robério! Qualquer coisa é só chamar.", "Falou! Fico por aqui se precisar.", "Até logo — voltamos quando quiser."];

function narrateConversational(plan: ManagerialPlan, opts: Required<NarrateOptions>): string {
  const { greetingDetected, smallTalkDetected, farewellDetected } = plan.conversationalContext;

  if (farewellDetected) return pick(FAREWELLS, opts.usedOpeners);
  if (greetingDetected) return pick(CONVERSATIONAL_GREETING(opts.greetingWord), opts.usedOpeners);
  if (smallTalkDetected) return pick(CONVERSATIONAL_SMALL_TALK, opts.usedOpeners);
  if (plan.userIntents.includes("general_knowledge")) return generalKnowledgeNote(opts.aiConfig);
  return "Não entendi bem — pode reformular? Posso ajudar com movimento, financeiro, estoque, clientes, metas e mais.";
}

function narrateSimple(plan: ManagerialPlan): string {
  return (
    describeMovement(plan) ??
    describeGoal(plan) ??
    describeCash(plan) ??
    describeInventory(plan) ??
    describeAccountsPayable(plan) ??
    describeAccountsReceivable(plan) ??
    describeClientRetention(plan) ??
    describeWeather(plan) ??
    plan.limitations[0] ??
    "Ainda não tenho dados suficientes reunidos para responder isso agora."
  );
}

function narrateSpecificAnalysis(plan: ManagerialPlan): string {
  const primary = describeMovement(plan) ?? describeGoal(plan) ?? describeCash(plan) ?? describeInventory(plan) ?? describeClientRetention(plan);
  const historical = describeHistoricalComparison(plan);
  const weather = describeWeather(plan);
  const rec = plan.recommendations[0];
  const recText = rec ? `${lowerFirst(rec.action)}${rec.reason ? ` ${rec.reason}` : ""}` : null;
  // Quando não há fato primário, o próprio fallback (limitations[0]) já comunica a limitação —
  // nunca repete a mesma frase duas vezes na resposta.
  const opening = primary ?? plan.limitations[0] ?? "Ainda não tenho dados suficientes reunidos para avaliar isso com segurança.";
  const limitation = primary ? (plan.limitations[0] ?? null) : null;

  const parts = [emotionalAcknowledgment(plan), opening, historical, weather, recText, limitation].filter((s): s is string => !!s);
  const confidence = confidenceFooter(plan);
  if (confidence) parts.push(confidence);
  return parts.join(" ");
}

function narrateBroadManagerial(plan: ManagerialPlan, opts: Required<NarrateOptions>): string {
  const GENERAL_OPENERS = ["Minha leitura agora é que", "Olhando o quadro geral,", "No momento,", "Batendo o olho no dia,"];
  const points = mainPoints(plan);
  const lead = points.length > 0 ? `${pick(GENERAL_OPENERS, opts.usedOpeners)} ${lowerFirst(points[0])}` : "Ainda não tenho dados suficientes reunidos para um panorama completo agora.";

  const parts = [emotionalAcknowledgment(plan), lead, ...points.slice(1), describeWeather(plan), riskLine(plan, opts.usedOpeners), opportunityLine(plan, opts.usedOpeners), priorityLine(plan, opts.usedOpeners), confidenceFooter(plan)].filter(
    (s): s is string => !!s,
  );
  return parts.join(" ");
}

function linksFor(plan: ManagerialPlan): ZezinhoLink[] {
  const links: ZezinhoLink[] = [];
  if (plan.toolsSelected.includes("jumppark_period_summary")) links.push({ label: "Ver movimentações", href: "/movimentacoes" });
  if (plan.toolsSelected.includes("cash_ledger_totals")) links.push({ label: "Ver Fluxo de Caixa", href: "/financeiro/fluxo-de-caixa" });
  if (plan.toolsSelected.includes("goal_progress")) links.push({ label: "Ver metas", href: "/dashboard" });
  if (plan.toolsSelected.includes("inventory_overview")) links.push({ label: "Ver Estoque", href: "/estoque" });
  if (plan.toolsSelected.includes("crm_customers")) links.push({ label: "Ver Clientes", href: "/clientes" });
  return links;
}

function confidenceLabel(plan: ManagerialPlan): "alta" | "media" | "baixa" {
  if (plan.contextQuality.overallLevel === "high") return "alta";
  if (plan.contextQuality.overallLevel === "medium") return "media";
  return "baixa";
}

/**
 * Quando a mensagem mistura saudação/conversa social com uma pergunta de negócio (seção 3 — "Boa
 * tarde Zézinho, como você está? Movimento hoje está bom?"), a saudação precisa aparecer MESMO
 * fora do escopo `conversational` — senão o narrador responde só à parte de negócio e ignora a
 * parte social, exatamente o que a seção 3 proíbe ("nunca rejeitar a mensagem inteira porque
 * contém conversa informal" — e, por extensão, nunca responder só a metade dela).
 */
function conversationalLeadIn(plan: ManagerialPlan, greetingWord: string): string | null {
  if (plan.conversationalContext.greetingDetected) return `${greetingWord}, Robério! Tudo certo por aqui, acompanhando a operação.`;
  if (plan.conversationalContext.smallTalkDetected) return "Tudo certo por aqui, acompanhando a operação.";
  return null;
}

/** Ponto de entrada único do narrador — nunca escreve fora do que `ManagerialPlan` trouxe. */
export function narrateManagerialPlan(plan: ManagerialPlan, opts: NarrateOptions): NarrateResult {
  const fullOpts: Required<NarrateOptions> = { greetingWord: opts.greetingWord, usedOpeners: opts.usedOpeners, aiConfig: opts.aiConfig ?? getAiProviderConfig() };

  let text: string;
  switch (plan.questionScope) {
    case "conversational":
      text = narrateConversational(plan, fullOpts);
      break;
    case "simple":
      text = narrateSimple(plan);
      break;
    case "specific_analysis":
      text = narrateSpecificAnalysis(plan);
      break;
    case "broad_managerial":
      text = narrateBroadManagerial(plan, fullOpts);
      break;
  }

  if (plan.questionScope !== "conversational") {
    const leadIn = conversationalLeadIn(plan, fullOpts.greetingWord);
    if (leadIn) text = `${leadIn} ${text}`;
  }

  if (plan.generalAnswerRequired && plan.questionScope !== "conversational") {
    text = `${text} ${generalKnowledgeNote(fullOpts.aiConfig)}`;
  }

  const answer: ZezinhoAnswer = {
    text: text.trim(),
    links: linksFor(plan),
    sources: plan.evidence.length > 0 ? plan.evidence : undefined,
    facts: plan.facts.length > 0 ? plan.facts.map((f) => f.statement) : undefined,
    confidence: plan.businessIntents.length > 0 ? confidenceLabel(plan) : undefined,
  };

  return { answer, openerUsed: null };
}
