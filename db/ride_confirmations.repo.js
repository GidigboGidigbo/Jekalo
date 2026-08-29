import { eq, and, count } from "drizzle-orm";
import { db } from "./index.js";
import { rideCompletionConfirmations } from "./schema.js";

/**
 * Records a passenger's confirmation after ride completion.
 * Creates an immutable record with optional rating and issue report.
 */
export async function insertCompletionConfirmation({
  rideId,
  passengerId,
  rating,
  issueReport,
}) {
  const [confirmation] = await db
    .insert(rideCompletionConfirmations)
    .values({
      rideId,
      passengerId,
      rating: rating ?? null,
      issueReport: issueReport ?? null,
    })
    .onConflictDoNothing()  // Idempotent: if already confirmed, silently succeed
    .returning();
  return confirmation ?? null;
}

/**
 * Retrieves all completion confirmations for a given ride.
 */
export async function getCompletionConfirmationsForRide(rideId) {
  return db
    .select()
    .from(rideCompletionConfirmations)
    .where(eq(rideCompletionConfirmations.rideId, rideId));
}

/**
 * Counts how many passengers have confirmed a ride to be complete.
 */
export async function countConfirmationsForRide(rideId) {
  const [result] = await db
    .select({ count: count() })
    .from(rideCompletionConfirmations)
    .where(eq(rideCompletionConfirmations.rideId, rideId));
  return result?.count ?? 0;
}

/**
 * Gets a single confirmation record, or null if not found.
 */
export async function getCompletionConfirmation(rideId, passengerId) {
  const [confirmation] = await db
    .select()
    .from(rideCompletionConfirmations)
    .where(
      and(
        eq(rideCompletionConfirmations.rideId, rideId),
        eq(rideCompletionConfirmations.passengerId, passengerId),
      ),
    )
    .limit(1);
  return confirmation ?? null;
}
