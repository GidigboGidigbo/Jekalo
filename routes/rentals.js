import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import {
  createRentalListingSchema,
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
    return res.status(201).json(result.listing);
  },
);

// To get all listings a user has put up
router.get("/listings", async (req, res) => {
  const listings = await getRentalListings(req.user.id);
  return res.status(200).json(listings);
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
  return res.status(200).json(listings);
});

// To get a particular listing by a user
router.get("/listings/:id", async (req, res) => {
  const listing = await getRentalListing(req.params.id, req.user.id);
  if (!listing) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Rental listing not found." },
    });
  }
  return res.status(200).json(listing);
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
  return res.status(200).json(result.listing);
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