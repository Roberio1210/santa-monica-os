-- Missão Z6.7 — reescrita manual do que o drizzle-kit gerou.
-- O gerador propôs DROP TYPE + CREATE TYPE + cast de volta para o enum novo, que quebraria em
-- produção: já existe uma linha real com status='enviada' (Missão Z6.6, teste real bem-sucedido),
-- e o enum novo não contém esse rótulo — o cast ("USING status::whatsapp_outbound_reply_status")
-- falharia exatamente nessa linha. RENAME VALUE é a operação nativa e segura do Postgres para
-- isso: só troca o RÓTULO do valor existente, sem reescrever nenhuma linha, sem risco de perda de
-- dado, sem exigir que nenhum valor atual seja uma opção válida do "novo" enum (é o mesmo enum,
-- só com um nome diferente para o mesmo valor interno).
ALTER TYPE "public"."whatsapp_outbound_reply_status" RENAME VALUE 'enviada' TO 'accepted';--> statement-breakpoint
CREATE TYPE "public"."whatsapp_delivery_status" AS ENUM('desconhecido', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
ALTER TABLE "whatsapp_outbound_replies" ADD COLUMN "delivery_status" "whatsapp_delivery_status" DEFAULT 'desconhecido' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_outbound_replies" ADD COLUMN "delivery_status_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_outbound_replies" ADD COLUMN "delivery_error_code" integer;--> statement-breakpoint
ALTER TABLE "whatsapp_outbound_replies" ADD COLUMN "delivery_error_title" text;--> statement-breakpoint
ALTER TABLE "whatsapp_outbound_replies" ADD COLUMN "delivery_error_message" text;--> statement-breakpoint
ALTER TABLE "whatsapp_outbound_replies" ADD COLUMN "delivery_error_href" text;--> statement-breakpoint
ALTER TABLE "whatsapp_outbound_replies" ADD COLUMN "delivery_error_data" jsonb;--> statement-breakpoint
ALTER TABLE "whatsapp_outbound_replies" ADD COLUMN "delivery_raw_errors" jsonb;
