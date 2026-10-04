import { INSURANCE_POLICY } from "@/lib/emergency/insurance";
import type { EmergencyContactCategory, EmergencyPriority, EmergencyProtocolCategory } from "@/lib/emergency/types";

/**
 * Módulo Emergência — Fase 1. Conteúdo inicial da Central, fonte única usada por:
 * - `src/db/seed/emergency-foundation.ts` (carga idempotente no Postgres, `npm run db:seed:emergency`);
 * - `MemoryEmergencyRepository` (modo sem banco / testes);
 * - modo de contingência da página quando o banco não responde (`service.ts`).
 *
 * Depois do seed, a fonte de verdade é o banco (editável em /configuracoes/emergencia) — o seed
 * nunca sobrescreve um registro já existente.
 *
 * REGRA: nenhum telefone inventado. Só constam números fornecidos explicitamente pelo gestor
 * (190, 192, 193, 199 e a assistência 24h da Tokio Marine). Os demais contatos existem sem telefone,
 * aguardando cadastro administrativo — a tela nunca renderiza botão para dado inexistente.
 *
 * Cobertura de seguro (Missão 2.1): vínculo automático protocolo → cobertura SÓ quando aprovado
 * explicitamente pelo gestor — Incêndio → Incêndio e eventos correlatos; Dano/Acidente com
 * veículo → RC Garagista; Roubo/Furto → RC Garagista, restrito a veículo de cliente sob guarda e
 * com ressalva. Nenhum outro protocolo tem vínculo: correlação semântica nunca vira conclusão
 * securitária. A seção geral do seguro continua listando todas as coberturas contratadas.
 */

export interface SeedContact {
  key: string;
  name: string;
  category: EmergencyContactCategory;
  phone: string | null;
  priority: EmergencyPriority;
  displayOrder: number;
  notes: string | null;
}

export const SEED_CONTACTS: SeedContact[] = [
  { key: "policia-militar", name: "Polícia Militar", category: "servico_publico", phone: "190", priority: "critica", displayOrder: 10, notes: null },
  { key: "samu", name: "SAMU", category: "servico_publico", phone: "192", priority: "critica", displayOrder: 15, notes: "Emergência médica." },
  { key: "bombeiros", name: "Corpo de Bombeiros", category: "servico_publico", phone: "193", priority: "critica", displayOrder: 20, notes: null },
  { key: "defesa-civil", name: "Defesa Civil", category: "servico_publico", phone: "199", priority: "critica", displayOrder: 30, notes: null },
  {
    key: "tokio-marine-assistencia",
    name: "Tokio Marine — Assistência 24h",
    category: "seguro",
    phone: INSURANCE_POLICY.assistancePhone,
    priority: "critica",
    displayOrder: 40,
    notes: `Apólice ${INSURANCE_POLICY.policyNumber}.`,
  },
  { key: "corretor-seguro", name: "Corretor do seguro", category: "seguro", phone: null, priority: "alta", displayOrder: 50, notes: null },
  { key: "proprietario", name: "Proprietário/Administrador", category: "interno", phone: null, priority: "alta", displayOrder: 60, notes: null },
  { key: "gerente", name: "Gerente", category: "interno", phone: null, priority: "alta", displayOrder: 70, notes: null },
  { key: "verisure", name: "Verisure", category: "seguranca", phone: null, priority: "normal", displayOrder: 80, notes: null },
  { key: "celesc", name: "Celesc", category: "concessionaria", phone: null, priority: "normal", displayOrder: 90, notes: null },
  { key: "casan", name: "CASAN", category: "concessionaria", phone: null, priority: "normal", displayOrder: 100, notes: null },
  { key: "vivo-empresas", name: "Vivo Empresas", category: "concessionaria", phone: null, priority: "normal", displayOrder: 110, notes: null },
  { key: "wecharge", name: "WeCharge", category: "fornecedor", phone: null, priority: "normal", displayOrder: 120, notes: null },
  { key: "guarda-municipal", name: "Guarda Municipal de Florianópolis", category: "poder_publico", phone: null, priority: "normal", displayOrder: 130, notes: null },
  { key: "floram", name: "FLORAM", category: "poder_publico", phone: null, priority: "normal", displayOrder: 140, notes: null },
  { key: "prefeitura", name: "Prefeitura de Florianópolis", category: "poder_publico", phone: null, priority: "normal", displayOrder: 150, notes: null },
  { key: "contabilidade", name: "Contabilidade", category: "profissional", phone: null, priority: "normal", displayOrder: 160, notes: null },
  { key: "advogado", name: "Advogado", category: "profissional", phone: null, priority: "normal", displayOrder: 170, notes: null },
];

export interface SeedStep {
  text: string;
  isCritical?: boolean;
}

export interface SeedProtocol {
  slug: string;
  title: string;
  category: EmergencyProtocolCategory;
  description: string;
  priority: EmergencyPriority;
  displayOrder: number;
  warning: string | null;
  potentialCoverageKeys: string[];
  /** `key` de um `SEED_CONTACTS` — resolvido para `priority_contact_id` no seed. */
  priorityContactKey: string | null;
  notes: string | null;
  steps: SeedStep[];
}

/** Passos genéricos para falhas de serviço — sem regra técnica de concessionária (decisão da missão). */
function serviceFailureSteps(serviceName: string): SeedStep[] {
  return [
    { text: "Verifique se há risco às pessoas (fios expostos, água próxima a equipamentos elétricos, faíscas). Havendo risco, afaste todos do local.", isCritical: true },
    { text: `Identifique o problema: o que parou, desde que horário e quais áreas ou equipamentos foram afetados (${serviceName}).` },
    { text: "Confirme se a falha é só no estabelecimento ou também na vizinhança, quando possível." },
    { text: "Entre em contato com o fornecedor ou a concessionária pelo contato cadastrado nesta Central." },
    { text: "Anote o número de protocolo do atendimento, o horário e o nome de quem atendeu." },
    { text: "Comunique o responsável pela Santa Mônica quando a falha afetar a operação ou os clientes." },
  ];
}

export const SEED_PROTOCOLS: SeedProtocol[] = [
  {
    slug: "incendio",
    title: "Incêndio",
    category: "vida_seguranca",
    description: "Prioridade máxima: vida e segurança. Nenhum veículo, equipamento ou objeto vale o risco de uma pessoa.",
    priority: "critica",
    displayOrder: 10,
    warning: null,
    potentialCoverageKeys: ["incendio"],
    priorityContactKey: "bombeiros",
    notes: null,
    steps: [
      { text: "Se houver risco às pessoas, acione imediatamente o Corpo de Bombeiros — 193.", isCritical: true },
      { text: "Evacue clientes e equipe para local seguro.", isCritical: true },
      { text: "Não coloque ninguém em risco para salvar veículos, equipamentos ou objetos.", isCritical: true },
      { text: "Quando seguro, identifique a área atingida." },
      { text: "Avise o responsável pela Santa Mônica." },
      { text: "Preserve imagens das câmeras e demais evidências, quando possível e seguro." },
      { text: "Identifique os veículos que estavam no estabelecimento." },
      { text: "Acione a seguradora/corretor quando aplicável." },
      { text: "Registre protocolos externos." },
      { text: "Não remova ou descarte bens danificados sem necessidade de segurança ou orientação adequada." },
    ],
  },
  {
    slug: "dano-veiculo",
    title: "Dano/Acidente com veículo",
    category: "veiculo_cliente",
    description: "Dano ou acidente envolvendo veículo de cliente nas dependências ou durante manobra/serviço.",
    priority: "alta",
    displayOrder: 20,
    warning:
      "ATENÇÃO: A apólice contém condições específicas para movimentação de veículos e exclusões relacionadas à execução insuficiente ou defeituosa do próprio serviço. Não confirmar cobertura ao cliente antes da análise da seguradora.",
    potentialCoverageKeys: ["rc_garagista"],
    priorityContactKey: "proprietario",
    notes: null,
    steps: [
      { text: "Verifique primeiro se alguém se feriu.", isCritical: true },
      { text: "Não assuma responsabilidade financeira imediatamente.", isCritical: true },
      { text: "Não prometa pagamento ou indenização.", isCritical: true },
      { text: "Não autorize reparo em nome da empresa antes do procedimento interno e, quando aplicável, orientação da seguradora.", isCritical: true },
      { text: "Fotografe o veículo e o local." },
      { text: "Registre data e hora." },
      { text: "Identifique cliente, veículo e placa." },
      { text: "Identifique funcionários/prestadores envolvidos." },
      { text: "Preserve imediatamente as imagens das câmeras." },
      { text: "Localize OS/registro operacional disponível." },
      { text: "Avise o administrador." },
      { text: "Consulte a cobertura potencialmente aplicável." },
      { text: "Acione seguradora/corretor quando necessário." },
      { text: "Guarde todos os protocolos e documentos." },
    ],
  },
  {
    slug: "roubo-furto",
    title: "Roubo/Furto",
    category: "patrimonio",
    description: "Prioridade: segurança das pessoas. Bens e veículos vêm depois.",
    priority: "critica",
    displayOrder: 30,
    warning:
      "Seguro: a RC Garagista — Modalidade Compreensiva só é cobertura potencialmente aplicável quando o roubo/furto envolver veículo de cliente sob guarda do estabelecimento, observadas as condições específicas da apólice (furto apenas em determinadas hipóteses mediante arrombamento). Para bens do próprio estabelecimento não há vínculo automático — consulte o corretor. Não confirmar cobertura a ninguém antes da análise da seguradora.",
    potentialCoverageKeys: ["rc_garagista"],
    priorityContactKey: "policia-militar",
    notes: null,
    steps: [
      { text: "Não confronte suspeitos.", isCritical: true },
      { text: "Com a situação em andamento ou havendo risco, acione a Polícia Militar — 190.", isCritical: true },
      { text: "Preserve as imagens das câmeras." },
      { text: "Identifique os veículos e bens envolvidos." },
      { text: "Registre o horário do ocorrido e de quando foi percebido." },
      { text: "Preserve os sinais de arrombamento — não mexa, não limpe e não conserte antes do registro." },
      { text: "Registre boletim de ocorrência/protocolo quando aplicável." },
      { text: "Avise o administrador." },
      { text: "Acione a seguradora/corretor." },
    ],
  },
  {
    slug: "acidente-pessoa",
    title: "Acidente com pessoa",
    category: "vida_seguranca",
    description: "Priorize o atendimento à pessoa. Esta página não substitui orientação médica nem o atendimento dos serviços de emergência.",
    priority: "critica",
    displayOrder: 40,
    warning: null,
    potentialCoverageKeys: [],
    priorityContactKey: "samu",
    notes: null,
    steps: [
      { text: "Avalie se o local está seguro para você e para a pessoa (veículos em movimento, fogo, eletricidade).", isCritical: true },
      { text: "Em emergência médica, acione o SAMU — 192.", isCritical: true },
      { text: "Havendo fogo, fumaça, pessoa presa ou risco no local, acione também o Corpo de Bombeiros — 193.", isCritical: true },
      { text: "Não movimente pessoa gravemente ferida, a não ser que haja necessidade imediata de segurança.", isCritical: true },
      { text: "Mantenha a pessoa acompanhada até a chegada do socorro." },
      { text: "Registre nome e contato das testemunhas." },
      { text: "Preserve as imagens das câmeras." },
      { text: "Avise o administrador." },
      { text: "Documente o ocorrido depois que a situação estiver sob controle." },
    ],
  },
  {
    slug: "alagamento",
    title: "Alagamento/Inundação",
    category: "patrimonio",
    description: "Entrada de água no estabelecimento por chuva, transbordamento ou inundação.",
    priority: "alta",
    displayOrder: 50,
    warning: null,
    potentialCoverageKeys: [],
    priorityContactKey: "defesa-civil",
    notes: null,
    steps: [
      { text: "Afaste as pessoas de áreas alagadas próximas a tomadas, quadros e equipamentos elétricos.", isCritical: true },
      { text: "Havendo risco às pessoas, acione a Defesa Civil — 199 ou o Corpo de Bombeiros — 193.", isCritical: true },
      { text: "Quando seguro, identifique as áreas, veículos e equipamentos atingidos." },
      { text: "Fotografe o nível da água e os danos, com data e hora." },
      { text: "Preserve as imagens das câmeras." },
      { text: "Avise o responsável pela Santa Mônica." },
      { text: "Acione a seguradora/corretor quando aplicável." },
      { text: "Registre os protocolos externos." },
    ],
  },
  {
    slug: "energia",
    title: "Energia elétrica",
    category: "servico_essencial",
    description: "Falta de energia, oscilação ou problema elétrico no estabelecimento.",
    priority: "normal",
    displayOrder: 60,
    warning: null,
    potentialCoverageKeys: [],
    priorityContactKey: "celesc",
    notes: null,
    steps: serviceFailureSteps("energia elétrica"),
  },
  {
    slug: "agua-vazamento",
    title: "Água/Vazamento",
    category: "servico_essencial",
    description: "Falta de água ou vazamento em tubulações, reservatórios ou equipamentos.",
    priority: "normal",
    displayOrder: 70,
    warning: null,
    potentialCoverageKeys: [],
    priorityContactKey: "casan",
    notes: null,
    steps: serviceFailureSteps("água/vazamento"),
  },
  {
    slug: "internet",
    title: "Internet",
    category: "servico_essencial",
    description: "Internet fora do ar ou instável no estabelecimento.",
    priority: "normal",
    displayOrder: 80,
    warning: null,
    potentialCoverageKeys: [],
    priorityContactKey: "vivo-empresas",
    notes: null,
    steps: serviceFailureSteps("internet"),
  },
  {
    slug: "alarme-seguranca",
    title: "Alarme/Segurança",
    category: "patrimonio",
    description: "Disparo de alarme, falha no sistema de segurança ou situação suspeita.",
    priority: "alta",
    displayOrder: 90,
    warning: null,
    potentialCoverageKeys: [],
    priorityContactKey: "verisure",
    notes: null,
    steps: [
      { text: "Não se aproxime nem confronte se houver suspeita de pessoa estranha no local.", isCritical: true },
      { text: "Havendo situação em andamento ou risco, acione a Polícia Militar — 190.", isCritical: true },
      { text: "Entre em contato com a empresa de monitoramento pelo contato cadastrado nesta Central." },
      { text: "Preserve as imagens das câmeras." },
      { text: "Anote o horário do disparo e o número de protocolo do atendimento." },
      { text: "Avise o responsável pela Santa Mônica." },
    ],
  },
  {
    slug: "carregador-eletrico",
    title: "Carregador elétrico",
    category: "servico_essencial",
    description: "Problema no carregador de veículo elétrico.",
    priority: "normal",
    displayOrder: 100,
    warning: null,
    potentialCoverageKeys: [],
    priorityContactKey: "wecharge",
    notes: null,
    steps: [
      { text: "Havendo cheiro de queimado, fumaça, faísca ou aquecimento anormal, afaste as pessoas e não toque no equipamento. Com fogo ou risco às pessoas, acione o Corpo de Bombeiros — 193.", isCritical: true },
      ...serviceFailureSteps("carregador de veículo elétrico").slice(1),
    ],
  },
  {
    slug: "arvore-meio-ambiente",
    title: "Árvore/Meio ambiente",
    category: "patrimonio",
    description: "Queda ou risco de queda de árvore, galhos ou outra situação ambiental.",
    priority: "alta",
    displayOrder: 110,
    warning: null,
    potentialCoverageKeys: [],
    priorityContactKey: "floram",
    notes: null,
    steps: [
      { text: "Afaste pessoas e, quando seguro, veículos da área de risco.", isCritical: true },
      { text: "Havendo risco imediato (queda iminente, fios elétricos atingidos), acione o Corpo de Bombeiros — 193 ou a Defesa Civil — 199.", isCritical: true },
      { text: "Fotografe a situação e os veículos ou bens atingidos, com data e hora." },
      { text: "Preserve as imagens das câmeras." },
      { text: "Entre em contato com o órgão responsável pelo contato cadastrado nesta Central." },
      { text: "Avise o responsável pela Santa Mônica." },
      { text: "Acione a seguradora/corretor quando houver veículo de cliente ou bem atingido." },
      { text: "Registre os protocolos externos." },
    ],
  },
  {
    slug: "outra-emergencia",
    title: "Outra emergência",
    category: "outro",
    description: "Situação não prevista nos demais protocolos.",
    priority: "normal",
    displayOrder: 120,
    warning: null,
    potentialCoverageKeys: [],
    priorityContactKey: "proprietario",
    notes: null,
    steps: [
      { text: "Priorize a segurança das pessoas. Em risco imediato à vida, acione os serviços públicos de emergência.", isCritical: true },
      { text: "Identifique o que aconteceu, onde e a partir de que horário." },
      { text: "Preserve as imagens das câmeras e demais evidências, quando possível e seguro." },
      { text: "Avise o responsável pela Santa Mônica." },
      { text: "Registre os protocolos externos e o nome de quem atendeu." },
    ],
  },
];
