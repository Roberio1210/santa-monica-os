ALTER TABLE "customers" ADD COLUMN "first_visit_at" date;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "visit_count" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "average_ticket" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "services_order_count" integer;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "first_seen_at" date;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "last_seen_at" date;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "visit_count" integer;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD CONSTRAINT "jumppark_service_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD CONSTRAINT "jumppark_service_orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jumppark_service_orders_customer_id_idx" ON "jumppark_service_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "jumppark_service_orders_vehicle_id_idx" ON "jumppark_service_orders" USING btree ("vehicle_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_external_id_unique" UNIQUE("external_id");--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_external_id_unique" UNIQUE("external_id");