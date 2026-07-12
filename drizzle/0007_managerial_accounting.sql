CREATE TYPE "public"."accounting_period_status" AS ENUM('aberto', 'em_revisao', 'fechado', 'reaberto');--> statement-breakpoint
CREATE TYPE "public"."classification_match_type" AS ENUM('fornecedor', 'parceiro', 'categoria', 'palavra_chave');--> statement-breakpoint
CREATE TYPE "public"."classification_origin" AS ENUM('regra_automatica', 'herdada_categoria', 'herdada_fornecedor', 'herdada_cliente', 'manual', 'importacao_futura', 'pendente');--> statement-breakpoint
CREATE TYPE "public"."dre_line" AS ENUM('receita_bruta', 'deducoes_receita', 'custos_diretos', 'despesas_operacionais', 'resultado_financeiro', 'tributos', 'fora_dre');--> statement-breakpoint
CREATE TYPE "public"."financial_nature" AS ENUM('receita_operacional', 'deducao_receita', 'custo_direto', 'despesa_operacional', 'resultado_financeiro', 'investimento', 'ativo', 'passivo', 'transferencia', 'aporte', 'retirada', 'reembolso', 'nao_classificavel');--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competence_month" text NOT NULL,
	"status" "accounting_period_status" DEFAULT 'aberto' NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"reopened_by" text,
	"reopened_at" timestamp with time zone,
	"reopen_justification" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_periods_competence_month_unique" UNIQUE("competence_month")
);
--> statement-breakpoint
CREATE TABLE "allocation_rule_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_rule_id" uuid NOT NULL,
	"cost_center_id" uuid NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_type" "classification_match_type" NOT NULL,
	"supplier_id" uuid,
	"partner_id" uuid,
	"category_id" uuid,
	"keyword" text,
	"dre_line" "dre_line" NOT NULL,
	"nature" "financial_nature" NOT NULL,
	"suggested_cost_center_id" uuid,
	"include_in_dre" boolean DEFAULT true NOT NULL,
	"review_needed" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classification_rules_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "financial_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accounts_payable_id" uuid,
	"accounts_receivable_id" uuid,
	"cash_movement_id" uuid,
	"account_transfer_id" uuid,
	"dre_line" "dre_line" NOT NULL,
	"nature" "financial_nature" NOT NULL,
	"include_in_dre" boolean DEFAULT true NOT NULL,
	"origin" "classification_origin" NOT NULL,
	"review_needed" boolean DEFAULT false NOT NULL,
	"classified_by" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_classifications_accounts_payable_id_unique" UNIQUE("accounts_payable_id"),
	CONSTRAINT "financial_classifications_accounts_receivable_id_unique" UNIQUE("accounts_receivable_id"),
	CONSTRAINT "financial_classifications_cash_movement_id_unique" UNIQUE("cash_movement_id"),
	CONSTRAINT "financial_classifications_account_transfer_id_unique" UNIQUE("account_transfer_id")
);
--> statement-breakpoint
ALTER TABLE "allocation_rule_shares" ADD CONSTRAINT "allocation_rule_shares_allocation_rule_id_allocation_rules_id_fk" FOREIGN KEY ("allocation_rule_id") REFERENCES "public"."allocation_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_rule_shares" ADD CONSTRAINT "allocation_rule_shares_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_suggested_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("suggested_cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_classifications" ADD CONSTRAINT "financial_classifications_accounts_payable_id_accounts_payable_id_fk" FOREIGN KEY ("accounts_payable_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_classifications" ADD CONSTRAINT "financial_classifications_accounts_receivable_id_accounts_receivable_id_fk" FOREIGN KEY ("accounts_receivable_id") REFERENCES "public"."accounts_receivable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_classifications" ADD CONSTRAINT "financial_classifications_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_classifications" ADD CONSTRAINT "financial_classifications_account_transfer_id_account_transfers_id_fk" FOREIGN KEY ("account_transfer_id") REFERENCES "public"."account_transfers"("id") ON DELETE no action ON UPDATE no action;