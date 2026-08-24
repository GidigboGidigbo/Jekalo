CREATE TYPE "public"."ride_booking_status" AS ENUM('active', 'confirmed', 'cancelled', 'expired');--> statement-breakpoint
ALTER TYPE "rental_booking_status" ADD VALUE 'pending_payment';--> statement-breakpoint
ALTER TYPE "rental_booking_status" ADD VALUE 'expired';--> statement-breakpoint
DROP INDEX "ride_booking_unique";--> statement-breakpoint
ALTER TABLE "ride_bookings" ADD COLUMN "status" "ride_booking_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "ride_bookings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ride_booking_unique_active" ON "ride_bookings" USING btree ("ride_id","passenger_id") WHERE status = 'active';
