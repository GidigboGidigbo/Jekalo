import { z } from "zod";
import { registry } from "../registry.js";
import {
  registerError,
  errorSchema,
  uuidField,
  dateTimeField,
  moneyKobo,
  paginatedListSchema,
  paginationQuerySchema,
} from "./common.js";
import {
  createRideSchema,
  searchRidesSchema,
  createBookingSchema,
  updateBookingSchema,
} from "../../validationSchemas/rides.js";
import { paymentSchema } from "./payments.openapi.js";

registerError();

const geoPointSchema = z.object({
  x: z.number().describe("Longitude."),
  y: z.number().describe("Latitude."),
});

const rideSchema = z
  .object({
    id: uuidField("Ride ID."),
    driverId: uuidField("Driver's user ID."),
    vehicleId: uuidField("Vehicle ID."),
    availableSeatCapacity: z.number().int().min(1).describe("Seats still available on the ride."),
    fromAddress: z.string().describe("Departure address."),
    fromLocation: geoPointSchema,
    toAddress: z.string().describe("Destination address."),
    toLocation: geoPointSchema,
    price: moneyKobo("Ride price per seat.").positive(),
    pickupTime: z.string().describe("Pickup time (HH:MM:SS, 24h)."),
    pickupDate: z.string().describe("Pickup date (YYYY-MM-DD)."),
    createdAt: dateTimeField("Ride creation time."),
    status: z
      .enum(["PENDING", "STARTED", "COMPLETED", "CANCELLED"])
      .describe("Ride lifecycle status."),
    startedAt: dateTimeField("When the ride was started.").nullish(),
    completedAt: dateTimeField("When the ride was completed.").nullish(),
  })
  .openapi("Ride", { description: "Ride record." });
registry.register("Ride", rideSchema);

const rideBookingSchema = z
  .object({
    id: uuidField("Booking ID."),
    rideId: uuidField("Ride ID."),
    passengerId: uuidField("Passenger's user ID."),
    seatsBooked: z.number().int().min(1).describe("Seats booked by this passenger."),
    status: z
      .enum(["active", "confirmed", "cancelled", "expired"])
      .describe("Booked seats are held (`active`) until payment settles (`confirmed`)."),
    createdAt: dateTimeField("Booking creation time."),
    updatedAt: dateTimeField("Last update time."),
  })
  .openapi("RideBooking", {
    description: "A passenger's seat hold on a ride.",
  });
registry.register("RideBooking", rideBookingSchema);

const checkoutResultSchema = z
  .object({
    booking: rideBookingSchema,
    seatsRemaining: z.number().int().min(0).describe("Seats left after this booking."),
    totalPrice: moneyKobo("Total for the booked seats.").positive(),
    payment: paymentSchema,
    authorizationUrl: z.url().describe("Paystack authorization URL to redirect the rider to."),
    accessCode: z.string().describe("Paystack access_code for inline client checkout."),
    reference: z.string().describe("Payment reference (also the idempotency key)."),
    callbackUrl: z.url().describe("Where Paystack redirects the rider after payment."),
    platformFeeBps: z.number().int().min(0).describe("Platform commission in basis points."),
  })
  .openapi("RideCheckout", {
    description: "Created booking plus the Paystack checkout session.",
  });
registry.register("RideCheckout", checkoutResultSchema);

const createRideRequestSchema = createRideSchema.openapi("CreateRideRequest", {
  description: "Ride creation payload. Money fields are whole kobo.",
});
const searchRidesRequestSchema = searchRidesSchema.openapi("SearchRidesRequest", {
  description: "Search area: origin/destination coordinates and a radius (km).",
});
const createBookingRequestSchema = createBookingSchema.openapi("CreateBookingRequest", {
  description: "Seats to book plus the Paystack redirect URL.",
});
const updateBookingRequestSchema = updateBookingSchema.openapi("UpdateBookingRequest", {
  description: "New seat count for the booking.",
});
registry.register("CreateRideRequest", createRideRequestSchema);
registry.register("SearchRidesRequest", searchRidesRequestSchema);
registry.register("CreateBookingRequest", createBookingRequestSchema);
registry.register("UpdateBookingRequest", updateBookingRequestSchema);

const rideListSchema = paginatedListSchema(rideSchema).openapi("RideList", {
  description: "Paginated list of rides.",
});
registry.register("RideList", rideListSchema);

registry.registerPath({
  method: "post",
  path: "/rides",
  operationId: "createRide",
  summary: "Create a ride",
  description: "Creates a ride as the authenticated driver. Money fields are whole kobo.",
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: createRideRequestSchema } } },
  },
  responses: {
    201: {
      description: "Ride created.",
      content: { "application/json": { schema: rideSchema } },
    },
    400: {
      description: "Validation failed.",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/rides",
  operationId: "listRides",
  summary: "List the authenticated driver's rides",
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: { query: paginationQuerySchema },
  responses: {
    200: {
      description: "Rides fetched.",
      content: { "application/json": { schema: rideListSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

// NOTE: this route is served over the QUERY HTTP method (a WebDAV extension),
// with a JSON body — see routes/rides.js. OpenAPI 3.1 has no QUERY operation,
// so it is modeled here as POST with a full description.
registry.registerPath({
  method: "post",
  path: "/rides/search",
  operationId: "searchRides",
  summary: "Search rides near an origin and destination",
  description:
    "Finds pending rides whose origin is within `radius` km of the search origin and whose " +
    "destination is within `radius` km of the target destination, sorted by distance. " +
    "In the current implementation this endpoint is served over the QUERY HTTP method, " +
    "not POST — requests must send method QUERY with a JSON body.",
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: searchRidesRequestSchema } } },
  },
  responses: {
    200: {
      description: "Matching rides.",
      content: { "application/json": { schema: z.array(rideSchema) } },
    },
    400: {
      description: "Invalid search data.",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/rides/bookings/mine",
  operationId: "listMyBookings",
  summary: "List the authenticated passenger's bookings",
  description: "Paginated list of the authenticated user's ride bookings, each with its ride.",
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: { query: paginationQuerySchema },
  responses: {
    200: {
      description: "Bookings fetched.",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(z.object({ booking: rideBookingSchema, ride: rideSchema })),
            pagination: z.object({
              page: z.number().int(),
              limit: z.number().int(),
              total: z.number().int(),
              total_pages: z.number().int(),
            }),
          }),
        },
      },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/rides/{id}",
  operationId: "getRide",
  summary: "Fetch a ride by ID",
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: uuidField("Ride ID.") }) },
  responses: {
    200: {
      description: "Ride fetched.",
      content: { "application/json": { schema: rideSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Ride not found.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/rides/{id}/bookings",
  operationId: "bookRide",
  summary: "Book seats on a ride and start Paystack checkout",
  description:
    "Reserves seats as an active hold and starts the rider's Paystack checkout in one step. " +
    "Unpaid holds are released by the sweeper after HOLD_EXPIRY_MINUTES; a rider who abandons " +
    "checkout cancels and books again (no standalone initialize endpoint).",
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: uuidField("Ride ID.") }),
    body: { content: { "application/json": { schema: createBookingRequestSchema } } },
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
      description: "Ride not found.",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "The rider already has an active booking on this ride.",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description:
        "Ride is not accepting bookings, rider booked their own ride, or not enough seats.",
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
  path: "/rides/{id}/passengers",
  operationId: "listPassengers",
  summary: "List a ride's confirmed passengers (driver only)",
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: uuidField("Ride ID.") }) },
  responses: {
    200: {
      description: "Passenger roster.",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: uuidField("Booking ID."),
              seatsBooked: z.number().int().describe("Seats booked."),
              bookedAt: dateTimeField("Booking time."),
              passenger: z.object({
                id: uuidField("Passenger user ID."),
                firstName: z.string(),
                lastName: z.string(),
                phoneNumber: z.string().nullish(),
              }),
            }),
          ),
        },
      },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    403: {
      description: "Only the ride's driver can view its passengers.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Ride not found.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/rides/{id}/bookings/mine",
  operationId: "updateMyBooking",
  summary: "Change seats on the authenticated passenger's booking",
  description: "Only allowed while the ride is pending. Seats cannot be reduced below 1.",
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: uuidField("Ride ID.") }),
    body: { content: { "application/json": { schema: updateBookingRequestSchema } } },
  },
  responses: {
    200: {
      description: "Booking updated.",
      content: {
        "application/json": {
          schema: z.object({
            booking: rideBookingSchema,
            seatsRemaining: z.number().int().describe("Seats left on the ride."),
            totalPrice: moneyKobo("New total for the booked seats.").positive(),
          }),
        },
      },
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
      description: "Ride not found or the user has no booking on it.",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Ride is no longer pending or not enough seats.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/rides/{id}/bookings/mine",
  operationId: "cancelMyBooking",
  summary: "Cancel the authenticated passenger's booking",
  description: "Releases the booked seats. Only allowed while the ride is pending.",
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: uuidField("Ride ID.") }) },
  responses: {
    204: { description: "Booking cancelled. No content." },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Ride not found or the user has no booking on it.",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Ride is no longer pending.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

const rideLifecycle = {
  tags: ["Rides"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: uuidField("Ride ID.") }) },
  responses: {
    200: {
      description: "Ride updated.",
      content: { "application/json": { schema: rideSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    403: {
      description: "Only the ride's driver can perform this action.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Ride not found.",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Illegal status transition for this action.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
};

registry.registerPath({
  method: "patch",
  path: "/rides/{id}/start",
  operationId: "startRide",
  summary: "Start a ride (PENDING → STARTED, driver only)",
  ...rideLifecycle,
});

registry.registerPath({
  method: "patch",
  path: "/rides/{id}/complete",
  operationId: "completeRide",
  summary: "Complete a ride and settle the driver (STARTED → COMPLETED)",
  description:
    "Completes the ride and triggers driver settlement: a Paystack transfer is initiated for " +
    "each confirmed booking with a successful payment. Individual payout failures are logged " +
    "and do not fail the completion.",
  ...rideLifecycle,
  responses: {
    200: {
      description: "Ride completed.",
      content: {
        "application/json": {
          schema: z.object({
            ride: rideSchema,
            payouts: z.array(
              z.object({
                paymentId: uuidField("Payment ID."),
                payoutAmount: moneyKobo("Amount paid out to the driver."),
              }),
            ),
          }),
        },
      },
    },
    401: rideLifecycle.responses[401],
    403: rideLifecycle.responses[403],
    404: rideLifecycle.responses[404],
    422: rideLifecycle.responses[422],
  },
});

registry.registerPath({
  method: "patch",
  path: "/rides/{id}/cancel",
  operationId: "cancelRide",
  summary: "Cancel a ride (PENDING or STARTED → CANCELLED, driver only)",
  ...rideLifecycle,
});