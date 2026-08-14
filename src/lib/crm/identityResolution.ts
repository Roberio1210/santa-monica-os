import {
  classifyPhoneValue,
  classifyPlateValue,
  comparePhoneValues,
  comparePlateValues,
  compareModels,
  compareNames,
  type ComparisonResult,
} from "@/lib/crm/identityEvidence";

/**
 * Missão CRM V2 Fase 2 — motor puro de resolução de identidade (simulação, sem I/O, sem merge).
 *
 * Princípio central: nunca decidir por um único campo fraco (seção 2 da missão). Pessoa e veículo
 * são identidades SEPARADAS (seção 11) — `resolveCustomerIdentity`/`resolveVehicleIdentity` nunca
 * compartilham evidência entre si, exceto pelo vínculo auxiliar opcional `vehicleLink` (seção 9:
 * "mesmo veículo já relacionado"), que só entra como evidência POSITIVA — nunca como contradição
 * (uma troca de veículo nunca invalida a identidade do cliente, seção 19).
 *
 * Este arquivo só classifica. Não funde, não escreve, não decide sozinho — toda classificação é
 * consumida por humano ou por uma futura política de reconciliação, fora desta missão (seção 21).
 */

export type ResolutionClassification = "EXACT" | "HIGH_CONFIDENCE" | "REVIEW" | "INSUFFICIENT" | "CONFLICT";

type PairSignal = "strong_positive" | "moderate_positive" | "weak_positive" | "contradiction" | "none";

interface PairEvaluation<TEvidence> {
  candidateId: string;
  signal: PairSignal;
  evidence: TEvidence;
}

export interface ResolutionResult<TEvidence> {
  classification: ResolutionClassification;
  /** Preenchido só em EXACT/HIGH_CONFIDENCE — nunca decide fusão sozinho, é a sugestão para revisão. */
  bestCandidateId: string | null;
  reason: string;
  evidenceByCandidate: { candidateId: string; evidence: TEvidence }[];
}

/**
 * Regras de agregação (seções 13/14) — comuns a cliente e veículo. Cada candidato já chega com um
 * único `signal` decidido pelo avaliador específico (contradição sempre tem prioridade sobre
 * evidência positiva DENTRO do mesmo par — ver `evaluateCustomerPair`/`evaluateVehiclePair`).
 */
function classifyFromPairSignals<TEvidence>(evaluations: PairEvaluation<TEvidence>[]): ResolutionResult<TEvidence> {
  const evidenceByCandidate = evaluations.map((e) => ({ candidateId: e.candidateId, evidence: e.evidence }));
  const nonContradicted = evaluations.filter((e) => e.signal !== "contradiction");
  const contradicted = evaluations.filter((e) => e.signal === "contradiction");

  const strong = nonContradicted.filter((e) => e.signal === "strong_positive");
  if (strong.length === 1) {
    return { classification: "EXACT", bestCandidateId: strong[0].candidateId, reason: "Identificador forte completo bate com exatamente um candidato, sem contradição.", evidenceByCandidate };
  }
  if (strong.length > 1) {
    return { classification: "REVIEW", bestCandidateId: null, reason: "Mais de um candidato com identificador forte completo — não deveria ocorrer num dado consistente; revisão humana.", evidenceByCandidate };
  }

  const moderate = nonContradicted.filter((e) => e.signal === "moderate_positive");
  if (moderate.length === 1) {
    return { classification: "HIGH_CONFIDENCE", bestCandidateId: moderate[0].candidateId, reason: "Único candidato com 2+ evidências independentes e consistentes, sem contradição.", evidenceByCandidate };
  }
  if (moderate.length > 1) {
    return { classification: "REVIEW", bestCandidateId: null, reason: "Múltiplos candidatos igualmente plausíveis (evidências combinadas) — revisão humana.", evidenceByCandidate };
  }

  const weak = nonContradicted.filter((e) => e.signal === "weak_positive");
  if (weak.length === 1) {
    return { classification: "INSUFFICIENT", bestCandidateId: null, reason: "Só uma evidência fraca isolada (nome ou máscara sozinhos) — nunca determina identidade sozinha.", evidenceByCandidate };
  }
  if (weak.length > 1) {
    return { classification: "REVIEW", bestCandidateId: null, reason: "Mais de um candidato com evidência fraca isolada — ambíguo, revisão humana.", evidenceByCandidate };
  }

  if (contradicted.length > 0) {
    return { classification: "CONFLICT", bestCandidateId: null, reason: "Evidência forte contraditória encontrada — associação bloqueada.", evidenceByCandidate };
  }

  return { classification: "INSUFFICIENT", bestCandidateId: null, reason: "Nenhuma evidência utilizável encontrada.", evidenceByCandidate };
}

export interface CustomerCandidateInput {
  id: string;
  name: string | null;
  phone: string | null;
  /** Placa de um veículo já vinculado a este cliente (seção 9, "mesmo veículo já relacionado") — opcional, só evidência POSITIVA (seção 19: nunca vira contradição de cliente). */
  linkedVehiclePlate?: string | null;
}

export interface CustomerPairEvidence {
  phone: ComparisonResult;
  name: "match" | "mismatch" | "unknown";
  vehicleLink: ComparisonResult;
}

function evaluateCustomerPair(target: CustomerCandidateInput, candidate: CustomerCandidateInput): PairEvaluation<CustomerPairEvidence> {
  const phone = comparePhoneValues(classifyPhoneValue(target.phone), classifyPhoneValue(candidate.phone));
  const name = compareNames(target.name, candidate.name);
  const vehicleLink =
    target.linkedVehiclePlate && candidate.linkedVehiclePlate
      ? comparePlateValues(classifyPlateValue(target.linkedVehiclePlate), classifyPlateValue(candidate.linkedVehiclePlate))
      : ({ verdict: "unknown", strength: "weak" } as ComparisonResult);
  const evidence: CustomerPairEvidence = { phone, name, vehicleLink };

  // Contradição de telefone só é significativa quando há uma razão independente para achar que
  // estes dois registros PODERIAM ser a mesma pessoa — aqui, o nome bater (cenário 12: "mesmo
  // nome, telefones completos diferentes"). Sem essa correlação, um telefone diferente entre duas
  // pessoas de nomes diferentes é só... duas pessoas diferentes — ruído esperado, não contradição.
  // Descoberto na própria simulação desta missão (seção 18): sem este filtro, comparar cada
  // cliente contra TODOS os outros 259 da base marcava praticamente todo mundo como "contradição"
  // só por existir gente com telefone diferente por aí — o que é óbvio e não informativo.
  if (phone.verdict === "mismatch" && phone.strength === "strong" && name === "match") {
    return { candidateId: candidate.id, signal: "contradiction", evidence };
  }
  if (phone.verdict === "match" && phone.strength === "strong") {
    return { candidateId: candidate.id, signal: "strong_positive", evidence };
  }

  // vehicleLink nunca entra como contradição (seção 19) — só soma quando bate.
  const positives = [phone.verdict === "match", name === "match", vehicleLink.verdict === "match"].filter(Boolean).length;
  if (positives >= 2) return { candidateId: candidate.id, signal: "moderate_positive", evidence };
  if (positives === 1) return { candidateId: candidate.id, signal: "weak_positive", evidence };
  return { candidateId: candidate.id, signal: "none", evidence };
}

/** Compara um cliente-alvo contra uma lista de candidatos já existentes — nunca decide fusão, só classifica (seção 13) com unicidade de candidato (seção 14). */
export function resolveCustomerIdentity(target: CustomerCandidateInput, candidates: CustomerCandidateInput[]): ResolutionResult<CustomerPairEvidence> {
  return classifyFromPairSignals(candidates.map((c) => evaluateCustomerPair(target, c)));
}

export interface VehicleCandidateInput {
  id: string;
  plate: string | null;
  model: string | null;
}

export interface VehiclePairEvidence {
  plate: ComparisonResult;
  model: "match" | "mismatch" | "unknown";
}

function evaluateVehiclePair(target: VehicleCandidateInput, candidate: VehicleCandidateInput): PairEvaluation<VehiclePairEvidence> {
  const plate = comparePlateValues(classifyPlateValue(target.plate), classifyPlateValue(candidate.plate));
  const model = compareModels(target.model, candidate.model);
  const evidence: VehiclePairEvidence = { plate, model };

  // Contradição de placa (dado determinístico para o VEÍCULO, nunca para o dono — seção 20) sempre vence.
  if (plate.verdict === "mismatch" && plate.strength === "strong") {
    return { candidateId: candidate.id, signal: "contradiction", evidence };
  }
  if (plate.verdict === "match" && plate.strength === "strong") {
    return { candidateId: candidate.id, signal: "strong_positive", evidence };
  }

  const positives = [plate.verdict === "match", model === "match"].filter(Boolean).length;
  if (positives >= 2) return { candidateId: candidate.id, signal: "moderate_positive", evidence };
  if (positives === 1) return { candidateId: candidate.id, signal: "weak_positive", evidence };
  return { candidateId: candidate.id, signal: "none", evidence };
}

/**
 * Compara um veículo-alvo contra candidatos existentes — responde só "é o MESMO VEÍCULO",
 * nunca "é o mesmo dono" (seção 20: placa identifica veículo, não necessariamente o proprietário
 * histórico; a resolução de dono é sempre `resolveCustomerIdentity`, função separada e sem
 * nenhuma dependência deste módulo).
 */
export function resolveVehicleIdentity(target: VehicleCandidateInput, candidates: VehicleCandidateInput[]): ResolutionResult<VehiclePairEvidence> {
  return classifyFromPairSignals(candidates.map((c) => evaluateVehiclePair(target, c)));
}
