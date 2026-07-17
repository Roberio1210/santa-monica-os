CREATE TYPE "public"."consumption_confirmation_status" AS ENUM('confirmada', 'parcial', 'estornada');--> statement-breakpoint
CREATE TYPE "public"."jumppark_service_mapping_status" AS ENUM('mapeado', 'nao_mapeado');--> statement-breakpoint
CREATE TYPE "public"."order_vehicle_category" AS ENUM('hatch', 'sedan', 'suv', 'caminhonete', 'desconhecido');--> statement-breakpoint
CREATE TABLE "inventory_consumption_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jumppark_order_external_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"vehicle_category" "order_vehicle_category" NOT NULL,
	"status" "consumption_confirmation_status" NOT NULL,
	"responsible_name" text NOT NULL,
	"justification" text,
	"removed_items_log" jsonb,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" text,
	"reversal_reason" text,
	"idempotency_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_consumption_confirmations_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "inventory_consumption_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"confirmation_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"recipe_id" uuid,
	"process_step" "process_step",
	"expected_quantity" numeric(12, 3),
	"confirmed_quantity" numeric(12, 3) NOT NULL,
	"unit" "inventory_unit" NOT NULL,
	"previous_balance" numeric(12, 3) NOT NULL,
	"new_balance" numeric(12, 3) NOT NULL,
	"movement_id" uuid NOT NULL,
	"reversal_movement_id" uuid,
	"is_extra" boolean DEFAULT false NOT NULL,
	"line_justification" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jumppark_service_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jumppark_service_name" text NOT NULL,
	"canonical_service_id" uuid,
	"status" "jumppark_service_mapping_status" DEFAULT 'nao_mapeado' NOT NULL,
	"last_validated_at" date,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jumppark_service_mappings_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_category_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plate_normalized" text NOT NULL,
	"category" "order_vehicle_category" DEFAULT 'desconhecido' NOT NULL,
	"previous_category" "order_vehicle_category",
	"responsible_name" text,
	"changed_at" timestamp with time zone,
	"reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_category_assignments_plate_normalized_unique" UNIQUE("plate_normalized")
);
--> statement-breakpoint
ALTER TABLE "inventory_consumption_lines" ADD CONSTRAINT "inventory_consumption_lines_confirmation_id_inventory_consumption_confirmations_id_fk" FOREIGN KEY ("confirmation_id") REFERENCES "public"."inventory_consumption_confirmations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consumption_lines" ADD CONSTRAINT "inventory_consumption_lines_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consumption_lines" ADD CONSTRAINT "inventory_consumption_lines_recipe_id_service_consumption_rules_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."service_consumption_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consumption_lines" ADD CONSTRAINT "inventory_consumption_lines_movement_id_inventory_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consumption_lines" ADD CONSTRAINT "inventory_consumption_lines_reversal_movement_id_inventory_movements_id_fk" FOREIGN KEY ("reversal_movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jumppark_service_mappings" ADD CONSTRAINT "jumppark_service_mappings_canonical_service_id_services_id_fk" FOREIGN KEY ("canonical_service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;