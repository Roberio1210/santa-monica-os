CREATE TABLE "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"external_message_id" text NOT NULL,
	"customer_id" uuid,
	"message_type" text DEFAULT 'desconhecido' NOT NULL,
	"text_body" text,
	"received_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_messages_external_message_id_unique" UNIQUE("external_message_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_admin_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by_user_id" uuid,
	"added_by_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_admin_numbers_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD COLUMN "external_message_id" text;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_admin_numbers" ADD CONSTRAINT "whatsapp_admin_numbers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_admin_numbers" ADD CONSTRAINT "whatsapp_admin_numbers_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;