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
    if (listing.owner_id === renterId) return { reason: "OWNER_CANNOT_BOOK" };
    if (![RENTAL_LISTING_STATUS.PENDING, RENTAL_LISTING_STATUS.RETURNED].includes(listing.status)) {
      return { reason: "LISTING_UNAVAILABLE" };
    }

    const startDateTime = new Date(fields.start_date_time);
    const endDateTime = new Date(fields.end_date_time);
    const requestedDays = rentalDays(startDateTime, endDateTime);

    if (startDateTime < listing.start_date_time || endDateTime > listing.end_date_time) {
      return { reason: "OUTSIDE_LISTING_WINDOW" };
    }
    if (requestedDays < Math.max(listing.minimum_days, MIN_RENTAL_DURATION_DAYS)) {
      return { reason: "MINIMUM_DURATION" };
    }

    // better understand this
    const [overlap] = await tx
      .select({ id: rentalBookings.id })
      .from(rentalBookings)
      .where(
        and(
          eq(rentalBookings.listing_id, listingId),
          notInArray(rentalBookings.status, [RENTAL_BOOKING_STATUS.CANCELLED, RENTAL_BOOKING_STATUS.COMPLETED]),
          lt(rentalBookings.start_date_time, endDateTime),
          gt(rentalBookings.end_date_time, startDateTime),
        ),
      )
      .limit(1);
    if (overlap) return { reason: "DATE_CONFLICT" };

    const [booking] = await tx
      .insert(rentalBookings)
      .values({
        listing_id: listingId,
        renter_id: renterId,
        start_date_time: startDateTime,
        end_date_time: endDateTime,
        total_amount_ngn: (Number(listing.daily_rate_ngn) * requestedDays).toFixed(2),
        security_deposit_ngn: listing.security_deposit_ngn,
        status: RENTAL_BOOKING_STATUS.CONFIRMED,
      })
      .returning();

    const [updatedListing] = await tx
      .update(rentalListings)
      .set({ status: RENTAL_LISTING_STATUS.RENTED, updated_at: new Date() })
      .where(eq(rentalListings.id, listingId))
      .returning();

    return { booking, listing: updatedListing };
  });
}