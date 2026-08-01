/**
 * Domínio Operacional (Sprint 10, decisão do usuário) — `OperationalOrder` é a fonte única de
 * verdade para qualquer serviço realizado pela empresa, independente da origem. Lavação,
 * Estacionamento, Financeiro, CRM, Agenda, RH, Indicadores, IA, Fluxo de Caixa e DRE devem, em
 * sprints futuros, consumir este domínio em vez de reimplementar sua própria leitura de cada
 * integração.
 *
 * Este arquivo só declara tipos — nenhum I/O, nenhuma regra de negócio. A única fonte real hoje
 * é a JumpPark, via `mappers/fromJumpPark.ts`; nenhum outro lugar do sistema deve conhecer o
 * formato bruto de nenhuma integração para preencher este domínio.
 */

/** De onde este registro operacional veio — nunca inventado, sempre rastreável. */
export type OperationalOrderSource = "JUMPPARK" | "MANUAL" | "FUTURO";

/**
 * Só os dois estados realmente observáveis hoje: presença ou ausência de um horário de saída
 * confirmado. Nunca um terceiro estado ("em execução", "aguardando") — nenhuma fonte atual
 * confirma esse dado (ver docs/jumppark-open-orders-investigation.md).
 */
export type OperationalOrderStatus = "open" | "closed";

/**
 * Só os dois estados que a JumpPark realmente confirma: "Pago" (único valor jamais observado em
 * milhares de ordens reais) ou desconhecido. Nunca "pending"/"invoiced"/"postpaid" — nenhuma
 * amostra real jamais confirmou um segundo valor (ver docs/jumppark-data-map.md, seção 3).
 */
export type OperationalPaymentStatus = "paid" | "unknown";

/**
 * As 9 categorias de negócio (decisão do usuário, Sprint 10). "Martelinho" deixa de ser
 * absorvido por "Lavação" — é uma categoria própria, confirmada como dado real distinto (ver
 * achado em `referencias/jp_orders.json`, chave `mart`, investigação Sprint 9).
 */
export type OperationalServiceCategory = "Lavação" | "Polimento" | "Vitrificação" | "Higienização" | "Motor" | "Martelinho" | "PPF" | "Estacionamento" | "Outros";

/**
 * Fonte única de verdade de qualquer serviço realizado (Sprint 10, decisão do usuário).
 *
 * `id` é sempre `null` neste sprint — não existe camada de persistência para este domínio ainda
 * (fora de escopo, ver seção "Próximo Sprint recomendado"). Só um repositório real atribuiria um
 * `id` de banco; até lá, `externalId` é o único identificador estável disponível.
 *
 * `licensePlate` guarda sempre a placa já mascarada (mesmo padrão de todo o resto do sistema,
 * `src/lib/utils/mask.ts`) — nunca a placa completa, mesmo neste domínio interno.
 */
export interface OperationalOrder {
  id: string | null;
  externalId: string;
  source: OperationalOrderSource;

  /** Texto livre do primeiro serviço vendido (`services[0].description`) — `null` numa ordem de estacionamento puro, sem serviço agregado. */
  serviceType: string | null;
  serviceCategory: OperationalServiceCategory;

  customerId: string | null;
  vehicleId: string | null;
  licensePlate: string | null;
  vehicleModel: string | null;

  employeeId: string | null;

  openedAt: string | null;
  /** Sempre `null` — a JumpPark não distingue "serviço iniciado" de "veículo entrou" (só dois horários existem: entrada e saída). */
  startedAt: string | null;
  /** Sempre `null` — a JumpPark não distingue "serviço concluído" de "veículo saiu" (ver `deliveredAt`). */
  finishedAt: string | null;
  /** Horário de saída do veículo (`exitDateTime`) — o único horário de "conclusão" que a JumpPark realmente confirma. */
  deliveredAt: string | null;

  status: OperationalOrderStatus;
  paymentStatus: OperationalPaymentStatus;
  /** Texto livre da JumpPark (`paymentMethodName`) — nunca normalizado a força; ver `metadata.paymentMethodCategory` para a classificação já usada no resto do sistema. */
  paymentMethod: string | null;

  grossAmount: number;
  discountAmount: number;
  netAmount: number;

  notes: string | null;
  /** Dados brutos preservados para auditoria (nunca exibidos sem passar de novo pelas regras de mascaramento do consumidor). */
  metadata: Record<string, unknown>;
}

/** Extremamente simples, de propósito (decisão do usuário) — só os dados que a JumpPark realmente confirma sobre um cliente. */
export interface OperationalCustomer {
  id: string;
  name: string | null;
  phoneMasked: string | null;
  source: OperationalOrderSource;
}

export interface OperationalVehicle {
  id: string;
  licensePlateMasked: string | null;
  model: string | null;
  source: OperationalOrderSource;
}

/** `name` vem de `userName`/`userOutputName` — campos confirmados na resposta bruta da API (docs/jumppark-data-map.md), mas ainda não tipados em `integrations/jumppark/types.ts`. */
export interface OperationalEmployee {
  id: string;
  name: string;
  source: OperationalOrderSource;
}
