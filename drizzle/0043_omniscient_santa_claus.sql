ALTER TABLE "stone_normalized_transactions" ADD COLUMN "mdr_amount_stone" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "stone_normalized_transactions" ADD COLUMN "sale_fee_combined" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "stone_normalized_transactions" ADD COLUMN "advance_fee_amount_stone" numeric(14, 2);