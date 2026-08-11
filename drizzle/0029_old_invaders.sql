CREATE TYPE "public"."recipe_confidence_tier" AS ENUM('tecnico', 'em_calibracao', 'calibrado');--> statement-breakpoint
CREATE TABLE "historical_theoretical_consumption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jumppark_order_external_id" text NOT NULL,
	"order_date" date NOT NULL,
	"item_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"vehicle_category" "order_vehicle_category" NOT NULL,
	"process_step" "process_step" NOT NULL,
	"recipe_id" uuid NOT NULL,
	"confidence_tier" "recipe_confidence_tier" NOT NULL,
	"theoretical_quantity" numeric(12, 3) NOT NULL,
	"unit" "inventory_unit" NOT NULL,
	"theoretical_unit_cost" numeric(12, 2),
	"theoretical_cost" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_theoretical_consumption_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "historical_theoretical_consumption" ADD CONSTRAINT "historical_theoretical_consumption_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_theoretical_consumption" ADD CONSTRAINT "historical_theoretical_consumption_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_theoretical_consumption" ADD CONSTRAINT "historical_theoretical_consumption_recipe_id_service_consumption_rules_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."service_consumption_rules"("id") ON DELETE no action ON UPDATE no action;