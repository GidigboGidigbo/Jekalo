import "dotenv/config";
import { z } from "zod";

/**
 * Environment contract, validated once at boot. Required credentials
 * (DATABASE_URL, PAYSTACK_SECRET_KEY) keep their existing point-of-use checks;
 * this schema enforces the operational tuning knobs so a bad value fails fast
 * instead of producing mysterious scheduling behaviour.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),

  // How long a booking holds its seats/dates while awaiting payment. Whole
  // minutes, capped at 10 so inventory never locks up for long.
  HOLD_EXPIRY_MINUTES: z.coerce
    .number({ error: "HOLD_EXPIRY_MINUTES must be a number." })
    .int("HOLD_EXPIRY_MINUTES must be a whole number of minutes.")
    .min(1, "HOLD_EXPIRY_MINUTES must be at least 1 minute.")
    .max(10, "HOLD_EXPIRY_MINUTES cannot exceed 10 minutes.")
    .default(5),

  // How often the sweeper looks for stale holds. Whole minutes; feeds
  // CronTime.every(n).minutes().
  SWEEP_INTERVAL_MINUTES: z.coerce
    .number({ error: "SWEEP_INTERVAL_MINUTES must be a number." })
    .int("SWEEP_INTERVAL_MINUTES must be a whole number of minutes.")
    .min(1, "SWEEP_INTERVAL_MINUTES must be at least 1 minute.")
    .max(15, "SWEEP_INTERVAL_MINUTES cannot exceed 15 minutes.")
    .default(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".") || "_"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
