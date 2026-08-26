ALTER TABLE "rental_listings" RENAME COLUMN "daily_rate_ngn" TO "daily_rate";--> statement-breakpoint
ALTER TABLE "rental_listings" RENAME COLUMN "security_deposit_ngn" TO "security_deposit";--> statement-breakpoint
ALTER TABLE "rental_bookings" RENAME COLUMN "total_amount_ngn" TO "total_amount";--> statement-breakpoint
ALTER TABLE "rental_bookings" RENAME COLUMN "security_deposit_ngn" TO "security_deposit";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "amount_ngn" TO "amount";
