import { eq, and, gte, count, sql } from "drizzle-orm";
import { db } from "./index.js";
import { rideBookings, rides, users, RIDE_STATUS } from "./schema.js";

/**
 * Books seats on a ride. It updates the available seat on the associated ride.
 * It makes sure the intended ride has enough seats and is pending. It then
 * inserts the booking into the booking table. It returns the ride and the
 * booking if successful. The entire operation occurs in a txn, to ensure
 * all or nothing semantics.
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
      .values({ rideId, passengerId, seatsBooked: seats })
      .returning();

    return { booking, ride };
  });
}

/**
 * Removes a passenger's booking and restores its seats (restore only applies
 * while the ride is still pending). Returns the deleted booking, or null if
 * the user has no booking on this ride. This occurs in a txn to ensure all or
 * nothing semantics
 * TODO: Prevent cancellations on rides not pending, even before it reaches here.
 * TODO: Prevent cancellations on rides a psg has no booking on, even before it 
 * reaches here
 */
export async function cancelBooking(rideId, passengerId) {
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .delete(rideBookings)
      .where(and(eq(rideBookings.rideId, rideId), eq(rideBookings.passengerId, passengerId)))
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
    .where(eq(rideBookings.rideId, rideId));
}

/** 
 * Allows a passenger to update (incr or decr), the number of seats they booked
 * on a ride (but not to zero). In a txn, it changes the seats available
 * on the ride, and updates the seats booked for the passenger. Only succeeds if
 * ride has enough seats and is pending. For decr. it also works. e.g.
 * 2 to 1 seat means seatDiff == -1. the seatCap on the ride is set to -(-1). 
 * seatCap will also always be gte -1, allowing for increment.
 * Returns { success: true, booking, ride } on success.
 * On failure, returns { success: false, reason: 'NO_BOOKING' | 'NOT_ENOUGH_SEATS' }.
 */
export async function updateBooking(rideId, passengerId, newSeatCount) {
  return db.transaction(async (tx) => {
    // Get the current booking to find the seat difference
    const [currentBooking] = await tx
      .select()
      .from(rideBookings)
      .where(and(eq(rideBookings.rideId, rideId), eq(rideBookings.passengerId, passengerId)));

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
      .set({ seatsBooked: newSeatCount })
      .where(and(eq(rideBookings.rideId, rideId), eq(rideBookings.passengerId, passengerId)))
      .returning();

    return { success: true, booking: updatedBooking, ride: updatedRide };
  });
}

/** 
 * Get all the rides a user has booked. newest first.
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
  const [{ count: total }] = await db.select({ count: count() }).from(ride_bookings).where(where);
  return { rows, total };
}
