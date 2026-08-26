import { and, eq, gt, lt, ne, inArray, sql } from "drizzle-orm";
import { db } from "./index.js";
import {
  rentalBookings,
  rentalListings,
  payments,
  RENTAL_BOOKING_STATUS,
  RENTAL_LISTING_STATUS,
  PAYMENT_STATUS,
} from "./schema.js";
import { MIN_RENTAL_DURATION_DAYS } from "../validationSchemas/rentals.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

function rentalDays(startDateTime, endDateTime) {
  return Math.ceil((endDateTime.getTime() - startDateTime.getTime()) / millisecondsPerDay);
}

// Statuses that keep a hold on the listing's dates. Cancelled/completed/expired
// holds release their dates.
const DATE_BLOCKING_STATUSES = [
  RENTAL_BOOKING_STATUS.PENDING_PAYMENT,
  RENTAL_BOOKING_STATUS.CONFIRMED,
];

/**
 * createRentalBooking allows a user to book a rental listing as a
 * `pending_payment` hold on the requested dates. It prevents a user from
 * booking a rental listing they put up themselves, enforces booking only
 * listings with pending or returned status, ensures a booking is not shorter
 * than the minimum duration, and prevents overlapping bookings. The listing
 * itself only flips to "RENTED" once the payment confirms — unpaid holds
 * never touch its status.
 */
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

    const [overlap] = await tx
      .select({ id: rentalBookings.id })
      .from(rentalBookings)
      .where(
        and(
          eq(rentalBookings.listingId, listingId),
          inArray(rentalBookings.status, DATE_BLOCKING_STATUSES),
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
        status: RENTAL_BOOKING_STATUS.PENDING_PAYMENT,
      })
      .returning();

    return { booking, listing };
  });
}

/** Flips a pending_payment booking to confirmed (and the listing to RENTED)
 * once its charge settles. Returns the confirmed booking, or null when there
 * was no pending hold to confirm. */
export async function confirmRentalBooking(bookingId) {
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(rentalBookings)
      .where(eq(rentalBookings.id, bookingId))
      .limit(1)
      .for("update");

    if (!booking || booking.status !== RENTAL_BOOKING_STATUS.PENDING_PAYMENT) return null;

    const [confirmed] = await tx
      .update(rentalBookings)
      .set({ status: RENTAL_BOOKING_STATUS.CONFIRMED, updatedAt: new Date() })
      .where(eq(rentalBookings.id, bookingId))
      .returning();

    await tx
      .update(rentalListings)
      .set({ status: RENTAL_LISTING_STATUS.RENTED, updatedAt: new Date() })
      .where(eq(rentalListings.id, booking.listingId));

    return confirmed;
  });
}

/**
 * Compensation helper for book-and-pay: removes a booking whose checkout could
 * not be started moments ago. Only fresh pending_payment rows qualify.
 */
export async function cancelUnpaidBooking(bookingId, renterId) {
  const [deleted] = await db
    .delete(rentalBookings)
    .where(
      and(
        eq(rentalBookings.id, bookingId),
        eq(rentalBookings.renterId, renterId),
        eq(rentalBookings.status, RENTAL_BOOKING_STATUS.PENDING_PAYMENT),
      ),
    )
    .returning();
  return deleted ?? null;
}

/**
 * Sweeper: expires pending_payment holds older than `cutoff` that never got
 * paid, freeing their dates. Listings are untouched (they were never flipped).
 * Returns the expired bookings.
 */
export async function releaseExpiredRentalBookings(cutoff) {
  const expired = await db
    .update(rentalBookings)
    .set({ status: RENTAL_BOOKING_STATUS.EXPIRED, updatedAt: new Date() })
    .where(
      and(
        eq(rentalBookings.status, RENTAL_BOOKING_STATUS.PENDING_PAYMENT),
        lt(rentalBookings.createdAt, cutoff),
        sql`NOT EXISTS (
          SELECT 1 FROM ${payments}
          WHERE ${payments.rentalBookingId} = ${rentalBookings.id}
            AND ${payments.status} = ${PAYMENT_STATUS.SUCCESS}
        )`,
      ),
    )
    .returning();
  return expired;
}

/**
 * Late-payment recovery: the charge settled after the hold lapsed. Re-confirms
 * the booking when its date range is still free; otherwise reports failure so
 * the caller refunds. Only expired holds qualify.
 * Returns { recovered: true, booking } | { recovered: false }.
 */
export async function recoverRentalBookingDates(bookingId) {
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(rentalBookings)
      .where(eq(rentalBookings.id, bookingId))
      .limit(1)
      .for("update");

    if (!booking) return { recovered: false };
    if (booking.status === RENTAL_BOOKING_STATUS.CONFIRMED) {
      return { recovered: true, booking };
    }
    if (booking.status !== RENTAL_BOOKING_STATUS.EXPIRED) return { recovered: false };

    const [overlap] = await tx
      .select({ id: rentalBookings.id })
      .from(rentalBookings)
      .where(
        and(
          eq(rentalBookings.listingId, booking.listingId),
          ne(rentalBookings.id, booking.id),
          inArray(rentalBookings.status, DATE_BLOCKING_STATUSES),
          lt(rentalBookings.startDateTime, booking.endDateTime),
          gt(rentalBookings.endDateTime, booking.startDateTime),
        ),
      )
      .limit(1);
    if (overlap) return { recovered: false };

    const [confirmed] = await tx
      .update(rentalBookings)
      .set({ status: RENTAL_BOOKING_STATUS.CONFIRMED, updatedAt: new Date() })
      .where(eq(rentalBookings.id, bookingId))
      .returning();

    await tx
      .update(rentalListings)
      .set({ status: RENTAL_LISTING_STATUS.RENTED, updatedAt: new Date() })
      .where(eq(rentalListings.id, booking.listingId));

    return { recovered: true, booking: confirmed };
  });
}
