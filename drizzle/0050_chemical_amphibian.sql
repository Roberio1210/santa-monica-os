CREATE TYPE "public"."whatsapp_outbound_reply_status" AS ENUM('pendente', 'enviada', 'falha_envio', 'envio_desabilitado');--> statement-breakpoint
CREATE TABLE "whatsapp_outbound_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"content" text NOT NULL,
	"triggered_by_external_message_id" text NOT NULL,
	"external_message_id" text,
	"status" "whatsapp_outbound_reply_status" DEFAULT 'pendente' NOT NULL,
	"send_result" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_outbound_replies_triggered_by_external_message_id_unique" UNIQUE("triggered_by_external_message_id")
);
