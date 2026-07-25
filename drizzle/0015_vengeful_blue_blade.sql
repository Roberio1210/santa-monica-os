CREATE TYPE "public"."stone_failure_category" AS ENUM('no_data_expected', 'file_not_published_yet', 'temporary_network_failure', 'authentication_failure', 'insufficient_permission', 'invalid_pointer_response', 'blob_download_failure', 'invalid_content_type', 'invalid_gzip', 'invalid_xml', 'unsupported_layout', 'persistence_failure', 'unknown_failure');--> statement-breakpoint
CREATE TYPE "public"."stone_failure_stage" AS ENUM('authentication', 'file_request', 'pointer_resolution', 'blob_download', 'decompression', 'xml_parsing', 'normalization', 'persistence');--> statement-breakpoint
ALTER TABLE "stone_import_runs" ADD COLUMN "failure_stage" "stone_failure_stage";--> statement-breakpoint
ALTER TABLE "stone_import_runs" ADD COLUMN "failure_category" "stone_failure_category";--> statement-breakpoint
ALTER TABLE "stone_import_runs" ADD COLUMN "upstream_status" integer;--> statement-breakpoint
ALTER TABLE "stone_import_runs" ADD COLUMN "response_content_type" text;--> statement-breakpoint
ALTER TABLE "stone_import_runs" ADD COLUMN "attempt_count" integer;--> statement-breakpoint
ALTER TABLE "stone_import_runs" ADD COLUMN "elapsed_ms" integer;--> statement-breakpoint
ALTER TABLE "stone_import_runs" ADD COLUMN "sanitized_host" text;--> statement-breakpoint
ALTER TABLE "stone_import_runs" ADD COLUMN "sanitized_path" text;--> statement-breakpoint
ALTER TABLE "stone_import_runs" ADD COLUMN "occurred_at" timestamp with time zone;