CREATE TYPE "public"."stone_fee_schedule_brand" AS ENUM('visa', 'mastercard', 'elo', 'amex');--> statement-breakpoint
CREATE TYPE "public"."stone_fee_schedule_payment_method" AS ENUM('debito', 'credito');--> statement-breakpoint
CREATE TYPE "public"."stone_fee_schedule_rate_type" AS ENUM('regular', 'incentivada', 'observado_historico');--> statement-breakpoint
CREATE TYPE "public"."stone_fee_schedule_settlement_mode" AS ENUM('d0', 'd1', 'nenhuma', 'indeterminado');--> statement-breakpoint
CREATE TYPE "public"."stone_fee_schedule_source" AS ENUM('contrato_pdf', 'reconstrucao_historica_dados_reais', 'legado_feetable_nao_comprovado');--> statement-breakpoint
CREATE TABLE "stone_fee_schedule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'stone' NOT NULL,
	"brand" "stone_fee_schedule_brand" NOT NULL,
	"payment_method" "stone_fee_schedule_payment_method" NOT NULL,
	"installments" integer NOT NULL,
	"cet_rate" numeric(6, 4),
	"settlement_mode" "stone_fee_schedule_settlement_mode" DEFAULT 'indeterminado' NOT NULL,
	"settlement_rate" numeric(6, 4),
	"expected_effective_rate" numeric(6, 4) NOT NULL,
	"rate_type" "stone_fee_schedule_rate_type" NOT NULL,
	"is_incentivized" boolean DEFAULT false NOT NULL,
	"source" "stone_fee_schedule_source" NOT NULL,
	"source_reference" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stone_fee_schedule_versions_natural_key_idx" ON "stone_fee_schedule_versions" USING btree ("brand","payment_method","installments","effective_from");