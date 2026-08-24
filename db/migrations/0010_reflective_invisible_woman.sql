CREATE TYPE "public"."ledger_entry_type" AS ENUM('charge', 'payout', 'refund', 'reversal', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_direction" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('ride', 'rental');--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"entry_type" "ledger_entry_type" NOT NULL,
	"direction" "ledger_entry_direction" NOT NULL,
	"amount" bigint NOT NULL,
	"status" "ledger_entry_status" DEFAULT 'pending' NOT NULL,
	"gateway_reference" text,
	"gateway_response" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_gateway_reference_unique" UNIQUE("gateway_reference")
);--> statement-breakpoint
-- Money columns become integer kobo: multiply stored naira by 100 while casting
-- so no fractional naira is silently rounded away.
ALTER TABLE "payments" ALTER COLUMN "amount_ngn" SET DATA TYPE bigint USING ROUND("amount_ngn" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "rental_bookings" ALTER COLUMN "total_amount_ngn" SET DATA TYPE bigint USING ROUND("total_amount_ngn" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "rental_bookings" ALTER COLUMN "security_deposit_ngn" SET DATA TYPE bigint USING ROUND("security_deposit_ngn" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "rental_listings" ALTER COLUMN "daily_rate_ngn" SET DATA TYPE bigint USING ROUND("daily_rate_ngn" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "rental_listings" ALTER COLUMN "security_deposit_ngn" SET DATA TYPE bigint USING ROUND("security_deposit_ngn" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "rides" ALTER COLUMN "price" SET DATA TYPE bigint USING ROUND("price" * 100)::bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "purpose" "payment_purpose";--> statement-breakpoint
UPDATE "payments" SET "purpose" = 'rental' WHERE "purpose" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "purpose" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "ride_booking_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "platform_percentage" numeric(5, 2);--> statement-breakpoint
UPDATE "payments" SET "platform_percentage" = '1.00' WHERE "platform_percentage" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "platform_percentage" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "platform_fee" bigint;--> statement-breakpoint
UPDATE "payments" SET "platform_fee" = ROUND("amount_ngn" / 100.0)::bigint WHERE "platform_fee" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "platform_fee" SET NOT NULL;--> statement-breakpoint
-- Drop the now-unused 'reversed' member of payment_status; reversals live in
-- ledger_entries instead.
ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
CREATE TYPE "public"."payment_status_new" AS ENUM('pending', 'success', 'failed', 'abandoned');--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" TYPE "payment_status_new" USING ("status"::text::"payment_status_new");--> statement-breakpoint
DROP TYPE "public"."payment_status";--> statement-breakpoint
ALTER TYPE "public"."payment_status_new" RENAME TO "payment_status";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entry_payment_index" ON "ledger_entries" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_ride_booking_id_ride_bookings_id_fk" FOREIGN KEY ("ride_booking_id") REFERENCES "public"."ride_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_single_linkage" CHECK ((("payments"."rental_booking_id" IS NULL)::int + ("payments"."ride_booking_id" IS NULL)::int) = 1);
