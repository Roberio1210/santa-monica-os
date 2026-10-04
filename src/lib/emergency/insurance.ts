/**
 * Módulo Emergência — Fase 1. Resumo operacional da apólice empresarial vigente, com os dados
 * fornecidos literalmente pelo gestor na missão (04/10/2026). Fonte única no código — mesmo
 * padrão de `COMPANY_INFO` (`src/lib/company/info.ts`); nunca duplicar estes valores em
 * componente. Migrar para tabela (`insurance_policies`/`insurance_coverages`) é a Fase 2 do
 * módulo (ver docs/emergency-module.md).
 *
 * Regra jurídica obrigatória: nada aqui afirma indenização. Toda exibição de cobertura usa
 * `POTENTIAL_COVERAGE_LABEL` e vem acompanhada de `INSURANCE_DISCLAIMER`.
 */

export const POTENTIAL_COVERAGE_LABEL = "Cobertura potencialmente aplicável";

/** Texto obrigatório, exibido permanentemente na seção de seguro (redação fornecida pelo gestor). */
export const INSURANCE_DISCLAIMER = [
  "Os dados abaixo são um resumo operacional da apólice. A existência de uma cobertura nesta tela não significa confirmação automática de indenização.",
  "A aplicação da cobertura depende das circunstâncias do evento, condições contratuais, exclusões, documentação apresentada e análise da seguradora.",
] as const;

export const INSURANCE_POLICY = {
  insurer: "Tokio Marine",
  insuredName: "R.B.E. ESTACIONAMENTO LTDA",
  policyNumber: "01955436",
  startDate: "2026-07-14",
  endDate: "2027-07-14",
  declaredActivity: "Estacionamento e/ou Lava-Rápido",
  coveredAssets: "Prédio e Conteúdo",
  /** Mesmo número cadastrado no contato `tokio-marine-assistencia` (seed). */
  assistancePhone: "0800 31 86546",
} as const;

export interface InsuranceCoverage {
  key: string;
  name: string;
  /** Limite Máximo de Indenização, em reais. */
  lmi: number;
  /** Participação obrigatória do segurado — `null` quando o resumo da apólice não indica nenhuma. */
  participation: { percent: number; minimum: number } | null;
  indemnityPeriodMonths: number | null;
  condition: string | null;
}

export const INSURANCE_COVERAGES: InsuranceCoverage[] = [
  { key: "incendio", name: "Incêndio e eventos correlatos", lmi: 200_000, participation: { percent: 10, minimum: 3_000 }, indemnityPeriodMonths: null, condition: null },
  { key: "alagamento", name: "Alagamento/Inundação", lmi: 10_000, participation: { percent: 20, minimum: 5_000 }, indemnityPeriodMonths: null, condition: null },
  { key: "anuncios_luminosos", name: "Anúncios Luminosos", lmi: 10_000, participation: { percent: 10, minimum: 600 }, indemnityPeriodMonths: null, condition: null },
  { key: "danos_eletricos", name: "Danos Elétricos", lmi: 30_000, participation: { percent: 10, minimum: 3_500 }, indemnityPeriodMonths: null, condition: null },
  { key: "equipamentos_eletronicos", name: "Equipamentos Eletrônicos", lmi: 30_000, participation: { percent: 10, minimum: 600 }, indemnityPeriodMonths: null, condition: null },
  { key: "impacto_veiculos", name: "Impacto de Veículos", lmi: 100_000, participation: { percent: 10, minimum: 750 }, indemnityPeriodMonths: null, condition: null },
  { key: "vidros", name: "Vidros/Espelhos/Mármores/Granitos", lmi: 5_000, participation: { percent: 10, minimum: 300 }, indemnityPeriodMonths: null, condition: null },
  { key: "rc_garagista", name: "RC Garagista — Modalidade Compreensiva", lmi: 20_000, participation: { percent: 10, minimum: 1_800 }, indemnityPeriodMonths: null, condition: null },
  { key: "rc_operacoes", name: "RC Operações", lmi: 100_000, participation: { percent: 10, minimum: 500 }, indemnityPeriodMonths: null, condition: null },
  { key: "danos_morais_rc_operacoes", name: "Danos Morais — RC Operações", lmi: 20_000, participation: { percent: 10, minimum: 500 }, indemnityPeriodMonths: null, condition: null },
  { key: "derrame_vazamento", name: "Derrame/Vazamento de Tanques e Tubulações", lmi: 10_000, participation: { percent: 20, minimum: 3_000 }, indemnityPeriodMonths: null, condition: null },
  { key: "despesas_aluguel", name: "Despesas de Aluguel", lmi: 15_000, participation: null, indemnityPeriodMonths: 6, condition: null },
  { key: "lucros_cessantes", name: "Lucros Cessantes / Despesas Fixas", lmi: 10_000, participation: null, indemnityPeriodMonths: 6, condition: "Primeiros 5 dias" },
];

const COVERAGE_BY_KEY = new Map(INSURANCE_COVERAGES.map((c) => [c.key, c]));

export function findCoverage(key: string): InsuranceCoverage | null {
  return COVERAGE_BY_KEY.get(key) ?? null;
}

export function isKnownCoverageKey(key: string): boolean {
  return COVERAGE_BY_KEY.has(key);
}

/** Coberturas vinculadas a um protocolo, na ordem do vínculo — chaves desconhecidas são ignoradas (nunca inventa cobertura). */
export function resolveCoverages(keys: string[]): InsuranceCoverage[] {
  return keys.map(findCoverage).filter((c): c is InsuranceCoverage => c !== null);
}

export type PolicyValidity = "vigente" | "a_iniciar" | "vencida";

/** Situação da vigência numa data (YYYY-MM-DD, fuso de São Paulo) — só exibição, não é alerta. */
export function computePolicyValidity(todayIso: string, policy: { startDate: string; endDate: string } = INSURANCE_POLICY): PolicyValidity {
  if (todayIso < policy.startDate) return "a_iniciar";
  if (todayIso > policy.endDate) return "vencida";
  return "vigente";
}
