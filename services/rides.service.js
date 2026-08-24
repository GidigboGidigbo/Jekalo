import { PAYMENT_PURPOSE } from "../db/schema.js";
import { PLATFORM_FEE_BPS } from "../utils/money.js";
import { serializePayment } from "../utils/serializers.js";
import { bookRide, cancelBooking } from "../db/ride_bookings.repo.js";
import { PaystackError, initializePayment } from "./payments.service.js";

export async function bookRideWithPayment({ passengerId, email, ride, seats, callbackUrl }) {
  const booked = await bookRide(ride.id, passengerId, seats);
  if (!booked) return { reason: "NOT_ENOUGH_SEATS" };

  const totalPrice = ride.price * seats;
  try {
    const checkout = await initializePayment({
      userId: passengerId,
      email,
      amount: totalPrice,
      purpose: PAYMENT_PURPOSE.RIDE,
      rideBookingId: booked.booking.id,
      callbackUrl,
    });
    return {
      booking: booked.booking,
      seatsRemaining: booked.ride.availableSeatCapacity,
      totalPrice,
      ...checkout,
      payment: serializePayment(checkout.payment),
      platformFeeBps: PLATFORM_FEE_BPS,
    };
  } catch (err) {
    if (err instanceof PaystackError) {
      // Release the just-created hold; the rider retries booking later.
      await cancelBooking(ride.id, passengerId).catch(() => {});
    }
    throw err;
  }
}
