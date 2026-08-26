import { PAYMENT_PURPOSE } from "../db/schema.js";
import { PLATFORM_FEE_BPS } from "../utils/money.js";
import { serializePayment } from "../utils/serializers.js";
import { createRentalBooking, cancelUnpaidBooking } from "../db/rental_bookings.repo.js";
import { PaystackError } from "../utils/paystack.js";
import { initializePayment } from "./payments.service.js";

export async function bookListingWithPayment({ renterId, email, listingId, fields, callbackUrl }) {
  const booked = await createRentalBooking(renterId, listingId, fields);
  if (booked.reason) return booked;

  // totalAmount is a kobo bigint; normalize for the gateway request.
  const totalAmount = Number(booked.booking.totalAmount);
  try {
    const checkout = await initializePayment({
      userId: renterId,
      email,
      amount: totalAmount,
      purpose: PAYMENT_PURPOSE.RENTAL,
      rentalBookingId: booked.booking.id,
      callbackUrl,
    });
    return {
      booking: booked.booking,
      listing: booked.listing,
      ...checkout,
      payment: serializePayment(checkout.payment),
      platformFeeBps: PLATFORM_FEE_BPS,
    };
  } catch (err) {
    if (err instanceof PaystackError) {
      // Release the just-created date hold; the renter retries booking later.
      await cancelUnpaidBooking(booked.booking.id, renterId).catch(() => {});
    }
    throw err;
  }
}
