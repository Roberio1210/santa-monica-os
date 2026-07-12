CREATE TYPE "public"."cash_movement_nature" AS ENUM('receita', 'despesa', 'ajuste', 'estorno', 'taxa_bancaria', 'tarifa', 'juros');--> statement-breakpoint
ALTER TYPE "public"."account_transfer_type" ADD VALUE 'aporte_socios';--> statement-breakpoint
ALTER TYPE "public"."account_transfer_type" ADD VALUE 'retirada';--> statement-breakpoint
ALTER TABLE "account_transfers" ADD COLUMN "responsible_name" text;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD COLUMN "document_ref" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "nature" "cash_movement_nature";--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "accounts_payable_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "responsible_name" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "document_ref" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "competence_date" date;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "balance_before" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "balance_after" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "informed_balance" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "informed_balance_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_accounts_payable_id_accounts_payable_id_fk" FOREIGN KEY ("accounts_payable_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;