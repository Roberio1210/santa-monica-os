CREATE TYPE "public"."diagnostic_area" AS ENUM('pintura', 'rodas', 'pneus', 'vidros', 'motor', 'interior');--> statement-breakpoint
ALTER TABLE "diagnostic_photos" ADD COLUMN "area" "diagnostic_area" NOT NULL;--> statement-breakpoint
ALTER TABLE "diagnostic_photos" DROP COLUMN "stage";--> statement-breakpoint
DROP TYPE "public"."photo_stage";