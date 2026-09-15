CREATE TABLE "stone_payment_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" text NOT NULL,
	"payment_date" date NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"wallet_type_id" integer,
	"source_file" text NOT NULL,
	"import_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD COLUMN "stone_payment_group_id" uuid;--> statement-breakpoint
ALTER TABLE "stone_normalized_transactions" ADD COLUMN "payment_group_id" uuid;--> statement-breakpoint
ALTER TABLE "stone_payment_groups" ADD CONSTRAINT "stone_payment_groups_import_run_id_stone_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."stone_import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stone_payment_groups_payment_id_idx" ON "stone_payment_groups" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_stone_payment_group_id_stone_payment_groups_id_fk" FOREIGN KEY ("stone_payment_group_id") REFERENCES "public"."stone_payment_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stone_normalized_transactions" ADD CONSTRAINT "stone_normalized_transactions_payment_group_id_stone_payment_groups_id_fk" FOREIGN KEY ("payment_group_id") REFERENCES "public"."stone_payment_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_lines_stone_payment_group_id_uq" ON "bank_statement_lines" USING btree ("stone_payment_group_id") WHERE "bank_statement_lines"."stone_payment_group_id" is not null;--> statement-breakpoint
CREATE INDEX "stone_normalized_transactions_payment_group_id_idx" ON "stone_normalized_transactions" USING btree ("payment_group_id");