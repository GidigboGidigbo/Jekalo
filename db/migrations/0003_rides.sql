CREATE EXTENSION postgis;
--> statement-breakpoint

CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"seating_capacity" integer NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"from_address" text NOT NULL,
	"from_location" geometry(point) NOT NULL,
	"to_address" text NOT NULL,
	"to_location" geometry(point) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"pickup_time" time NOT NULL,
	"pickup_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" "ride_status" DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "from_location_index" ON "rides" USING gist ("from_location");--> statement-breakpoint
CREATE INDEX "to_location_index" ON "rides" USING gist ("to_location");