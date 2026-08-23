import { z } from "zod";

const statusValues = ["pending", "rented", "cancelled", "returned"];
export const MIN_RENTAL_DURATION_DAYS = 3;
const minimumRentalDurationMs = MIN_RENTAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

const coordinate = z.number().finite();
const pickupLocationSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([coordinate, coordinate]),
});
const dateTime = z.iso.datetime({ offset: true });

// Money fields are integers in kobo (smallest unit) end-to-end.
const koboAmount = (message) =>
  z.number({ error: message }).int("Amount must be a whole number of kobo.");

export const createRentalListingSchema = z
  .object({
    vehicleId: z.uuid("Vehicle ID must be a valid UUID."),
    dailyRate: koboAmount("Daily rate is required.").positive("Daily rate must be greater than zero."),
    securityDeposit: koboAmount("Security deposit is required.").nonnegative(),
    pickupLocation: pickupLocationSchema,
    startDateTime: dateTime,
    endDateTime: dateTime,
    minimumDays: z.number().int().positive(),
  })
  .refine(
    (fields) =>
      new Date(fields.endDateTime).getTime() - new Date(fields.startDateTime).getTime() >=
      minimumRentalDurationMs,
    {
      path: ["endDateTime"],
      message: "Rental listings must be at least 3 days long.",
    },
  );

export const updateRentalListingSchema = z
  .object({
    dailyRate: koboAmount("Daily rate is required.").positive("Daily rate must be greater than zero.").optional(),
    securityDeposit: koboAmount("Security deposit is required.").nonnegative().optional(),
    pickupLocation: pickupLocationSchema.optional(),
    startDateTime: dateTime.optional(),
    endDateTime: dateTime.optional(),
    minimumDays: z.number().int().positive().optional(),
    status: z.enum(statusValues).optional(),
  })
  .refine((fields) => Object.keys(fields).length > 0, {
    message: "At least one rental listing field is required.",
  });

// TODO: Ensure users cannot rent a car for less than one day
const queryKobo = z.coerce.number().int("Amount must be a whole number of kobo.").nonnegative();

export const searchRentalListingsSchema = z
  .object({
    startDateTime: dateTime,
    endDateTime: dateTime,
    minDailyRate: queryKobo.optional(),
    maxDailyRate: queryKobo.optional(),
  })
  .refine(
    (fields) => new Date(fields.endDateTime).getTime() > new Date(fields.startDateTime).getTime(),
    {
      path: ["endDateTime"],
      message: "End date and time must be after the start date and time.",
    },
  )
  .refine(
    (fields) =>
      fields.minDailyRate === undefined ||
      fields.maxDailyRate === undefined ||
      fields.minDailyRate <= fields.maxDailyRate,
    {
      path: ["maxDailyRate"],
      message: "Maximum daily rate must be greater than or equal to the minimum daily rate.",
    },
  );

export const rentalListingIdSchema = z.object({
  id: z.uuid("Rental listing ID must be a valid UUID."),
});

export const createRentalBookingSchema = z
  .object({
    startDateTime: dateTime,
    endDateTime: dateTime,
  })
  .refine(
    (fields) => new Date(fields.endDateTime).getTime() > new Date(fields.startDateTime).getTime(),
    {
      path: ["endDateTime"],
      message: "End date must be after the start date.",
    },
  );
