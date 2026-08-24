CREATE TYPE "public"."autonomy_level" AS ENUM('MANUAL_APPROVAL', 'LIMITED_AUTONOMY', 'FULL_AUTONOMY');--> statement-breakpoint
CREATE TYPE "public"."outbound_message_kind" AS ENUM('pos_venda', 'reativacao', 'manual', 'outro');--> statement-breakpoint
CREATE TYPE "public"."outbound_message_status" AS ENUM('rascunho', 'aprovada', 'descartada', 'enviada', 'falha_envio');--> statement-breakpoint
CREATE TABLE "autonomy_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" "autonomy_level" DEFAULT 'MANUAL_APPROVAL' NOT NULL,
	"changed_by_user_id" uuid,
	"changed_by_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "outbound_message_kind" NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"customer_name" text,
	"vehicle_model" text,
	"phone_masked" text,
	"reason" text NOT NULL,
	"draft_text" text NOT NULL,
	"final_text" text,
	"status" "outbound_message_status" DEFAULT 'rascunho' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_by_name" text,
	"approved_at" timestamp with time zone,
	"discarded_by_user_id" uuid,
	"discarded_by_name" text,
	"discarded_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"send_result" text,
	"dedupe_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_messages_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "autonomy_settings" ADD CONSTRAINT "autonomy_settings_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_discarded_by_user_id_users_id_fk" FOREIGN KEY ("discarded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;