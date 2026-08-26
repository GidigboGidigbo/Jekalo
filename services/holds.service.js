import cron from "node-cron";
import { CronTime } from "cron-time-generator";
import { env } from "../utils/env.js";
import { releaseExpiredRideBookings } from "../db/ride_bookings.repo.js";
import { releaseExpiredRentalBookings } from "../db/rental_bookings.repo.js";

/**
 * Releases unpaid booking holds older than HOLD_EXPIRY_MINUTES: ride seats go
 * back to the pool (while the ride is still pending) and rental dates free up.
 * `now`/`cutoff` are injectable so tests can drive expiry directly.
 */
export async function expireStaleHolds({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - env.HOLD_EXPIRY_MINUTES * 60_000);
  const [ridesReleased, rentalsReleased] = await Promise.all([
    releaseExpiredRideBookings(cutoff),
    releaseExpiredRentalBookings(cutoff),
  ]);
  return { ridesReleased, rentalsReleased };
}

/**
 * Schedules the hold sweep with node-cron. The expression comes from
 * cron-time-generator so the schedule reads exactly like what it does,
 * e.g. every 2 minutes → "*\/2 * * * *". Returns the scheduled task so the
 * caller can stop it on shutdown.
 */
export function startHoldSweeper() {
  const expression = CronTime.every(env.SWEEP_INTERVAL_MINUTES).minutes();
  const task = cron.schedule(expression, () => {
    expireStaleHolds().catch((err) => console.error("Hold sweep failed:", err));
  });
  console.log(
    `Hold sweeper scheduled to run every ${env.SWEEP_INTERVAL_MINUTES} minutes — unpaid holds expire after ${env.HOLD_EXPIRY_MINUTES} minute(s)`,
  );
  return task;
}
