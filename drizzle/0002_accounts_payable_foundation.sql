CREATE TYPE "public"."account_transfer_type" AS ENUM('transferencia', 'reposicao_caixa');--> statement-breakpoint
CREATE TYPE "public"."accounts_payable_status" AS ENUM('rascunho', 'pendente', 'parcialmente_paga', 'paga', 'vencida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."financial_account_type" AS ENUM('conta_pagamento', 'conta_bancaria', 'dinheiro');--> statement-breakpoint
CREATE TABLE "account_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "account_transfer_type" NOT NULL,
	"from_account_id" uuid,
	"to_account_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_transfers_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "accounts_payable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"supplier_id" uuid,
	"category_id" uuid NOT NULL,
	"cost_center_id" uuid,
	"financial_account_id" uuid,
	"competence_date" date NOT NULL,
	"issue_date" date,
	"due_date" date NOT NULL,
	"original_amount" numeric(12, 2) NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"outstanding_amount" numeric(12, 2) NOT NULL,
	"payment_method" "payment_method_extended" DEFAULT 'desconhecido' NOT NULL,
	"document_number" text,
	"status" "accounts_payable_status" DEFAULT 'pendente' NOT NULL,
	"pending_data" boolean DEFAULT false NOT NULL,
	"recurring_bill_template_id" uuid,
	"installment_group_id" uuid,
	"installment_number" integer,
	"installment_total" integer,
	"attachment_ref" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_payable_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "financial_account_type" NOT NULL,
	"fixed_fund_amount" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_accounts_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "recurring_bill_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"supplier_id" uuid,
	"category_id" uuid,
	"cost_center_id" uuid,
	"financial_account_id" uuid,
	"amount" numeric(12, 2),
	"variable_amount" boolean DEFAULT false NOT NULL,
	"due_day" integer,
	"periodicity" text DEFAULT 'mensal' NOT NULL,
	"pending_data" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_bill_templates_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"tax_id" text,
	"phone" text,
	"email" text,
	"address" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "financial_account_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "accounts_payable_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "financial_account_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reversed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_from_account_id_financial_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_to_account_id_financial_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_recurring_bill_template_id_recurring_bill_templates_id_fk" FOREIGN KEY ("recurring_bill_template_id") REFERENCES "public"."recurring_bill_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bill_templates" ADD CONSTRAINT "recurring_bill_templates_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bill_templates" ADD CONSTRAINT "recurring_bill_templates_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bill_templates" ADD CONSTRAINT "recurring_bill_templates_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bill_templates" ADD CONSTRAINT "recurring_bill_templates_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_accounts_payable_id_accounts_payable_id_fk" FOREIGN KEY ("accounts_payable_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;