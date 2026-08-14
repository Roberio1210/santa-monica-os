CREATE TYPE "public"."bank_statement_import_status" AS ENUM('previa', 'processado');--> statement-breakpoint
CREATE TYPE "public"."bank_statement_line_direction" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TYPE "public"."bank_statement_line_status" AS ENUM('conciliado', 'sugerido', 'nao_conciliado', 'a_classificar', 'ignorado');--> statement-breakpoint
CREATE TYPE "public"."bank_statement_line_type" AS ENUM('recebimento_venda_stone', 'antecipacao_credito', 'pix_recebido', 'pix_enviado', 'transferencia_entrada', 'transferencia_saida', 'pagamento', 'tarifa', 'mensalidade_stone', 'devolucao', 'outro');--> statement-breakpoint
CREATE TABLE "bank_statement_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"file_format" text NOT NULL,
	"filename" text,
	"period_from" date,
	"period_to" date,
	"imported_by" text NOT NULL,
	"status" "bank_statement_import_status" DEFAULT 'previa' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"new_row_count" integer DEFAULT 0 NOT NULL,
	"duplicate_row_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"raw_data" jsonb NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"counterparty" text,
	"direction" "bank_statement_line_direction" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"type" "bank_statement_line_type" NOT NULL,
	"status" "bank_statement_line_status" DEFAULT 'nao_conciliado' NOT NULL,
	"category_id" uuid,
	"supplier_id" uuid,
	"partner_id" uuid,
	"matched_stone_amount" numeric(12, 2),
	"matched_stone_divergence" numeric(12, 2),
	"linked_accounts_receivable_id" uuid,
	"linked_accounts_payable_id" uuid,
	"linked_cash_movement_id" uuid,
	"linked_account_transfer_id" uuid,
	"reconciliation_note" text,
	"processed_by" text,
	"dedupe_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_lines_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_import_id_bank_statement_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bank_statement_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_linked_accounts_receivable_id_accounts_receivable_id_fk" FOREIGN KEY ("linked_accounts_receivable_id") REFERENCES "public"."accounts_receivable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_linked_accounts_payable_id_accounts_payable_id_fk" FOREIGN KEY ("linked_accounts_payable_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_linked_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("linked_cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_linked_account_transfer_id_account_transfers_id_fk" FOREIGN KEY ("linked_account_transfer_id") REFERENCES "public"."account_transfers"("id") ON DELETE no action ON UPDATE no action;