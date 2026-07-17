CREATE TYPE "public"."calibration_sample_status" AS ENUM('valida', 'excluida');--> statement-breakpoint
CREATE TYPE "public"."process_step" AS ENUM('pre_lavagem', 'shampoo', 'rodas', 'caixas_de_rodas', 'aspiracao', 'limpeza_interna', 'couro', 'plasticos_internos', 'vidros', 'cera', 'protecao_externa', 'pneus', 'motor', 'chassi', 'polimento_corte', 'polimento_refino', 'polimento_lustro', 'vitrificacao', 'higienizacao', 'farois', 'chuva_acida', 'cristalizacao', 'revisao_final');--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('rascunho', 'em_calibracao', 'aprovada', 'suspensa');--> statement-breakpoint
CREATE TYPE "public"."vehicle_category" AS ENUM('hatch', 'sedan', 'suv', 'caminhonete');--> statement-breakpoint
CREATE TABLE "process_step_product_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"process_step" "process_step" NOT NULL,
	"item_id" uuid NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_calibration_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"service_order_external_id" text,
	"date" date NOT NULL,
	"quantity_before" numeric(12, 3) NOT NULL,
	"quantity_after" numeric(12, 3) NOT NULL,
	"prepared_quantity" numeric(12, 3),
	"leftover_reused" numeric(12, 3),
	"discarded" numeric(12, 3),
	"dilution_ratio" numeric(8, 2),
	"concentrate_consumed" numeric(12, 3) NOT NULL,
	"responsible_name" text,
	"status" "calibration_sample_status" DEFAULT 'valida' NOT NULL,
	"exclusion_reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ALTER COLUMN "quantity_per_service" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "vehicle_category" "vehicle_category" NOT NULL;--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "process_step" "process_step" NOT NULL;--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "status" "recipe_status" DEFAULT 'rascunho' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "is_active_version" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "dilution_ratio" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "min_observed" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "max_observed" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "sample_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "last_calibrated_at" date;--> statement-breakpoint
ALTER TABLE "process_step_product_suggestions" ADD CONSTRAINT "process_step_product_suggestions_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_calibration_samples" ADD CONSTRAINT "recipe_calibration_samples_recipe_id_service_consumption_rules_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."service_consumption_rules"("id") ON DELETE no action ON UPDATE no action;