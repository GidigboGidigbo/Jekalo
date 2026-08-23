import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";
import { createRideSchema, updateRideStatusSchema, searchRidesSchema, createBookingSchema, updateBookingSchema } from "../validationSchemas/rides.js";
import { RIDE_STATUS } from "../db/schema.js";
import { serializeRide } from "../utils/serializers.js";
import {
  createRide,
  getRide,
  getDriverRides,
  updateRideStatus,
  findMatchingRides,
} from "../db/rides.repo.js";
import {
  bookRide,
  cancelBooking,
  updateBooking,
  getPassengersForRide,
  getBookingsForPassenger,
} from "../db/ride_bookings.repo.js";

const router = Router();

/** Postgres unique-constraint violation (duplicate booking). */
function isUniqueViolation(err) {
  return err && err.code === "23505";
}

router.use(requireAuth);

router.post(
  "/",
  validate(createRideSchema, "Invalid ride data."),
  async (req, res) => {
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

// POST /:id/bookings — create a booking to reserve seats on a pending ride.
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
      const result = await bookRide(ride.id, req.user.id, req.body.seats);
      if (!result) {
        return res.status(422).json({
          error: { code: "BUSINESS_RULE_VIOLATION", message: "Not enough seats available." },
        });
      }
      return res.status(201).json({
        booking: result.booking,
        seatsRemaining: result.ride.availableSeatCapacity,
        totalPrice: ride.price * req.body.seats,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({
          error: { code: "STATE_CONFLICT", message: "You already have a booking on this ride." },
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

router.patch(
  "/:id/status",
  validate(updateRideStatusSchema, "Invalid status data."),
  async (req, res) => {
    const updated = await updateRideStatus(req.params.id, req.user.id, req.body.status);

    if (!updated) {
      return res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
      });
    }

    return res.status(200).json(serializeRide(updated));
  },
);

export default router;
