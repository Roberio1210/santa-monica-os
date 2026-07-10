import { date, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";
import { users } from "./auth";

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
