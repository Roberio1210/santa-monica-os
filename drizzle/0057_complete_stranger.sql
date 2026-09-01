CREATE TABLE "inventory_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competence_month" text NOT NULL,
	"version" integer NOT NULL,
	"is_official" boolean DEFAULT true NOT NULL,
	"cutoff_at" date NOT NULL,
	"last_physical_count_at" date,
	"methodology" text NOT NULL,
	"caveat" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"hash_algorithm" text DEFAULT 'sha256' NOT NULL,
	"total_products" integer NOT NULL,
	"products_with_cost" integer NOT NULL,
	"is_partial_value" boolean NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by_version_id" uuid,
	"created_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_superseded_by_version_id_inventory_snapshots_id_fk" FOREIGN KEY ("superseded_by_version_id") REFERENCES "public"."inventory_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_snapshots_competence_version_idx" ON "inventory_snapshots" USING btree ("competence_month","version");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_snapshots_official_per_competence_idx" ON "inventory_snapshots" USING btree ("competence_month") WHERE "inventory_snapshots"."is_official" = true;