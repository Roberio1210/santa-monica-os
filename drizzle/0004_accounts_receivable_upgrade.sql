ALTER TYPE "public"."accounts_receivable_status" ADD VALUE 'reversed';--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "financial_account_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "installment_group_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "installment_number" integer;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "installment_total" integer;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "fee_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "net_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "responsible_name" text;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD COLUMN "approver_name" text;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;