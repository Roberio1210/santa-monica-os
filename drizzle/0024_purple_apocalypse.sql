CREATE TYPE "public"."item_classification" AS ENUM('quimico_volume', 'solido_peso', 'consumivel_unidade', 'epi', 'ferramenta', 'equipamento', 'patrimonio', 'manutencao', 'material_divulgacao', 'brinde_cliente', 'nao_controlado');--> statement-breakpoint
CREATE TYPE "public"."purchase_import_status" AS ENUM('previa', 'parcial', 'concluido');--> statement-breakpoint
CREATE TYPE "public"."purchase_line_decision" AS ENUM('vincular_existente', 'criar_produto', 'ignorar', 'patrimonio', 'despesa_manutencao', 'revisar_depois');--> statement-breakpoint
CREATE TYPE "public"."purchase_line_status" AS ENUM('pendente', 'confirmado', 'ignorado', 'duplicado');--> statement-breakpoint
CREATE TYPE "public"."purchase_match_status" AS ENUM('encontrado', 'possivel', 'nao_encontrado');--> statement-breakpoint
CREATE TABLE "inventory_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"reason" text,
	"actor" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_consolidation_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consolidation_id" uuid NOT NULL,
	"merged_item_id" uuid NOT NULL,
	"previous_balance" numeric(12, 3) NOT NULL,
	"previous_unit_cost" numeric(12, 2),
	"converted_quantity" numeric(12, 3) NOT NULL,
	"transfer_movement_id" uuid,
	"receiving_movement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_consolidations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master_item_id" uuid NOT NULL,
	"unit_base" "inventory_unit" NOT NULL,
	"reason" text,
	"performed_by" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_import_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"external_id" text,
	"row_index" integer NOT NULL,
	"raw_data" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"validation_errors" jsonb,
	"date" date,
	"invoice_number" text,
	"supplier_name" text,
	"supplier_cnpj" text,
	"nfe_key" text,
	"product_description" text,
	"brand" text,
	"package_count" numeric(12, 3),
	"package_quantity" numeric(12, 3),
	"package_unit" text,
	"total_converted_quantity" numeric(12, 3),
	"base_unit" "inventory_unit",
	"unit_price_per_package" numeric(12, 2),
	"total_item_value" numeric(12, 2),
	"freight_allocated" numeric(12, 2),
	"discount_allocated" numeric(12, 2),
	"final_value" numeric(12, 2),
	"observation" text,
	"dedupe_key" text,
	"matched_item_id" uuid,
	"match_status" "purchase_match_status",
	"match_candidates" jsonb,
	"classification" "item_classification",
	"decision" "purchase_line_decision",
	"status" "purchase_line_status" DEFAULT 'pendente' NOT NULL,
	"resulting_movement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_import_lines_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "purchase_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_format" text NOT NULL,
	"filename" text,
	"imported_by" text NOT NULL,
	"status" "purchase_import_status" DEFAULT 'previa' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"valid_row_count" integer DEFAULT 0 NOT NULL,
	"invalid_row_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "classification" "item_classification";--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "canonical_item_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "consolidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_consolidation_members" ADD CONSTRAINT "inventory_consolidation_members_consolidation_id_inventory_consolidations_id_fk" FOREIGN KEY ("consolidation_id") REFERENCES "public"."inventory_consolidations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consolidation_members" ADD CONSTRAINT "inventory_consolidation_members_merged_item_id_inventory_items_id_fk" FOREIGN KEY ("merged_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consolidation_members" ADD CONSTRAINT "inventory_consolidation_members_transfer_movement_id_inventory_movements_id_fk" FOREIGN KEY ("transfer_movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consolidation_members" ADD CONSTRAINT "inventory_consolidation_members_receiving_movement_id_inventory_movements_id_fk" FOREIGN KEY ("receiving_movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_consolidations" ADD CONSTRAINT "inventory_consolidations_master_item_id_inventory_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_import_lines" ADD CONSTRAINT "purchase_import_lines_import_id_purchase_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."purchase_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_import_lines" ADD CONSTRAINT "purchase_import_lines_matched_item_id_inventory_items_id_fk" FOREIGN KEY ("matched_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_import_lines" ADD CONSTRAINT "purchase_import_lines_resulting_movement_id_inventory_movements_id_fk" FOREIGN KEY ("resulting_movement_id") REFERENCES "public"."inventory_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_canonical_item_id_inventory_items_id_fk" FOREIGN KEY ("canonical_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;