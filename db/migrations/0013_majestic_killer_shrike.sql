CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"bank_code" text NOT NULL,
	"account_name" text,
	"paystack_recipient_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "bank_accounts_paystack_recipient_code_unique" UNIQUE("paystack_recipient_code")
);
--> statement-breakpoint
CREATE TABLE "banks" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_bank_code_banks_code_fk" FOREIGN KEY ("bank_code") REFERENCES "public"."banks"("code") ON DELETE no action ON UPDATE no action;
