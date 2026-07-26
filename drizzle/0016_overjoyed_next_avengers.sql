ALTER TYPE "public"."stone_failure_category" ADD VALUE 'invalid_reference_date' BEFORE 'persistence_failure';--> statement-breakpoint
ALTER TYPE "public"."stone_failure_category" ADD VALUE 'invalid_request' BEFORE 'persistence_failure';--> statement-breakpoint
ALTER TYPE "public"."stone_failure_category" ADD VALUE 'upstream_bad_request' BEFORE 'persistence_failure';