ALTER TYPE "public"."service_order_status" ADD VALUE 'recebido' BEFORE 'aguardando_execucao';--> statement-breakpoint
ALTER TYPE "public"."service_order_status" ADD VALUE 'diagnostico' BEFORE 'aguardando_execucao';
