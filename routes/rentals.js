import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import {
  createRentalListingSchema,
  createRentalBookingSchema,
  searchRentalListingsSchema,
  updateRentalListingSchema,
} from "../validationSchemas/rentals.js";
import {
  createRentalListing,
  getRentalListings,
  getRentalListing,
  searchRentalListings,
  updateRentalListing,
  deleteRentalListing,
} from "../db/rental_listings.repo.js";
import { createRentalBooking } from "../db/rental_bookings.repo.js";
import {
  serializeListing,
  serializeRentalBooking,
} from "../utils/serializers.js";

const router = Router();
router.use(requireAuth);

// To create a rental_listing for a vehicle
router.post(
  "/listings",
  validate(createRentalListingSchema, "Invalid rental listing data."),
  async (req, res) => {
    const result = await createRentalListing(req.user.id, req.body);
    if (result.reason === "INVALID_DATE_RANGE") {
      return res.status(422).json({
        error: {
          code: "BUSINESS_RULE_VIOLATION",
          message: "Rental listings must be at least 3 days long.",
        },
      });
    }
    if (result.reason === "VEHICLE_NOT_OWNED") {
      return res.status(403).json({
        error: { code: "INSUFFICIENT_PERMISSIONS", message: "You can only list your own vehicle." },
      });
    }
    return res.status(201).json(serializeListing(result.listing));
  },
);

// To get all listings a user has put up
router.get("/listings", async (req, res) => {
  const listings = await getRentalListings(req.user.id);
  return res.status(200).json(listings.map(serializeListing));
});

// Allows searching for a car to rent based on start and end date and price
router.get("/listings/search", async (req, res) => {
  const result = searchRentalListingsSchema.safeParse(req.query);
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) {
      const field = issue.path.length > 0 ? issue.path.join(".") : "_error";
      if (!(field in details)) details[field] = issue.message;
    }
    return res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid rental search data.", details },
    });
  }

  const listings = await searchRentalListings(req.user.id, result.data);
  return res.status(200).json(listings.map(serializeListing));
});

// Create a booking for a particular rental listing
// TODO: Get bookings (for a rental, for a user)
// Update a user's booking for a listing
// Delete a user's booking for a listing
router.post(
  "/listings/:id/bookings",
  validate(createRentalBookingSchema, "Invalid rental booking data."),
  async (req, res) => {
    const result = await createRentalBooking(req.user.id, req.params.id, req.body);
    const errors = {
      NOT_FOUND: [404, "RESOURCE_NOT_FOUND", "Rental listing not found."],
      OWNER_CANNOT_BOOK: [422, "BUSINESS_RULE_VIOLATION", "You cannot book your own rental listing."],
      LISTING_UNAVAILABLE: [422, "BUSINESS_RULE_VIOLATION", "This rental listing is not available."],
      OUTSIDE_LISTING_WINDOW: [422, "BUSINESS_RULE_VIOLATION", "The requested dates are outside the listing availability window."],
      MINIMUM_DURATION: [422, "BUSINESS_RULE_VIOLATION", "The requested rental does not meet the minimum duration."],
      DATE_CONFLICT: [409, "STATE_CONFLICT", "The rental listing is already booked for part of those dates."],
    };
    const error = errors[result.reason];
    if (error) {
      return res.status(error[0]).json({ error: { code: error[1], message: error[2] } });
    }
    return res.status(201).json(serializeRentalBooking(result.booking));
  },
);

// To get a particular listing by a user
router.get("/listings/:id", async (req, res) => {
  const listing = await getRentalListing(req.params.id, req.user.id);
  if (!listing) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Rental listing not found." },
    });
  }
  return res.status(200).json(serializeListing(listing));
});

// To update a rental listing
async function updateListing(req, res) {
  const result = await updateRentalListing(req.params.id, req.user.id, req.body);
  if (result.reason === "NOT_FOUND") {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Rental listing not found." },
    });
  }
  if (result.reason === "INVALID_STATUS_TRANSITION") {
    return res.status(422).json({
      error: { code: "BUSINESS_RULE_VIOLATION", message: "Invalid rental listing status transition." },
    });
  }
  if (result.reason === "INVALID_DATE_RANGE") {
    return res.status(422).json({
      error: {
        code: "BUSINESS_RULE_VIOLATION",
        message: "Rental listings must be at least 3 days long.",
      },
    });
  }
  return res.status(200).json(serializeListing(result.listing));
}

router.put(
  "/listings/:id",
  validate(updateRentalListingSchema, "Invalid rental listing data."),
  updateListing,
);

// To allow a user delete a rental listing
router.delete("/listings/:id", async (req, res) => {
  const result = await deleteRentalListing(req.params.id, req.user.id);
  if (result.reason === "NOT_FOUND") {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Rental listing not found." },
    });
  }
  if (result.reason === "RENTED") {
    return res.status(422).json({
      error: {
        code: "BUSINESS_RULE_VIOLATION",
        message: "A rented listing cannot be deleted until it is returned.",
      },
    });
  }
  return res.status(204).end();
});

export default router;