CREATE TYPE "public"."discount_reason" AS ENUM('recorrente', 'pacote', 'negociacao', 'cortesia', 'correcao', 'campanha', 'outro');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('critico', 'atencao', 'informativo');--> statement-breakpoint
CREATE TYPE "public"."notification_recipient" AS ENUM('proprietario', 'gerente', 'ambos');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('nova', 'vista', 'resolvida');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"priority" "notification_priority" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source_order_id" uuid,
	"source_customer_id" uuid,
	"source_vehicle_id" uuid,
	"recipient" "notification_recipient" NOT NULL,
	"status" "notification_status" DEFAULT 'nova' NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "service_order_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_order_id" uuid NOT NULL,
	"original_value" numeric(12, 2) NOT NULL,
	"final_value" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) NOT NULL,
	"discount_percent" numeric(5, 2) NOT NULL,
	"reason" "discount_reason" NOT NULL,
	"applied_by" text NOT NULL,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_order_id_service_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "public"."service_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_customer_id_customers_id_fk" FOREIGN KEY ("source_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_vehicle_id_vehicles_id_fk" FOREIGN KEY ("source_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order_discounts" ADD CONSTRAINT "service_order_discounts_service_order_id_service_orders_id_fk" FOREIGN KEY ("service_order_id") REFERENCES "public"."service_orders"("id") ON DELETE no action ON UPDATE no action;