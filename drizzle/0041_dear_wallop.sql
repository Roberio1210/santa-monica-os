ALTER TABLE "jumppark_service_orders" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "partner_link_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "jumppark_match_keywords" text[];--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD CONSTRAINT "jumppark_service_orders_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jumppark_service_orders_partner_id_idx" ON "jumppark_service_orders" USING btree ("partner_id");