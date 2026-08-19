CREATE TYPE "public"."rental_booking_status" AS ENUM('confirmed', 'cancelled', 'completed');
--> statement-breakpoint
CREATE TABLE "rental_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"renter_id" uuid NOT NULL,
	"start_date_time" timestamp with time zone NOT NULL,
	"end_date_time" timestamp with time zone NOT NULL,
	"total_amount_ngn" numeric(12, 2) NOT NULL,
	"security_deposit_ngn" numeric(12, 2) NOT NULL,
	"status" "rental_booking_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_listing_id_rental_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."rental_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_renter_id_users_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_booking_listing_dates_index" ON "rental_bookings" USING btree ("listing_id","start_date_time","end_date_time");--> statement-breakpoint
CREATE INDEX "rental_booking_renter_index" ON "rental_bookings" USING btree ("renter_id");