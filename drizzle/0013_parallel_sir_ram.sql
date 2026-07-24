CREATE TYPE "public"."confidence_level" AS ENUM('alta', 'media', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."director_id" AS ENUM('financeiro', 'comercial', 'marketing', 'operacoes', 'estoque', 'rh', 'estrategico', 'inteligencia');--> statement-breakpoint
CREATE TYPE "public"."fact_direction" AS ENUM('aumento', 'queda', 'estavel', 'indisponivel');--> statement-breakpoint
CREATE TYPE "public"."learning_status" AS ENUM('observacao', 'aprendizado', 'conhecimento', 'descartado');--> statement-breakpoint
CREATE TYPE "public"."strategic_memory_item_kind" AS ENUM('meta', 'projeto', 'objetivo');--> statement-breakpoint
CREATE TABLE "director_daily_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"director_id" "director_id" NOT NULL,
	"snapshot_date" date NOT NULL,
	"summary" text NOT NULL,
	"metric_key" text,
	"direction" "fact_direction" NOT NULL,
	"evidence_fact_keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "director_learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"director_id" "director_id" NOT NULL,
	"signal_key" text NOT NULL,
	"description" text NOT NULL,
	"evidence_fact_keys" jsonb NOT NULL,
	"status" "learning_status" DEFAULT 'observacao' NOT NULL,
	"confidence_level" "confidence_level" NOT NULL,
	"confirmation_count" integer DEFAULT 1 NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"limitations" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizational_beliefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement" text NOT NULL,
	"category" text,
	"source" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizational_beliefs_statement_unique" UNIQUE("statement")
);
--> statement-breakpoint
CREATE TABLE "strategic_memory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "strategic_memory_item_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence_fact_keys" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "director_daily_snapshots_director_date_idx" ON "director_daily_snapshots" USING btree ("director_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "director_learnings_director_signal_idx" ON "director_learnings" USING btree ("director_id","signal_key");--> statement-breakpoint
CREATE UNIQUE INDEX "strategic_memory_items_kind_title_idx" ON "strategic_memory_items" USING btree ("kind","title");