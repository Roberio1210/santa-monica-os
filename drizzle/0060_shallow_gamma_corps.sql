CREATE TYPE "public"."employee_advance_status" AS ENUM('aberto', 'parcialmente_compensado', 'compensado');--> statement-breakpoint
CREATE TYPE "public"."employee_payment_category" AS ENUM('salario_fixo', 'comissao', 'bonus', 'diaria_freelancer', 'adiantamento', 'reembolso', 'desconto_compensacao', 'rescisao', 'ferias', 'decimo_terceiro', 'encargo', 'outro');--> statement-breakpoint
CREATE TABLE "employee_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "document_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"reason" text,
	"status" "employee_advance_status" DEFAULT 'aberto' NOT NULL,
	"compensated_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"compensated_at" date,
	"cash_movement_id" uuid,
	"employee_payment_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "document_subject_type",
	"subject_id" uuid,
	"category" "employee_payment_category" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"competence_date" date,
	"description" text NOT NULL,
	"cash_movement_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_employee_payment_id_employee_payments_id_fk" FOREIGN KEY ("employee_payment_id") REFERENCES "public"."employee_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payments" ADD CONSTRAINT "employee_payments_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE no action ON UPDATE no action;