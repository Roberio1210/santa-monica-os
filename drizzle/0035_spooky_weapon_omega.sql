ALTER TABLE "service_consumption_rules" ADD COLUMN "managerial_baseline_quantity" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "managerial_tolerance_percentage" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "managerial_baseline_source" "recipe_information_source";--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "managerial_baseline_since" date;--> statement-breakpoint
ALTER TABLE "service_consumption_rules" ADD COLUMN "managerial_size_adjustment_applicable" boolean DEFAULT false NOT NULL;