import { date, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";
import { users } from "./auth";
import { cashMovements } from "./finance";

/**
 * RH modelado em duas trilhas independentes (CLT x PJ), conforme
 * docs/hr-module-architecture.md — nenhuma regra é compartilhada entre elas.
 */

export const employees = pgTable("employees", {
  id: id(),
  userId: uuid("user_id").references(() => users.id),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(),
  admissionDate: date("admission_date"),
  workSchedule: text("work_schedule"),
  /** Salário base. Null até ser informado — nunca inferido. */
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

export const contractorTypeEnum = pgEnum("contractor_type", ["pessoa_fisica", "pessoa_juridica"]);

export const contractors = pgTable("contractors", {
  id: id(),
  userId: uuid("user_id").references(() => users.id),
  businessName: text("business_name").notNull(),
  type: contractorTypeEnum("type").notNull().default("pessoa_juridica"),
  taxId: text("tax_id"),
  contactPhone: text("contact_phone"),
  scope: text("scope"),
  /** Valor fixo mensal ou base de comissão — modelo simples nesta fase, sem invenção de valores. */
  agreedValue: numeric("agreed_value", { precision: 12, scale: 2 }),
  contractStart: date("contract_start"),
  contractEnd: date("contract_end"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

export const documentSubjectTypeEnum = pgEnum("document_subject_type", ["employee", "contractor"]);
export const documentTypeEnum = pgEnum("document_type", [
  "contrato",
  "exame",
  "atestado",
  "advertencia",
  "nota_fiscal",
  "identidade",
  "ferias",
  "outro",
]);

export const employeeDocuments = pgTable("employee_documents", {
  id: id(),
  subjectType: documentSubjectTypeEnum("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  /** Referência ao arquivo em armazenamento externo (ex.: Vercel Blob) — upload não implementado ainda. */
  fileRef: text("file_ref"),
  issueDate: date("issue_date"),
  expiresAt: date("expires_at"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Missão 86 (Departamento Pessoal) — camada semântica que explica a NATUREZA de um pagamento a
 * colaborador (CLT ou PJ), sem duplicar o fato financeiro: `cashMovementId` aponta para o
 * `cash_movements` real já criado pelo financeiro (`recordPayablePayment`/`createCashMovement`/
 * `processBankStatementLine`) quando ele existir. Nunca soma tudo como "salário" — a categoria
 * aqui é o que separa diária/freelancer de adiantamento de encargo, etc. (Parte C/3 da missão).
 *
 * `subjectId` é NULLABLE de propósito: um encargo trabalhista (ex.: guia de FGTS) pode cobrir a
 * empresa inteira, nunca deve ser atribuído a um colaborador específico sem base documental
 * (nota fiscal/discriminação por CPF) — nesse caso o registro fica sem `subjectId`, visível só no
 * agregado de "Encargos" do DP, nunca no histórico individual de alguém.
 */
/**
 * `comissao`/`bonus` — regra de timing (não é coluna, é regra de negócio observada manualmente):
 * histórico (julho/agosto/2026 e antes) pagas por volta do dia 10 do mês seguinte à competência;
 * a partir do próximo ciclo passam a ser pagas no dia 15 (mudança só prospectiva — nunca reabre
 * competências já fechadas). Ver também `docs/hr-module-architecture.md`.
 *
 * `beneficio_auxilio` (Missão DP — categoria de benefício, 20/09/2026) — vale-transporte,
 * vale-alimentação/lanche e benefícios semelhantes, sempre que EXPLICITAMENTE confirmados como
 * tal. Nunca inferido automaticamente por proximidade de valor: um pagamento só migra para esta
 * categoria por decisão explícita registrada (ex.: R$450 de Paulo/Jorge Cauã, parte fixa de
 * transporte+lanche dentro do ciclo mensal de R$2.600,00). Deliberadamente distinto de
 * `salario_fixo` (remuneração-base) e de `reembolso` (devolução de gasto que o próprio
 * colaborador adiantou) — misturar os três impediria a análise gerencial de quanto do custo de
 * pessoal é remuneração pura vs. benefício vs. devolução de despesa.
 */
export const employeePaymentCategoryEnum = pgEnum("employee_payment_category", [
  "salario_fixo",
  "comissao",
  "bonus",
  "diaria_freelancer",
  "adiantamento",
  "beneficio_auxilio",
  "reembolso",
  "desconto_compensacao",
  "rescisao",
  "ferias",
  "decimo_terceiro",
  "encargo",
  "outro",
]);

export const employeePayments = pgTable("employee_payments", {
  id: id(),
  /** Nullable — ver comentário acima (encargo não atribuído a uma pessoa). */
  subjectType: documentSubjectTypeEnum("subject_type"),
  subjectId: uuid("subject_id"),
  category: employeePaymentCategoryEnum("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  /** Data efetiva do pagamento (caixa) — nunca confundir com competência. */
  date: date("date").notNull(),
  /** Competência econômica, quando diferente da data de pagamento (ex.: FGTS de agosto pago em setembro). Null quando não determinada. */
  competenceDate: date("competence_date"),
  description: text("description").notNull(),
  /** Vínculo com o registro financeiro real — nunca um valor solto/paralelo ao financeiro. */
  cashMovementId: uuid("cash_movement_id").references(() => cashMovements.id),
  /**
   * Fase 4 do Departamento Pessoal (20/09/2026) — garantia real de idempotência no banco para
   * "Registrar pagamento" (duplo clique, refresh, retry de rede, duas requisições concorrentes
   * nunca criam dois pagamentos), mesmo padrão já maduro de
   * `inventory_consumption_confirmations.idempotency_key` (`src/db/schema/inventory.ts`) — UNIQUE
   * é a garantia real, não apenas uma checagem de aplicação. Nullable de propósito: todo o
   * histórico já existente (backfill de missões anteriores) nunca teve essa chave e continua
   * válido — Postgres trata múltiplos `NULL` como distintos numa constraint UNIQUE, então isso
   * nunca colide entre si nem impede nenhum registro antigo. Calculada no SERVIDOR (nunca confiada
   * do cliente) a partir dos campos normalizados do pagamento — determinística, não aleatória, para
   * também proteger contra um F5/refresh seguido de reenvio do mesmo formulário (um UUID aleatório
   * gerado só no cliente não sobreviveria a um refresh).
   */
  idempotencyKey: text("idempotency_key").unique(),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Missão 86 — adiantamento como entidade própria (nunca um `cash_movement` solto): precisa de
 * estado (aberto/parcialmente_compensado/compensado) e saldo, que `cash_movements` não modela.
 * `employeePaymentId` aponta para o `employee_payments` (categoria "adiantamento") que registrou
 * a saída do dinheiro; a compensação futura (quando descontada de um pagamento seguinte) é
 * representada atualizando `compensatedAmount`/`status` aqui — nunca apagando o adiantamento
 * original (soft-delete via `active`, mesmo padrão do resto do projeto).
 */
export const employeeAdvanceStatusEnum = pgEnum("employee_advance_status", ["aberto", "parcialmente_compensado", "compensado"]);

export const employeeAdvances = pgTable("employee_advances", {
  id: id(),
  subjectType: documentSubjectTypeEnum("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: date("date").notNull(),
  reason: text("reason"),
  status: employeeAdvanceStatusEnum("status").notNull().default("aberto"),
  /** Soma do que já foi descontado/compensado. Nunca maior que `amount` — validado na aplicação. */
  compensatedAmount: numeric("compensated_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  compensatedAt: date("compensated_at"),
  cashMovementId: uuid("cash_movement_id").references(() => cashMovements.id),
  employeePaymentId: uuid("employee_payment_id").references(() => employeePayments.id),
  /**
   * Fase 6 do Departamento Pessoal (20/09/2026) — mesma garantia real de idempotência no banco já
   * usada em `employee_payments.idempotency_key` (Fase 4): nullable (histórico nunca alterado,
   * `NULL` múltiplos nunca colidem numa constraint UNIQUE), calculada no servidor, determinística.
   */
  idempotencyKey: text("idempotency_key").unique(),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});
