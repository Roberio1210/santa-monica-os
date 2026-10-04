CREATE TYPE "public"."emergency_priority" AS ENUM('critica', 'alta', 'normal');--> statement-breakpoint
CREATE TABLE "emergency_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"phone" text,
	"phone_alt" text,
	"whatsapp" text,
	"email" text,
	"website" text,
	"priority" "emergency_priority" DEFAULT 'normal' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emergency_contacts_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "emergency_protocol_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"is_critical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emergency_protocol_steps_protocol_position_unique" UNIQUE("protocol_id","position")
);
--> statement-breakpoint
CREATE TABLE "emergency_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"priority" "emergency_priority" DEFAULT 'normal' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"warning" text,
	"potential_coverage_keys" text[] DEFAULT '{}' NOT NULL,
	"priority_contact_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emergency_protocols_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "emergency_protocol_steps" ADD CONSTRAINT "emergency_protocol_steps_protocol_id_emergency_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."emergency_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_protocols" ADD CONSTRAINT "emergency_protocols_priority_contact_id_emergency_contacts_id_fk" FOREIGN KEY ("priority_contact_id") REFERENCES "public"."emergency_contacts"("id") ON DELETE no action ON UPDATE no action;