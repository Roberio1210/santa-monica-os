ALTER TABLE "payments" ADD COLUMN "fee_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "net_amount" numeric(12, 2);