CREATE TYPE "public"."recipe_dilution_basis" AS ENUM('concentrate', 'prepared_solution', 'pure_product');--> statement-breakpoint
CREATE TYPE "public"."recipe_information_source" AS ENUM('manufacturer', 'technical_datasheet', 'specialized_source', 'purchase_document', 'santa_monica_operation', 'calibrated_real_usage');--> statement-breakpoint
CREATE TYPE "public"."recipe_usage_type" AS ENUM('standard', 'conditional', 'alternative', 'specific_service', 'operational', 'durable');--> statement-breakpoint
CREATE TYPE "public"."technical_function" AS ENUM('pre_wash', 'shampoo', 'apc', 'degreaser', 'acid_cleaner', 'tire_cleaner', 'tire_dressing', 'glass_cleaner', 'glass_decontamination', 'glass_coating', 'interior_cleaner', 'upholstery_cleaner', 'sanitizer', 'leather_cleaner', 'leather_conditioner', 'plastic_dressing', 'exterior_dressing', 'tar_glue_remover', 'iron_remover', 'paint_decontamination', 'cut_compound', 'refinish_compound', 'finish_compound', 'polish_inspection', 'wax', 'sealant', 'paint_coating', 'plastic_coating', 'headlight_coating', 'coating_maintenance', 'engine_degreaser', 'engine_dressing', 'chassis_cleaner', 'metal_cleaner', 'microfiber_cleaner', 'pad', 'microfiber', 'sprayer', 'equipment', 'ppe', 'paint', 'paint_finisher', 'other');--> statement-breakpoint
CREATE TABLE "service_operational_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"process_step" "process_step" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_operational_steps_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "service_operational_steps_service_id_process_step_unique" UNIQUE("service_id","process_step")
);
--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ALTER COLUMN "service_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "technical_function" "technical_function";--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "usage_type" "recipe_usage_type";--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "usage_type" "recipe_usage_type";--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "technical_function" "technical_function";--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "information_source" "recipe_information_source";--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "dilution_basis" "recipe_dilution_basis";--> statement-breakpoint
ALTER TABLE "service_operational_steps" ADD CONSTRAINT "service_operational_steps_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;