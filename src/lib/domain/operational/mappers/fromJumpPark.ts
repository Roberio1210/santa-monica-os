import { identityKey, normalizeName, normalizePlate, slugifyCustomerId } from "@/lib/crm/normalize";
import { maskPhone, maskPlate } from "@/lib/utils/mask";
import { classifyPaymentMethod } from "@/lib/utils/paymentMethod";
import { classifyServiceCategory } from "@/lib/domain/operational/category";
import type { JumpParkServiceOrder } from "@/lib/integrations/jumppark/types";
import type { OperationalCustomer, OperationalEmployee, OperationalOrder, OperationalVehicle } from "@/lib/domain/operational/types";

/**
 * Único ponto do domínio operacional que conhece o formato bruto da API JumpPark (Sprint 10,
 * decisão do usuário) — nenhum outro módulo deste domínio deve importar
 * `integrations/jumppark/types.ts` diretamente. Isolado de `integrations/jumppark/service.ts` e
 * `operations-summary.ts` de propósito: aquele código já está em produção e não é alterado por
 * este sprint; este mapper é um caminho novo e independente para o domínio operacional.
 *
 * `JumpParkOrderInput` estende `JumpParkServiceOrder` (nunca modificado) com dois campos
 * confirmados como presentes na resposta bruta real da API — `userName`/`userOutputName`
 * (operador de entrada/saída) e `discountAmount` — mas que `integrations/jumppark/types.ts` ainda
 * não tipa (ver docs/jumppark-data-map.md, seção 2). Nunca inventado: a evidência de que esses
 * campos existem vem da amostra real de produção já documentada.
 */
export type JumpParkOrderInput = JumpParkServiceOrder & {
  /** Operador que registrou a entrada. */
  userName?: string | null;
  /** Operador que registrou a saída — preferido para `employeeId`, por ser quem efetivamente concluiu o atendimento. */
  userOutputName?: string | null;
  /** Confirmado na amostra real (sempre 0/null nos exemplos vistos) — nunca populado com um caso real observado até agora. */
  discountAmount?: string | number | null;
};

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function slugify(key: string): string {
  return Buffer.from(key, "utf-8").toString("base64url");
}

/** `null` quando não há placa — nunca inventa um identificador para um veículo sem placa confirmada. */
function deriveVehicleId(plate: string | null | undefined): string | null {
  const normalized = normalizePlate(plate);
  return normalized ? slugify(`plate:${normalized}`) : null;
}

/** Prioriza o operador de saída (quem concluiu o atendimento); cai para o de entrada; `null` quando nenhum dos dois está presente. */
function deriveEmployeeId(userName: string | null | undefined, userOutputName: string | null | undefined): string | null {
  const preferred = normalizeName(userOutputName) ?? normalizeName(userName);
  return preferred ? slugify(`employee:${preferred.toLowerCase()}`) : null;
}

function deriveExternalId(order: JumpParkOrderInput): string {
  return order.serviceOrderId ?? `${order.plate ?? "sem-placa"}-${order.entryDateTime ?? ""}`;
}

/**
 * Converte uma ordem bruta da JumpPark no domínio operacional único do Santa Monica OS. Nunca
 * lança — uma ordem com dado ausente vira campos `null` honestos, nunca um valor inventado.
 */
export function mapJumpParkOrderToOperationalOrder(order: JumpParkOrderInput): OperationalOrder {
  const services = order.services ?? [];
  const serviceDescriptions = services.map((s) => s.description ?? s.name ?? "").filter(Boolean);
  const firstService = services[0];
  const serviceType = firstService ? (firstService.description ?? firstService.name ?? null) : null;

  const customerKey = identityKey(order.clientPhone, order.clientName);
  const customerId = customerKey ? slugifyCustomerId(customerKey) : null;

  const grossAmount = round2(toNumber(order.totalAmount));
  const discountAmount = round2(toNumber(order.discountAmount));
  const netAmount = round2(grossAmount - discountAmount);

  const paymentMethodCategory = order.paymentMethodName ? classifyPaymentMethod(order.paymentMethodName) : "outro";

  const observationText = null; // `observations` não está tipado em JumpParkServiceOrder hoje e nunca foi visto populado em amostra real — nunca inventado, ver docs/jumppark-data-map.md.

  return {
    id: null,
    externalId: deriveExternalId(order),
    source: "JUMPPARK",

    serviceType,
    serviceCategory: classifyServiceCategory(serviceDescriptions),

    customerId,
    vehicleId: deriveVehicleId(order.plate),
    licensePlate: order.plate ? maskPlate(order.plate) : null,
    vehicleModel: order.vehicleModel ?? null,

    employeeId: deriveEmployeeId(order.userName, order.userOutputName),

    openedAt: order.entryDateTime ?? null,
    startedAt: null,
    finishedAt: null,
    deliveredAt: order.exitDateTime ?? null,

    status: order.exitDateTime ? "closed" : "open",
    paymentStatus: order.financialSituationName === "Pago" ? "paid" : "unknown",
    paymentMethod: order.paymentMethodName ?? null,

    grossAmount,
    discountAmount,
    netAmount,

    notes: observationText,
    metadata: {
      serviceOrderCode: order.serviceOrderCode ?? null,
      services: services.map((s) => ({ description: s.description ?? s.name ?? "Serviço", amount: toNumber(s.amount) })),
      paymentMethodCategory,
      entryOperator: order.userName ?? null,
      exitOperator: order.userOutputName ?? null,
      clientName: order.clientName ?? null,
      clientPhoneMasked: maskPhone(order.clientPhone),
    },
  };
}

/** `null` quando a ordem não tem telefone nem nome de cliente — nunca inventa uma identidade de cliente. */
export function mapJumpParkOrderToCustomer(order: JumpParkOrderInput): OperationalCustomer | null {
  const key = identityKey(order.clientPhone, order.clientName);
  if (!key) return null;
  return {
    id: slugifyCustomerId(key),
    name: normalizeName(order.clientName),
    phoneMasked: maskPhone(order.clientPhone),
    source: "JUMPPARK",
  };
}

/** `null` quando a ordem não tem placa — nunca inventa um identificador de veículo. */
export function mapJumpParkOrderToVehicle(order: JumpParkOrderInput): OperationalVehicle | null {
  const id = deriveVehicleId(order.plate);
  if (!id) return null;
  return {
    id,
    licensePlateMasked: maskPlate(order.plate),
    model: order.vehicleModel ?? null,
    source: "JUMPPARK",
  };
}

/** `null` quando não há operador de entrada nem de saída registrado — nunca inventa um funcionário. */
export function mapJumpParkOrderToEmployee(order: JumpParkOrderInput): OperationalEmployee | null {
  const preferred = normalizeName(order.userOutputName) ?? normalizeName(order.userName);
  if (!preferred) return null;
  return {
    id: slugify(`employee:${preferred.toLowerCase()}`),
    name: preferred,
    source: "JUMPPARK",
  };
}
