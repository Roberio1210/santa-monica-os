CREATE TYPE "public"."goal_area" AS ENUM('lavacao', 'estacionamento', 'consolidado');--> statement-breakpoint
CREATE TABLE "goal_bonus_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"threshold_amount" numeric(12, 2) NOT NULL,
	"bonus_amount" numeric(12, 2) NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area" "goal_area" NOT NULL,
	"label" text NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_bonus_tiers" ADD CONSTRAINT "goal_bonus_tiers_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goals_area_period_start_idx" ON "goals" USING btree ("area","period_start");