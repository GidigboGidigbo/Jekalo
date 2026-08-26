import { eq, and, gte, count, sql, lt, notInArray } from "drizzle-orm";
import { db } from "./index.js";
import {
  rides,
  rideBookings,
  users,
  payments,
  RIDE_STATUS,
  RIDE_BOOKING_STATUS,
  PAYMENT_STATUS,
} from "./schema.js";

/**
 * Books seats on a ride as an `active` hold. It atomically decrements the
 * available seat capacity on the ride (only while it is pending and has room)
 * and inserts the booking. Returns { booking, ride } or null when the seats
 * could not be reserved.
 */
export async function bookRide(rideId, passengerId, seats) {
  return db.transaction(async (tx) => {
    const [ride] = await tx
      .update(rides)
      .set({ availableSeatCapacity: sql`${rides.availableSeatCapacity} - ${seats}` })
      .where(
        and(
          eq(rides.id, rideId),
          eq(rides.status, RIDE_STATUS.PENDING),
          gte(rides.availableSeatCapacity, seats),
        ),
      )
      .returning();

    if (!ride) return null;

    const [booking] = await tx
      .insert(rideBookings)
      .values({ rideId, passengerId, seatsBooked: seats, status: RIDE_BOOKING_STATUS.ACTIVE })
      .returning();

    return { booking, ride };
  });
}

/**
 * Soft-cancels a passenger's active hold and restores its seats (restore only
 * applies while the ride is still pending). Returns the cancelled booking, or
 * null if the user has no active booking on this ride.
 * TODO: Prevent cancellations on rides not pending, even before it reaches here.
 */
export async function cancelBooking(rideId, passengerId) {
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .update(rideBookings)
      .set({ status: RIDE_BOOKING_STATUS.CANCELLED, updatedAt: new Date() })
      .where(
        and(
          eq(rideBookings.rideId, rideId),
          eq(rideBookings.passengerId, passengerId),
          eq(rideBookings.status, RIDE_BOOKING_STATUS.ACTIVE),
        ),
      )
      .returning();

    if (!booking) return null;

    await tx
      .update(rides)
      .set({ availableSeatCapacity: sql`${rides.availableSeatCapacity} + ${booking.seatsBooked}` })
      .where(and(eq(rides.id, rideId), eq(rides.status, RIDE_STATUS.PENDING)));

    return booking;
  });
}

/**
 * get the detals for all the passengers on a particular ride
 * this can be useful for a driver who needs details for people on
 * the ride
 * TODO: Limit this to riders only?
 */
export async function getPassengersForRide(rideId) {
  return db
    .select({
      id: rideBookings.id,
      seatsBooked: rideBookings.seatsBooked,
      bookedAt: rideBookings.createdAt,
      passenger: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        phoneNumber: users.phoneNumber,
      },
    })
    .from(rideBookings)
    .innerJoin(users, eq(rideBookings.passengerId, users.id))
    .where(
      and(
        eq(rideBookings.rideId, rideId),
        notInArray(rideBookings.status, [
          RIDE_BOOKING_STATUS.CANCELLED,
          RIDE_BOOKING_STATUS.EXPIRED,
        ]),
      ),
    );
}

/**
 * Allows a passenger to update (incr or decr), the number of seats they booked
 * on a ride (but not to zero). In a txn, it changes the seats available
 * on the ride, and updates the seats booked for the passenger. Only succeeds if
 * the hold is still active, the ride has enough seats and is pending.
 * NOTE: The payment created at booking time keeps its original amount; seat
 * changes do not adjust a pending charge.
 * Returns { success: true, booking, ride } on success.
 * On failure, returns { success: false, reason: 'NO_BOOKING' | 'NOT_ENOUGH_SEATS' }.
 */
export async function updateBooking(rideId, passengerId, newSeatCount) {
  return db.transaction(async (tx) => {
    // Get the current active booking to find the seat difference
    const [currentBooking] = await tx
      .select()
      .from(rideBookings)
      .where(
        and(
          eq(rideBookings.rideId, rideId),
          eq(rideBookings.passengerId, passengerId),
          eq(rideBookings.status, RIDE_BOOKING_STATUS.ACTIVE),
        ),
      );

    if (!currentBooking) return { success: false, reason: 'NO_BOOKING' };

    const seatDifference = newSeatCount - currentBooking.seatsBooked;

    // Only proceed if the ride has enough seats and is still pending
    const [updatedRide] = await tx
      .update(rides)
      .set({ availableSeatCapacity: sql`${rides.availableSeatCapacity} - ${seatDifference}` })
      .where(
        and(
          eq(rides.id, rideId),
          eq(rides.status, RIDE_STATUS.PENDING),
          gte(rides.availableSeatCapacity, seatDifference),
        ),
      )
      .returning();

    if (!updatedRide) return { success: false, reason: 'NOT_ENOUGH_SEATS' };

    // Update the booking
    const [updatedBooking] = await tx
      .update(rideBookings)
      .set({ seatsBooked: newSeatCount, updatedAt: new Date() })
      .where(eq(rideBookings.id, currentBooking.id))
      .returning();

    return { success: true, booking: updatedBooking, ride: updatedRide };
  });
}

/**
 * Get all the rides a user has booked, newest first. Includes cancelled and
 * expired holds so riders can see their full history (and find the booking id
 * of a payment they still need to complete).
 */
export async function getBookingsForPassenger(passengerId, { limit, offset }) {
  const where = eq(rideBookings.passengerId, passengerId);
  const rows = await db
    .select({ booking: rideBookings, ride: rides })
    .from(rideBookings)
    .innerJoin(rides, eq(rideBookings.rideId, rides.id))
    .where(where)
    .orderBy(sql`${rideBookings.createdAt} DESC`)
    .limit(limit)
    .offset(offset);
  const [{ count: total }] = await db.select({ count: count() }).from(rideBookings).where(where);
  return { rows, total };
}

/** Flips an active hold to confirmed once its charge settles. Returns the
 * confirmed booking, or null when there was no active hold to confirm. */
export async function confirmRideBooking(bookingId) {
  const [booking] = await db
    .update(rideBookings)
    .set({ status: RIDE_BOOKING_STATUS.CONFIRMED, updatedAt: new Date() })
    .where(and(eq(rideBookings.id, bookingId), eq(rideBookings.status, RIDE_BOOKING_STATUS.ACTIVE)))
    .returning();
  return booking ?? null;
}

/**
 * Sweeper: expires active holds older than `cutoff` that never got paid, and
 * restores their seats while the ride is still pending. Returns the expired
 * bookings.
 */
export async function releaseExpiredRideBookings(cutoff) {
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(rideBookings)
      .set({ status: RIDE_BOOKING_STATUS.EXPIRED, updatedAt: new Date() })
      .where(
        and(
          eq(rideBookings.status, RIDE_BOOKING_STATUS.ACTIVE),
          lt(rideBookings.createdAt, cutoff),
          sql`NOT EXISTS (
            SELECT 1 FROM ${payments}
            WHERE ${payments.rideBookingId} = ${rideBookings.id}
              AND ${payments.status} = ${PAYMENT_STATUS.SUCCESS}
          )`,
        ),
      )
      .returning();

    const restoredSeatsByRide = new Map();
    for (const booking of expired) {
      restoredSeatsByRide.set(
        booking.rideId,
        (restoredSeatsByRide.get(booking.rideId) ?? 0) + booking.seatsBooked,
      );
    }
    for (const [rideId, seats] of restoredSeatsByRide) {
      await tx
        .update(rides)
        .set({ availableSeatCapacity: sql`${rides.availableSeatCapacity} + ${seats}` })
        .where(and(eq(rides.id, rideId), eq(rides.status, RIDE_STATUS.PENDING)));
    }

    return expired;
  });
}

/**
 * Late-payment recovery: the charge settled after the hold lapsed. Tries to
 * re-give exactly what was paid for — atomically re-reserving the paid seats
 * (the guarded update loses the race gracefully when someone else took them).
 * Only expired holds qualify; cancelled holds mean reversed intent and are
 * left for the caller to refund.
 * Returns { recovered: true, booking, ride? } or { recovered: false }.
 */
export async function recoverRideBookingSeats(bookingId) {
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(rideBookings)
      .where(eq(rideBookings.id, bookingId))
      .limit(1)
      .for("update");

    if (!booking) return { recovered: false };
    if (booking.status === RIDE_BOOKING_STATUS.CONFIRMED) {
      return { recovered: true, booking };
    }
    if (booking.status !== RIDE_BOOKING_STATUS.EXPIRED) return { recovered: false };

    const [ride] = await tx
      .update(rides)
      .set({ availableSeatCapacity: sql`${rides.availableSeatCapacity} - ${booking.seatsBooked}` })
      .where(
        and(
          eq(rides.id, booking.rideId),
          eq(rides.status, RIDE_STATUS.PENDING),
          gte(rides.availableSeatCapacity, booking.seatsBooked),
        ),
      )
      .returning();

    if (!ride) return { recovered: false };

    const [confirmed] = await tx
      .update(rideBookings)
      .set({ status: RIDE_BOOKING_STATUS.CONFIRMED, updatedAt: new Date() })
      .where(eq(rideBookings.id, bookingId))
      .returning();

    return { recovered: true, booking: confirmed, ride };
  });
}
