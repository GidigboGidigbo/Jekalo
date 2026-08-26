import { PAYMENT_PURPOSE } from "../db/schema.js";
import { PLATFORM_FEE_BPS } from "../utils/money.js";
import { serializePayment } from "../utils/serializers.js";
import { bookRide, cancelBooking, getPassengersForRide } from "../db/ride_bookings.repo.js";
import { PaystackError } from "../utils/paystack.js";
import { initializePayment, createPayout } from "./payments.service.js";
import { getRide, updateRideStatus, updateRideTimestamps } from "../db/rides.repo.js";
import { getSuccessfulPaymentsByRideId } from "../db/payments.repo.js";
import { getBankAccountByUserId } from "../db/bank_accounts.repo.js";
import { countConfirmationsForRide, getCompletionConfirmationsForRide } from "../db/ride_confirmations.repo.js";

const CONFIRMATION_TIMEOUT_MINUTES = 15; // Grace period before driver can force completion

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

/**
 * Handles ride completion and payment to the driver.
 * 
 * Returns:
 *   - { success: true, ride, payouts }
 *   - { success: false, reason: string, details?: object }
 */
export async function completeRideWithPayouts(rideId, driverId) {
  // 1. Fetch ride and verify permissions/status
  const ride = await getRide(rideId);
  if (!ride) {
    return { success: false, reason: "RIDE_NOT_FOUND" };
  }

  if (ride.driverId !== driverId) {
    return { success: false, reason: "INSUFFICIENT_PERMISSIONS" };
  }

  if (ride.status !== "STARTED") {
    return { success: false, reason: "INVALID_RIDE_STATUS", details: { current: ride.status } };
  }

  // 2. Get driver's bank account
  const driversAccount = await getBankAccountByUserId(driverId);
  if (!driversAccount?.paystackRecipientCode) {
    return { success: false, reason: "NO_BANK_ACCOUNT" };
  }

  // 3. Check passenger confirmations (with grace period)
  const passengers = await getPassengersForRide(rideId);
  const confirmations = await getCompletionConfirmationsForRide(rideId);
  const confirmationCount = confirmations.length;
  const confirmedPassengers = new Set(confirmations.map(c => c.passengerId));

  // Check if there are passengers yet to confirm the ride as completed and if grace period has passed
  const psngrsYetToConfirmRideComplete = passengers.filter(p => !confirmedPassengers.has(p.passengerId));
  if (psngrsYetToConfirmRideComplete.length > 0) {
    // Check if enough time has passed since ride started
    const minutesSinceStart = (Date.now() - ride.startedAt.getTime()) / (1000 * 60);
    if (minutesSinceStart < CONFIRMATION_TIMEOUT_MINUTES) {
      return {
        success: false,
        reason: "AWAITING_PASSENGER_CONFIRMATIONS",
        details: {
          confirmedCount: confirmationCount,
          totalPassengers: passengers.length,
          minutesRemaining: Math.ceil(CONFIRMATION_TIMEOUT_MINUTES - minutesSinceStart),
        },
      };
    }
  }

  // 4. Check for passenger reported any issues concerning the ride
  const issuesReported = confirmations.filter(c => c.issueReport);
  if (issuesReported.length > 0) {
    return {
      success: false,
      reason: "PASSENGER_DISPUTES",
      details: {
        disputes: issuesReported.map(c => ({
          passengerId: c.passengerId,
          issue: c.issueReport,
        })),
      },
    };
  }

  // 5. Fetch successful payments made for the ride by psngrs 
  // and initiate payouts to the driver in a transaction
  const payments = await getSuccessfulPaymentsByRideId(rideId);

  try {
    // mark ride as completed
    const completedAt = new Date();
    await updateRideStatus(rideId, driverId, "COMPLETED");
    await updateRideTimestamps(rideId, { completedAt });

    // Initiate payouts (these are best-effort; failures don't rollback completion)
    const payouts = [];
    for (const row of payments) {
      const payment = row.payments; // Join returns nested structure
      try {
        const result = await createPayout({
          paymentId: payment.id,
          recipientCode: driversAccount.paystackRecipientCode,
        });

        if (result.reason) {
          payouts.push({
            paymentId: payment.id,
            reference: payment.reference,
            status: "failed",
            reason: result.reason,
          });
        } else {
          payouts.push({
            paymentId: payment.id,
            reference: payment.reference,
            status: "pending",
            amount: result.payment.amount,
            platformFee: result.payment.platformFee,
            payoutAmount: result.payoutAmount,
            ledgerId: result.entry.id,
          });
        }
      } catch (err) {
        console.error(`Payout creation failed for payment ${payment.reference}:`, err);
        payouts.push({
          paymentId: payment.id,
          reference: payment.reference,
          status: "error",
          reason: err.message,
        });
      }
    }

    // Re-fetch ride to get updated state
    const updatedRide = await getRide(rideId);

    return {
      success: true,
      ride: updatedRide,
      payouts,
      confirmations: {
        confirmed: confirmationCount,
        total: passengers.length,
      },
    };
  } catch (err) {
    console.error(`Ride completion failed for ${rideId}:`, err);
    return {
      success: false,
      reason: "COMPLETION_ERROR",
      details: { error: err.message },
    };
  }
}
