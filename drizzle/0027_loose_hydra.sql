CREATE TYPE "public"."identity_confidence" AS ENUM('confirmado', 'provavel', 'provisorio', 'ambiguo');--> statement-breakpoint
CREATE TYPE "public"."identity_review_status" AS ENUM('pending', 'kept_separate', 'deferred');--> statement-breakpoint
CREATE TABLE "identity_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_key" text NOT NULL,
	"plate_masked" text NOT NULL,
	"confidence" "identity_confidence" DEFAULT 'ambiguo' NOT NULL,
	"rule" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" "identity_review_status" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_review_items_subject_key_unique" UNIQUE("subject_key")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "identity_confidence" "identity_confidence" DEFAULT 'provisorio' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "identity_confidence_reason" text;--> statement-breakpoint
ALTER TABLE "jumppark_service_orders" ADD COLUMN "customer_link_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "identity_review_items_status_idx" ON "identity_review_items" USING btree ("status");