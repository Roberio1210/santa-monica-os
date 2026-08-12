CREATE TABLE "historical_spreadsheet_parking_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"source_sheet" text NOT NULL,
	"record_date" date NOT NULL,
	"day_of_week" text,
	"credit_amount" numeric(12, 2) NOT NULL,
	"debit_amount" numeric(12, 2) NOT NULL,
	"pix_amount" numeric(12, 2) NOT NULL,
	"cash_amount" numeric(12, 2) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_spreadsheet_parking_records_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "historical_spreadsheet_wash_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"source_sheet" text NOT NULL,
	"source_row" integer NOT NULL,
	"record_date" date NOT NULL,
	"client_name" text,
	"vehicle_model" text,
	"plate" text,
	"service_type_raw" text,
	"canonical_service_id" uuid,
	"wash_amount" numeric(12, 2),
	"additional_description" text,
	"additional_amount" numeric(12, 2),
	"discount_amount" numeric(12, 2),
	"total_received" numeric(12, 2),
	"payment_method_raw" text,
	"conference_status" text,
	"machine_amount_received_raw" text,
	"martelinho_raw" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_spreadsheet_wash_records_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "historical_spreadsheet_wash_records" ADD CONSTRAINT "historical_spreadsheet_wash_records_canonical_service_id_services_id_fk" FOREIGN KEY ("canonical_service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;