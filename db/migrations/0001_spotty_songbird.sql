CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" text NOT NULL,
	"color" text NOT NULL,
	"body_type" text NOT NULL,
	"pictures" text[] NOT NULL,
	"seating_capacity" integer NOT NULL,
	"license_plate_number" text NOT NULL,
	"driver_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;