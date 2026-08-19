CREATE TYPE "public"."rental_listing_status" AS ENUM('pending', 'rented', 'cancelled', 'returned');
--> statement-breakpoint
CREATE TABLE "rental_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"daily_rate_ngn" numeric(12, 2) NOT NULL,
	"security_deposit_ngn" numeric(12, 2) NOT NULL,
	"pickup_location" geometry(point) NOT NULL,
	"minimum_days" integer DEFAULT 1 NOT NULL,
	"status" "rental_listing_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rental_listings" ADD CONSTRAINT "rental_listings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_listings" ADD CONSTRAINT "rental_listings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rental_pickup_location_index" ON "rental_listings" USING gist ("pickup_location");--> statement-breakpoint
CREATE INDEX "rental_listing_vehicle_index" ON "rental_listings" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "rental_listing_owner_index" ON "rental_listings" USING btree ("owner_id");