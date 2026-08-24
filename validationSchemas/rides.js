import { z } from "zod";

// Money fields are integers in kobo (smallest unit) end-to-end.
const koboAmount = (message) =>
  z.number({ error: message }).int("Amount must be a whole number of kobo.").positive("Price must be greater than zero.");

export const createRideSchema = z.object({
  vehicleId: z.string({ error: "Vehicle ID is required." }).uuid("Vehicle ID must be a valid UUID."),
  availableSeatCapacity: z.number({ error: "Available seat capacity is required." }).int().min(1),
  fromAddress: z.string({ error: "From address is required." }).min(1, "From address is required."),
  fromLat: z.number({ error: "From latitude is required." }).min(-90).max(90),
  fromLong: z.number({ error: "From longitude is required." }).min(-180).max(180),
  toAddress: z.string({ error: "To address is required." }).min(1, "To address is required."),
  toLat: z.number({ error: "To latitude is required." }).min(-90).max(90),
  toLong: z.number({ error: "To longitude is required." }).min(-180).max(180),
  price: koboAmount("Price is required."),
  pickupTime: z.string({ error: "Pickup time is required." }).min(1),
  pickupDate: z.string({ error: "Pickup date is required." }).min(1),
});

export const updateRideStatusSchema = z.object({
  status: z.enum(["STARTED", "COMPLETED", "CANCELLED"], { error: "Status is required." }),
});

export const searchRidesSchema = z.object({
  fromLat: z.number({ error: "From latitude is required." }).min(-90).max(90),
  fromLong: z.number({ error: "From longitude is required." }).min(-180).max(180),
  toLat: z.number({ error: "To latitude is required." }).min(-90).max(90),
  toLong: z.number({ error: "To longitude is required." }).min(-180).max(180),
  radius: z.number({ error: "Radius is required." }).min(0.1).max(50).optional().default(3),
});

export const createBookingSchema = z.object({
  seats: z
    .number({ error: "Seats must be a number." })
    .int("Seats must be a whole number.")
    .min(1, "Seats must be at least 1.")
    .max(10, "Seats cannot exceed 10 per booking.")
    .optional()
    .default(1),
  // Where Paystack redirects the rider after checkout. Required so the
  // frontend fully controls the post-payment landing spot.
  callbackUrl: z.url("Callback URL must be a valid URL."),
});

export const updateBookingSchema = z.object({
  seats: z
    .number({ error: "Seats must be a number." })
    .int("Seats must be a whole number.")
    .min(1, "Seats must be at least 1 — to remove your booking, cancel it instead.")
    .max(10, "Seats cannot exceed 10 per booking."),
});
