ALTER TYPE "public"."movement_type" ADD VALUE 'descarte';--> statement-breakpoint
ALTER TYPE "public"."movement_type" ADD VALUE 'outros';--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "ideal_stock" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "supplier" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "supplier" text;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "unit_price_paid" numeric(12, 2);