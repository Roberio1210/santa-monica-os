CREATE TABLE "dre_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competence_month" text NOT NULL,
	"version" integer NOT NULL,
	"is_official" boolean DEFAULT true NOT NULL,
	"regime" text NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"computed_by" text NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"closed_by" text NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by_version_id" uuid,
	"methodology_version" text NOT NULL,
	"report_payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"hash_algorithm" text DEFAULT 'sha256' NOT NULL,
	"pending_count" integer NOT NULL,
	"line_item_count" integer NOT NULL,
	"accounting_period_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dre_snapshots" ADD CONSTRAINT "dre_snapshots_superseded_by_version_id_dre_snapshots_id_fk" FOREIGN KEY ("superseded_by_version_id") REFERENCES "public"."dre_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dre_snapshots" ADD CONSTRAINT "dre_snapshots_accounting_period_id_accounting_periods_id_fk" FOREIGN KEY ("accounting_period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dre_snapshots_competence_version_idx" ON "dre_snapshots" USING btree ("competence_month","version");--> statement-breakpoint
CREATE UNIQUE INDEX "dre_snapshots_official_per_competence_idx" ON "dre_snapshots" USING btree ("competence_month") WHERE "dre_snapshots"."is_official" = true;