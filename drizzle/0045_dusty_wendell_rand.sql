CREATE TABLE "service_price_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"vehicle_category" "vehicle_category",
	"variant_label" text,
	"price" numeric(12, 2) NOT NULL,
	"display_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_price_variants_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "short_description" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "detailed_description" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "estimated_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "benefits" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "indications" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "restrictions" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "requires_inspection" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "display_order" integer;--> statement-breakpoint
ALTER TABLE "service_price_variants" ADD CONSTRAINT "service_price_variants_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;