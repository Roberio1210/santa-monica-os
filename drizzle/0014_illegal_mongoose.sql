CREATE TYPE "public"."stone_divergence_priority" AS ENUM('alta', 'media', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."stone_divergence_type" AS ENUM('venda_jumppark_nao_encontrada_na_stone', 'transacao_stone_nao_encontrada_no_jumppark', 'diferenca_de_valor', 'diferenca_forma_pagamento', 'diferenca_parcelamento', 'possivel_duplicidade', 'cancelamento_nao_refletido_internamente', 'estorno', 'chargeback', 'correspondencia_ambigua', 'arquivo_stone_ausente_ou_defasado');--> statement-breakpoint
CREATE TYPE "public"."stone_file_layout" AS ENUM('XML2_2', 'XML2_4');--> statement-breakpoint
CREATE TYPE "public"."stone_import_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."stone_match_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."stone_match_type" AS ENUM('exact_match', 'probable_match', 'ambiguous', 'unmatched_jumppark', 'unmatched_stone', 'value_mismatch', 'payment_method_mismatch', 'installment_mismatch', 'date_mismatch', 'duplicate', 'reversed', 'pending_processing');--> statement-breakpoint
CREATE TYPE "public"."stone_receivable_state" AS ENUM('scheduled', 'due_today', 'settled_on_time', 'settled_early', 'overdue', 'cancelled', 'reversed', 'chargeback', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."stone_result_status" AS ENUM('ok', 'not_configured', 'temporary_failure', 'stale_data', 'insufficient_permission', 'no_data');--> statement-breakpoint
CREATE TYPE "public"."stone_review_status" AS ENUM('open', 'under_review', 'confirmed_issue', 'resolved', 'ignored', 'pending_processing');--> statement-breakpoint
CREATE TYPE "public"."stone_transaction_event_type" AS ENUM('sale', 'cancellation', 'chargeback', 'chargeback_refund');--> statement-breakpoint
CREATE TABLE "stone_divergences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"natural_key" text NOT NULL,
	"type" "stone_divergence_type" NOT NULL,
	"priority" "stone_divergence_priority" NOT NULL,
	"financial_impact" numeric(14, 2) NOT NULL,
	"evidence" jsonb NOT NULL,
	"involved_stone_sale_external_key" text,
	"involved_jumppark_order_external_id" text,
	"confidence" "stone_match_confidence" NOT NULL,
	"recommendation" text NOT NULL,
	"status" "stone_review_status" DEFAULT 'open' NOT NULL,
	"assignee" text,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stone_divergences_natural_key_unique" UNIQUE("natural_key")
);
--> statement-breakpoint
CREATE TABLE "stone_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_period_from" date,
	"requested_period_to" date,
	"reference_date" date NOT NULL,
	"layout" "stone_file_layout" NOT NULL,
	"file_hash" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "stone_import_run_status" DEFAULT 'running' NOT NULL,
	"record_count" integer,
	"error_sanitized" text,
	"failure_status" "stone_result_status",
	"origin" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stone_normalized_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_key" text NOT NULL,
	"acquirer_transaction_key" text NOT NULL,
	"authorization_code" text NOT NULL,
	"initiator_transaction_key" text,
	"establishment_code" text NOT NULL,
	"terminal_serial_number" text,
	"captured_at" timestamp with time zone NOT NULL,
	"installment_number" integer NOT NULL,
	"gross_amount" numeric(14, 2) NOT NULL,
	"fee_amount" numeric(14, 2) NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"payment_method" text,
	"brand_id" text,
	"event_type" "stone_transaction_event_type" NOT NULL,
	"receivable_state" "stone_receivable_state" NOT NULL,
	"expected_payment_date" date,
	"settled_payment_date" date,
	"settled_amount" numeric(14, 2),
	"source_file" text NOT NULL,
	"import_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stone_normalized_transactions_external_key_unique" UNIQUE("external_key")
);
--> statement-breakpoint
CREATE TABLE "stone_reconciliation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"natural_key" text NOT NULL,
	"stone_sale_external_key" text,
	"jumppark_order_external_id" text,
	"match_type" "stone_match_type" NOT NULL,
	"confidence" "stone_match_confidence" NOT NULL,
	"heuristic_score" integer,
	"favorable_signals" jsonb NOT NULL,
	"contrary_signals" jsonb NOT NULL,
	"rule_applied" text NOT NULL,
	"review_status" "stone_review_status" DEFAULT 'open' NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stone_reconciliation_results_natural_key_unique" UNIQUE("natural_key")
);
--> statement-breakpoint
ALTER TABLE "stone_normalized_transactions" ADD CONSTRAINT "stone_normalized_transactions_import_run_id_stone_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."stone_import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stone_import_runs_reference_date_layout_idx" ON "stone_import_runs" USING btree ("reference_date","layout");