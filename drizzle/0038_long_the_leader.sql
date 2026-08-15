CREATE TABLE "bank_statement_classification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criteria_direction" "bank_statement_line_direction",
	"criteria_counterparty_pattern" text,
	"criteria_description_keyword" text,
	"resulting_type" "bank_statement_line_type" NOT NULL,
	"category_id" uuid,
	"supplier_id" uuid,
	"partner_id" uuid,
	"applied_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_statement_classification_rules" ADD CONSTRAINT "bank_statement_classification_rules_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_classification_rules" ADD CONSTRAINT "bank_statement_classification_rules_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_classification_rules" ADD CONSTRAINT "bank_statement_classification_rules_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;