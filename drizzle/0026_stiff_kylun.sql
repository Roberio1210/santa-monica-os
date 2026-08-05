CREATE TABLE "jumppark_service_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_order_id" uuid NOT NULL,
	"description" text,
	"quantity" integer,
	"amount" numeric(12, 2),
	"service_contract_id" text,
	"commissioners" jsonb,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "vehicle_color" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "client_email" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "staff_entry_name" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "staff_exit_name" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "operation_situation_name" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "situation_id" integer;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "financial_situation_id" integer;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "discount_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "discount_type" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "type_price" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "card_code" integer;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "establishment_id" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "establishment_name" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "observations" jsonb;--> statement-breakpoint
ALTER TABLE "jumppark_service_order_items" ADD CONSTRAINT "jumppark_service_order_items_service_order_id_jumppark_service_orders_id_fk" FOREIGN KEY ("service_order_id") REFERENCES "public"."jumppark_service_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jumppark_service_order_items_service_order_id_idx" ON "jumppark_service_order_items" USING btree ("service_order_id");