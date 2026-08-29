CREATE TABLE "ride_completion_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"rating" integer,
	"issue_report" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_check" CHECK (rating >= 1 AND rating <= 5)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_verified_driver" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ride_completion_confirmations" ADD CONSTRAINT "ride_completion_confirmations_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_completion_confirmations" ADD CONSTRAINT "ride_completion_confirmations_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ride_confirmation_unique" ON "ride_completion_confirmations" USING btree ("ride_id","passenger_id");--> statement-breakpoint
CREATE INDEX "ride_confirmation_ride_index" ON "ride_completion_confirmations" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "ride_confirmation_passenger_index" ON "ride_completion_confirmations" USING btree ("passenger_id");