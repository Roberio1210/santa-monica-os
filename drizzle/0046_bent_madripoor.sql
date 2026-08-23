ALTER TYPE "public"."process_step" ADD VALUE 'simbolos';--> statement-breakpoint
ALTER TYPE "public"."process_step" ADD VALUE 'letras';--> statement-breakpoint
ALTER TYPE "public"."process_step" ADD VALUE 'macanetas';--> statement-breakpoint
ALTER TYPE "public"."process_step" ADD VALUE 'sanitizacao_interna';--> statement-breakpoint
ALTER TYPE "public"."process_step" ADD VALUE 'cera_carnauba';--> statement-breakpoint
ALTER TYPE "public"."process_step" ADD VALUE 'batentes';--> statement-breakpoint
ALTER TYPE "public"."process_step" ADD VALUE 'descontaminacao_ferrosa';--> statement-breakpoint
ALTER TYPE "public"."process_step" ADD VALUE 'cromados';--> statement-breakpoint
ALTER TYPE "public"."process_step" ADD VALUE 'estepe';--> statement-breakpoint
CREATE TABLE "commercial_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"max_discount_percent" numeric(5, 2) NOT NULL,
	"discount_progression_steps" jsonb NOT NULL,
	"installment_threshold_amount" numeric(12, 2) NOT NULL,
	"max_installments" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_complimentary_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"context" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_complimentary_options_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "service_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"role" text NOT NULL,
	"is_alternative" boolean DEFAULT false NOT NULL,
	"display_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_products_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "service_price_variants" ADD COLUMN "current_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "current_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "service_complimentary_options" ADD CONSTRAINT "service_complimentary_options_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_products" ADD CONSTRAINT "service_products_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_products" ADD CONSTRAINT "service_products_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;