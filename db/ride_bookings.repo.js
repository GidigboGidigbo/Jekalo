import { eq, and, gte, count, sql } from "drizzle-orm";
import { db } from "./index.js";
import { ride_bookings, rides, users, RIDE_STATUS } from "./schema.js";

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
      .set({ available_seat_capacity: sql`${rides.available_seat_capacity} - ${seats}` })
      .where(
        and(
          eq(rides.id, rideId),
          eq(rides.status, RIDE_STATUS.PENDING),
          gte(rides.available_seat_capacity, seats),
        ),
      )
      .returning();

    if (!ride) return null;

    const [booking] = await tx
      .insert(ride_bookings)
      .values({ ride_id: rideId, passenger_id: passengerId, seats_booked: seats })
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
      .delete(ride_bookings)
      .where(and(eq(ride_bookings.ride_id, rideId), eq(ride_bookings.passenger_id, passengerId)))
      .returning();

    if (!booking) return null;

    await tx
      .update(rides)
      .set({ available_seat_capacity: sql`${rides.available_seat_capacity} + ${booking.seats_booked}` })
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
      id: ride_bookings.id,
      seats_booked: ride_bookings.seats_booked,
      booked_at: ride_bookings.created_at,
      passenger: {
        id: users.id,
        first_name: users.firstName,
        last_name: users.lastName,
        phone_number: users.phoneNumber,
      },
    })
    .from(ride_bookings)
    .innerJoin(users, eq(ride_bookings.passenger_id, users.id))
    .where(eq(ride_bookings.ride_id, rideId));
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
      .from(ride_bookings)
      .where(and(eq(ride_bookings.ride_id, rideId), eq(ride_bookings.passenger_id, passengerId)));

    if (!currentBooking) return { success: false, reason: 'NO_BOOKING' };

    const seatDifference = newSeatCount - currentBooking.seats_booked;

    // Only proceed if the ride has enough seats and is still pending
    const [updatedRide] = await tx
      .update(rides)
      .set({ available_seat_capacity: sql`${rides.available_seat_capacity} - ${seatDifference}` })
      .where(
        and(
          eq(rides.id, rideId),
          eq(rides.status, RIDE_STATUS.PENDING),
          gte(rides.available_seat_capacity, seatDifference),
        ),
      )
      .returning();

    if (!updatedRide) return { success: false, reason: 'NOT_ENOUGH_SEATS' };

    // Update the booking
    const [updatedBooking] = await tx
      .update(ride_bookings)
      .set({ seats_booked: newSeatCount })
      .where(and(eq(ride_bookings.ride_id, rideId), eq(ride_bookings.passenger_id, passengerId)))
      .returning();

    return { success: true, booking: updatedBooking, ride: updatedRide };
  });
}

/** 
 * Get all the rides a user has booked. newest first.
*/
export async function getBookingsForPassenger(passengerId, { limit, offset }) {
  const where = eq(ride_bookings.passenger_id, passengerId);
  const rows = await db
    .select({ booking: ride_bookings, ride: rides })
    .from(ride_bookings)
    .innerJoin(rides, eq(ride_bookings.ride_id, rides.id))
    .where(where)
    .orderBy(sql`${ride_bookings.created_at} DESC`)
    .limit(limit)
    .offset(offset);
  const [{ count: total }] = await db.select({ count: count() }).from(ride_bookings).where(where);
  return { rows, total };
}
