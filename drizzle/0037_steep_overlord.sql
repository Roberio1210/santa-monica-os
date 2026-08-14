ALTER TYPE "public"."bank_statement_line_type" ADD VALUE 'aporte' BEFORE 'pagamento';--> statement-breakpoint
ALTER TYPE "public"."bank_statement_line_type" ADD VALUE 'retirada' BEFORE 'pagamento';