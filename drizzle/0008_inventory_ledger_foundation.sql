CREATE TYPE "public"."inventory_quantity_status" AS ENUM('confirmed', 'measurement_pending');--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'contagem_fisica_inicial';--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'ajuste_positivo';--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'ajuste_negativo';--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'avaria';--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'vencimento';--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'devolucao';--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'transferencia';--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'consumo_teste_calibracao';--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'correcao_inventario';--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "original_name" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "quantity_status" "inventory_quantity_status" DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "previous_balance" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "new_balance" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_external_id_unique" UNIQUE("external_id");