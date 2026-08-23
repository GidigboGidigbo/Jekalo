import { and, eq, gt, lt, ne, notInArray } from "drizzle-orm";
import { db } from "./index.js";
import {
  rentalBookings,
  rentalListings,
  RENTAL_BOOKING_STATUS,
  RENTAL_LISTING_STATUS,
} from "./schema.js";
import { MIN_RENTAL_DURATION_DAYS } from "../validationSchemas/rentals.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

function rentalDays(startDateTime, endDateTime) {
  return Math.ceil((endDateTime.getTime() - startDateTime.getTime()) / millisecondsPerDay);
}

// TODO: We should make it so that a booking cannot last less than a day
// createRentalBooking allows a user to book a rental. It prevents a user
// from booking a rental listing they put up themselves. It enforces booking
// only listings with pending or returned status. It ensures that a booking
// cannot be < 1 day. It prevents overlapping bookings. It updates the associated
// listing so that the status transitions to "RENTED". The entire operation takes
// place in a txn, for atomicity.
export async function createRentalBooking(renterId, listingId, fields) {
  return db.transaction(async (tx) => {
    const [listing] = await tx
      .select()
      .from(rentalListings)
      .where(eq(rentalListings.id, listingId))
      .for("update");

    if (!listing) return { reason: "NOT_FOUND" };
    if (listing.ownerId === renterId) return { reason: "OWNER_CANNOT_BOOK" };
    if (![RENTAL_LISTING_STATUS.PENDING, RENTAL_LISTING_STATUS.RETURNED].includes(listing.status)) {
      return { reason: "LISTING_UNAVAILABLE" };
    }

    const startDateTime = new Date(fields.startDateTime);
    const endDateTime = new Date(fields.endDateTime);
    const requestedDays = rentalDays(startDateTime, endDateTime);

    if (startDateTime < listing.startDateTime || endDateTime > listing.endDateTime) {
      return { reason: "OUTSIDE_LISTING_WINDOW" };
    }
    if (requestedDays < Math.max(listing.minimumDays, MIN_RENTAL_DURATION_DAYS)) {
      return { reason: "MINIMUM_DURATION" };
    }

    // better understand this
    const [overlap] = await tx
      .select({ id: rentalBookings.id })
      .from(rentalBookings)
      .where(
        and(
          eq(rentalBookings.listingId, listingId),
          notInArray(rentalBookings.status, [RENTAL_BOOKING_STATUS.CANCELLED, RENTAL_BOOKING_STATUS.COMPLETED]),
          lt(rentalBookings.startDateTime, endDateTime),
          gt(rentalBookings.endDateTime, startDateTime),
        ),
      )
      .limit(1);
    if (overlap) return { reason: "DATE_CONFLICT" };

    const [booking] = await tx
      .insert(rentalBookings)
      .values({
        listingId,
        renterId,
        startDateTime,
        endDateTime,
        // Kobo integers end-to-end: rate x days, no unit conversions.
        totalAmount: listing.dailyRate * requestedDays,
        securityDeposit: listing.securityDeposit,
        status: RENTAL_BOOKING_STATUS.CONFIRMED,
      })
      .returning();

    const [updatedListing] = await tx
      .update(rentalListings)
      .set({ status: RENTAL_LISTING_STATUS.RENTED, updatedAt: new Date() })
      .where(eq(rentalListings.id, listingId))
      .returning();

    return { booking, listing: updatedListing };
  });
}