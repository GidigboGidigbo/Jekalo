import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";
import { createRideSchema, searchRidesSchema, createBookingSchema, updateBookingSchema, confirmCompletionSchema } from "../validationSchemas/rides.js";
import { RIDE_STATUS } from "../db/schema.js";
import { serializeRide } from "../utils/serializers.js";
import { PaystackError } from "../utils/paystack.js";
import { bookRideWithPayment, completeRideWithPayouts } from "../services/rides.service.js";
import { createPayout } from "../services/payments.service.js";
import {
  createRide,
  getRide,
  getDriverRides,
  updateRideStatus,
  findMatchingRides,
} from "../db/rides.repo.js";
import {
  cancelBooking,
  updateBooking,
  getPassengersForRide,
  getBookingsForPassenger,
} from "../db/ride_bookings.repo.js";
import {
  insertCompletionConfirmation,
  getCompletionConfirmationsForRide,
} from "../db/ride_confirmations.repo.js";
import { getSuccessfulPaymentsByRideId } from "../db/payments.repo.js";
import { getBankAccountByUserId } from "../db/bank_accounts.repo.js";

const router = Router();

/** Postgres unique-constraint violation (duplicate booking). Drizzle wraps
 * driver errors, so check the cause chain too. */
function isUniqueViolation(err) {
  return err && (err.code === "23505" || err.cause?.code === "23505");
}

router.use(requireAuth);

router.post(
  "/",
  validate(createRideSchema, "Invalid ride data."),
  async (req, res) => {
    // Check if user is a verified driver
    if (!req.user.isVerifiedDriver) {
      return res.status(403).json({
        error: {
          code: "NOT_VERIFIED_DRIVER",
          message: "You must be a verified driver to create a ride. Please complete driver verification.",
        },
      });
    }
    const ride = await createRide(req.user.id, req.body);
    return res.status(201).json(serializeRide(ride));
  },
);

router.get("/", async (req, res) => {
  const pagination = parsePagination(req.query);
  const { rows, total } = await getDriverRides(req.user.id, pagination);
  return res.status(200).json(paginatedResponse(rows.map(serializeRide), total, pagination));
});

// NOTE: must be registered before GET /:id so "bookings" isn't matched as an id.
router.get("/bookings/mine", async (req, res) => {
  const pagination = parsePagination(req.query);
  const { rows, total } = await getBookingsForPassenger(req.user.id, pagination);
  const data = rows.map(({ booking, ride }) => ({
    booking,
    ride: serializeRide(ride),
  }));
  return res.status(200).json(paginatedResponse(data, total, pagination));
});

router.query(
  "/search",
  validate(searchRidesSchema, "Invalid search data."),
  async (req, res) => {
    const { fromLat, fromLong, toLat, toLong, radius } = req.body;
    const rides = await findMatchingRides(fromLat, fromLong, toLat, toLong, radius);
    return res.status(200).json(rides.map(serializeRide));
  },
);

router.get("/:id", async (req, res) => {
  const ride = await getRide(req.params.id);

  if (!ride) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
    });
  }

  return res.status(200).json(serializeRide(ride));
});

// POST /:id/bookings — book seats and start the rider's Paystack checkout in
// one step. Seats are reserved as an active hold immediately; unpaid holds are
// released by the sweeper after HOLD_EXPIRY_MINUTES. Riders who abandon their
// checkout get a new one by cancelling and booking again (no standalone init).
router.post(
  "/:id/bookings",
  validate(createBookingSchema, "Invalid booking data."),
  async (req, res) => {
    const ride = await getRide(req.params.id);

    if (!ride) {
      return res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
      });
    }
    if (ride.status !== RIDE_STATUS.PENDING) {
      return res.status(422).json({
        error: { code: "BUSINESS_RULE_VIOLATION", message: "This ride is not accepting bookings." },
      });
    }
    if (ride.driverId === req.user.id) {
      return res.status(422).json({
        error: { code: "BUSINESS_RULE_VIOLATION", message: "You cannot book your own ride." },
      });
    }

    try {
      const result = await bookRideWithPayment({
        passengerId: req.user.id,
        email: req.user.email,
        ride,
        seats: req.body.seats,
        callbackUrl: req.body.callbackUrl,
      });
      if (result.reason === "NOT_ENOUGH_SEATS") {
        return res.status(422).json({
          error: { code: "BUSINESS_RULE_VIOLATION", message: "Not enough seats available." },
        });
      }
      return res.status(201).json(result);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({
          error: { code: "STATE_CONFLICT", message: "You already have an active booking on this ride." },
        });
      }
      if (err instanceof PaystackError) {
        return res.status(502).json({
          error: { code: "GATEWAY_ERROR", message: err.message },
        });
      }
      throw err;
    }
  },
);

// GET /:id/passengers — passenger roster, visible to the ride's driver only.
// TODO: should we also allow passengers to see others on the ride?
router.get("/:id/passengers", async (req, res) => {
  const ride = await getRide(req.params.id);

  if (!ride) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
    });
  }
  if (ride.driverId !== req.user.id) {
    return res.status(403).json({
      error: { code: "INSUFFICIENT_PERMISSIONS", message: "Only the ride's driver can view its passengers." },
    });
  }

  const roster = await getPassengersForRide(ride.id);
  return res.status(200).json(roster);
});

// PATCH /:id/bookings/mine — allow a passenger to update their seats for a  booking.
router.patch(
  "/:id/bookings/mine",
  validate(updateBookingSchema, "Invalid booking data."),
  async (req, res) => {
    const ride = await getRide(req.params.id);

    if (!ride) {
      return res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
      });
    }

    if (ride.status !== RIDE_STATUS.PENDING) {
      return res.status(422).json({
        error: { code: "BUSINESS_RULE_VIOLATION", message: "Seat updates are only allowed while the ride is pending." },
      });
    }

    const result = await updateBooking(ride.id, req.user.id, req.body.seats);

    if (!result.success) {
      if (result.reason === 'NO_BOOKING') {
        return res.status(404).json({
          error: { code: "RESOURCE_NOT_FOUND", message: "You have no booking on this ride." },
        });
      }
      if (result.reason === 'NOT_ENOUGH_SEATS') {
        return res.status(422).json({
          error: { code: "BUSINESS_RULE_VIOLATION", message: "Not enough seats available." },
        });
      }
    }

    return res.status(200).json({
      booking: result.booking,
      seatsRemaining: result.ride.availableSeatCapacity,
      totalPrice: ride.price * req.body.seats,
    });
  },
);

// DELETE /:id/bookings/mine — cancel booking on a ride only while the ride is pending.
router.delete("/:id/bookings/mine", async (req, res) => {
  const ride = await getRide(req.params.id);

  if (!ride) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
    });
  }
  if (ride.status !== RIDE_STATUS.PENDING) {
    return res.status(422).json({
      error: { code: "BUSINESS_RULE_VIOLATION", message: "Bookings can only be cancelled while the ride is pending." },
    });
  }

  const booking = await cancelBooking(ride.id, req.user.id);
  if (!booking) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "You have no booking on this ride." },
    });
  }

  return res.status(204).end();
});

// PATCH /:id/start — driver starts the ride. PENDING → STARTED.
router.patch("/:id/start", async (req, res) => {
  const ride = await getRide(req.params.id);

  if (!ride) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
    });
  }
  if (ride.driverId !== req.user.id) {
    return res.status(403).json({
      error: { code: "INSUFFICIENT_PERMISSIONS", message: "Only the driver can start this ride." },
    });
  }
  if (ride.status !== RIDE_STATUS.PENDING) {
    return res.status(422).json({
      error: { code: "BUSINESS_RULE_VIOLATION", message: "Ride can only be started from pending status." },
    });
  }

  const updated = await updateRideStatus(req.params.id, req.user.id, RIDE_STATUS.STARTED);
  return res.status(200).json(serializeRide(updated));
});

// PATCH /:id/complete — driver completes the ride and triggers driver settlement.
// STARTED → COMPLETED. Orchestrates passenger confirmations with grace period,
// validates bank account, and initiates Paystack transfers for each successful payment.
// Returns detailed payout status for each payment + confirmation summary.
router.patch("/:id/complete", async (req, res) => {
  const result = await completeRideWithPayouts(req.params.id, req.user.id);

  if (!result.success) {
    // Map service error reasons to HTTP responses
    switch (result.reason) {
      case "RIDE_NOT_FOUND":
        return res.status(404).json({
          error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
        });
      
      case "INSUFFICIENT_PERMISSIONS":
        return res.status(403).json({
          error: { code: "INSUFFICIENT_PERMISSIONS", message: "Only the driver can complete this ride." },
        });
      
      case "INVALID_RIDE_STATUS":
        return res.status(422).json({
          error: {
            code: "BUSINESS_RULE_VIOLATION",
            message: "Ride can only be completed from started status.",
            details: { current: result.details?.current },
          },
        });
      
      case "NO_BANK_ACCOUNT":
        return res.status(422).json({
          error: {
            code: "BUSINESS_RULE_VIOLATION",
            message: "Please add a bank account to receive your earnings.",
          },
        });
      
      case "AWAITING_PASSENGER_CONFIRMATIONS":
        return res.status(422).json({
          error: {
            code: "BUSINESS_RULE_VIOLATION",
            message: "Waiting for passengers to confirm ride completion.",
            details: result.details,
          },
        });
      
      case "PASSENGER_DISPUTES":
        return res.status(409).json({
          error: {
            code: "STATE_CONFLICT",
            message: "Ride has unresolved disputes from passengers.",
            details: result.details,
          },
        });
      
      case "COMPLETION_ERROR":
      default:
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to complete ride.",
            details: result.details,
          },
        });
    }
  }

  return res.status(200).json({
    ride: serializeRide(result.ride),
    payouts: result.payouts,
    confirmations: result.confirmations,
  });
});

// PATCH /:id/cancel — driver cancels the ride. PENDING or STARTED → CANCELLED.
router.patch("/:id/cancel", async (req, res) => {
  const ride = await getRide(req.params.id);

  if (!ride) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
    });
  }
  if (ride.driverId !== req.user.id) {
    return res.status(403).json({
      error: { code: "INSUFFICIENT_PERMISSIONS", message: "Only the driver can cancel this ride." },
    });
  }
  if (ride.status !== RIDE_STATUS.PENDING && ride.status !== RIDE_STATUS.STARTED) {
    return res.status(422).json({
      error: { code: "BUSINESS_RULE_VIOLATION", message: "Ride cannot be cancelled from current status." },
    });
  }

  const updated = await updateRideStatus(req.params.id, req.user.id, RIDE_STATUS.CANCELLED);
  return res.status(200).json(serializeRide(updated));
});

// POST /:id/confirm-completion — passenger confirms the ride is complete (i.e. they
// have arrived at their stop)
// Creates an immutable confirmation record with optional rating and issue report.
// Used to track completion before driver can settle and to flag issues.
router.post(
  "/:id/confirm-completion",
  validate(confirmCompletionSchema, "Invalid confirmation data."),
  async (req, res) => {
    const ride = await getRide(req.params.id);

    if (!ride) {
      return res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
      });
    }

    // Only passengers on a ride can confirm the ride as complete
    const passengers = await getPassengersForRide(req.params.id);
    const passenger = passengers.find(p => p.passengerId === req.user.id);
    if (!passenger) {
      return res.status(403).json({
        error: { code: "INSUFFICIENT_PERMISSIONS", message: "Only passengers on this ride can confirm completion." },
      });
    }

    // Confirmation only makes sense after ride has started
    if (ride.status !== RIDE_STATUS.STARTED) {
      return res.status(422).json({
        error: { code: "BUSINESS_RULE_VIOLATION", message: "Ride must be started before completion can be confirmed." },
      });
    }

    // Insert confirmation from passenger that a ride is complete
    const confirmation = await insertCompletionConfirmation({
      rideId: req.params.id,
      passengerId: req.user.id,
      rating: req.body.rating ?? null,
      issueReport: req.body.issueReport ?? null,
    });

    if (!confirmation) {
      return res.status(409).json({
        error: { code: "STATE_CONFLICT", message: "You have already confirmed completion for this ride." },
      });
    }

    return res.status(201).json({
      confirmation: {
        id: confirmation.id,
        rideId: confirmation.rideId,
        passengerId: confirmation.passengerId,
        rating: confirmation.rating,
        issueReport: confirmation.issueReport,
        confirmedAt: confirmation.createdAt,
      },
    });
  },
);

export default router;
