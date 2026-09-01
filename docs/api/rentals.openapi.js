import { z } from "zod";
import { registry } from "../registry.js";
import {
  registerError,
  errorSchema,
  uuidField,
  dateTimeField,
  moneyKobo,
} from "./common.js";
import {
  createRentalListingSchema,
  createRentalBookingSchema,
  searchRentalListingsSchema,
  updateRentalListingSchema,
} from "../../validationSchemas/rentals.js";
import { paymentSchema } from "./payments.openapi.js";

registerError();

const geoPointSchema = z.object({
  x: z.number().describe("Longitude."),
  y: z.number().describe("Latitude."),
});

const listingSchema = z
  .object({
    id: uuidField("Rental listing ID."),
    vehicleId: uuidField("Vehicle ID."),
    ownerId: uuidField("Owner's user ID."),
    dailyRate: moneyKobo("Daily rate."),
    securityDeposit: moneyKobo("Security deposit."),
    pickupLocation: geoPointSchema,
    startDateTime: dateTimeField("Earliest pickup datetime."),
    endDateTime: dateTimeField("Latest return datetime."),
    minimumDays: z.number().int().positive().describe("Minimum rental duration in days."),
    status: z
      .enum(["pending", "rented", "cancelled", "returned"])
      .describe("Listing lifecycle status."),
    createdAt: dateTimeField("Listing creation time."),
    updatedAt: dateTimeField("Last update time."),
  })
  .openapi("RentalListing", { description: "A car available for rent." });
registry.register("RentalListing", listingSchema);

const bookingSchema = z
  .object({
    id: uuidField("Rental booking ID."),
    listingId: uuidField("Listing ID."),
    renterId: uuidField("Renter's user ID."),
    startDateTime: dateTimeField("Booking start."),
    endDateTime: dateTimeField("Booking end."),
    totalAmount: moneyKobo("Total for the booked dates."),
    securityDeposit: moneyKobo("Security deposit held."),
    status: z
      .enum(["pending_payment", "confirmed", "cancelled", "completed", "expired"])
      .describe("The listing only flips to RENTED once the charge settles."),
    createdAt: dateTimeField("Booking creation time."),
    updatedAt: dateTimeField("Last update time."),
  })
  .openapi("RentalBooking", {
    description: "A held set of dates on a rental listing.",
  });
registry.register("RentalBooking", bookingSchema);

const checkoutResultSchema = z
  .object({
    booking: bookingSchema,
    listing: listingSchema,
    payment: paymentSchema,
    authorizationUrl: z.url().describe("Paystack authorization URL to redirect the renter to."),
    accessCode: z.string().describe("Paystack access_code for inline client checkout."),
    reference: z.string().describe("Payment reference (also the idempotency key)."),
    callbackUrl: z.url().describe("Where Paystack redirects the renter after payment."),
    platformFeeBps: z.number().int().min(0).describe("Platform commission in basis points."),
  })
  .openapi("RentalCheckout", {
    description: "Created booking plus the Paystack checkout session.",
  });
registry.register("RentalCheckout", checkoutResultSchema);

const createRentalListingRequestSchema = createRentalListingSchema.openapi(
  "CreateRentalListingRequest",
  { description: "Listing payload. Money fields are whole kobo; windows are >= 3 days." },
);
const searchRentalListingsQuerySchema = searchRentalListingsSchema.openapi(
  "SearchRentalListingsQuery",
  { description: "Availability window and optional kobo price bounds." },
);
const updateRentalListingRequestSchema = updateRentalListingSchema.openapi(
  "UpdateRentalListingRequest",
  { description: "Partial listing update. At least one field required." },
);
const createRentalBookingRequestSchema = createRentalBookingSchema.openapi(
  "CreateRentalBookingRequest",
  { description: "Dates to hold plus the Paystack redirect URL." },
);
registry.register("CreateRentalListingRequest", createRentalListingRequestSchema);
registry.register("SearchRentalListingsQuery", searchRentalListingsQuerySchema);
registry.register("UpdateRentalListingRequest", updateRentalListingRequestSchema);
registry.register("CreateRentalBookingRequest", createRentalBookingRequestSchema);

registry.registerPath({
  method: "post",
  path: "/rentals/listings",
  operationId: "createRentalListing",
  summary: "Put a vehicle up for rent",
  description:
    "Creates a pending rental listing for an owned vehicle. Listings must be at least 3 days long.",
  tags: ["Rentals"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: createRentalListingRequestSchema } } },
  },
  responses: {
    201: {
      description: "Listing created.",
      content: { "application/json": { schema: listingSchema } },
    },
    400: {
      description: "Validation failed.",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    403: {
      description: "You can only list your own vehicle.",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Rental listings must be at least 3 days long.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/rentals/listings",
  operationId: "listRentalListings",
  summary: "List the authenticated user's rental listings",
  tags: ["Rentals"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Listings fetched.",
      content: { "application/json": { schema: z.array(listingSchema) } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/rentals/listings/search",
  operationId: "searchRentalListings",
  summary: "Search rental listings by dates and price",
  description:
    "Returns the caller's own pending/returned listings that are available for the requested " +
    "window and within the optional kobo price range. All money values are whole kobo.",
  tags: ["Rentals"],
  security: [{ bearerAuth: [] }],
  request: { query: searchRentalListingsQuerySchema },
  responses: {
    200: {
      description: "Matching listings.",
      content: { "application/json": { schema: z.array(listingSchema) } },
    },
    400: {
      description: "Invalid rental search data.",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/rentals/listings/{id}/bookings",
  operationId: "bookRentalListing",
  summary: "Book dates on a rental listing and start Paystack checkout",
  description:
    "Holds the requested dates (`pending_payment`) and starts the renter's Paystack checkout. " +
    "The listing only flips to RENTED once the charge settles; unpaid holds are expired by the " +
    "sweeper after HOLD_EXPIRY_MINUTES, freeing the dates for re-booking.",
  tags: ["Rentals"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: uuidField("Rental listing ID.") }),
    body: { content: { "application/json": { schema: createRentalBookingRequestSchema } } },
  },
  responses: {
    201: {
      description: "Booking created, checkout session started.",
      content: { "application/json": { schema: checkoutResultSchema } },
    },
    400: {
      description: "Validation failed.",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Rental listing not found.",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "Listing is already booked for part of those dates.",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description:
        "You cannot book your own listing, the listing is not available, the dates are " +
        "outside the availability window, or the duration is below the minimum.",
      content: { "application/json": { schema: errorSchema } },
    },
    502: {
      description: "Paystack gateway error.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/rentals/listings/{id}",
  operationId: "getRentalListing",
  summary: "Fetch one of the authenticated user's listings",
  tags: ["Rentals"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: uuidField("Rental listing ID.") }) },
  responses: {
    200: {
      description: "Listing fetched.",
      content: { "application/json": { schema: listingSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Rental listing not found.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "put",
  path: "/rentals/listings/{id}",
  operationId: "updateRentalListing",
  summary: "Update one of the authenticated user's listings",
  description: "At least one listing field is required. Status transitions are validated.",
  tags: ["Rentals"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: uuidField("Rental listing ID.") }),
    body: { content: { "application/json": { schema: updateRentalListingRequestSchema } } },
  },
  responses: {
    200: {
      description: "Listing updated.",
      content: { "application/json": { schema: listingSchema } },
    },
    400: {
      description: "Validation failed.",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Rental listing not found.",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Invalid status transition or date range shorter than 3 days.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/rentals/listings/{id}",
  operationId: "deleteRentalListing",
  summary: "Delete one of the authenticated user's listings",
  description: "A rented listing cannot be deleted until it is returned.",
  tags: ["Rentals"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: uuidField("Rental listing ID.") }) },
  responses: {
    204: { description: "Listing deleted. No content." },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Rental listing not found.",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "A rented listing cannot be deleted until it is returned.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});