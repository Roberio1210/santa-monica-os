ALTER TABLE "service_products" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "service_products" ADD COLUMN "price_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "service_products" ADD COLUMN "product_name_fallback" text;--> statement-breakpoint
ALTER TABLE "service_products" ADD COLUMN "brand_fallback" text;--> statement-breakpoint
ALTER TABLE "service_products" ADD COLUMN "durability_label" text;--> statement-breakpoint
ALTER TABLE "service_products" ADD CONSTRAINT "service_products_price_variant_id_service_price_variants_id_fk" FOREIGN KEY ("price_variant_id") REFERENCES "public"."service_price_variants"("id") ON DELETE no action ON UPDATE no action;