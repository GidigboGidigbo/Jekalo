import { z } from "zod";

const statusValues = ["pending", "rented", "cancelled", "returned"];
export const MIN_RENTAL_DURATION_DAYS = 3;
const minimumRentalDurationMs = MIN_RENTAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

const coordinate = z.number().finite();
const pickupLocation = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([coordinate, coordinate]),
});
const dateTime = z.iso.datetime({ offset: true });

const listingFields = {
  daily_rate_ngn: z.number().finite().positive(),
  security_deposit_ngn: z.number().finite().nonnegative(),
  pickup_location: pickupLocation,
  start_date_time: dateTime,
  end_date_time: dateTime,
  minimum_days: z.number().int().positive(),
};

export const createRentalListingSchema = z
  .object({
    vehicle_id: z.uuid("Vehicle ID must be a valid UUID."),
    ...listingFields,
  })
  .refine(
    (fields) =>
      new Date(fields.end_date_time).getTime() - new Date(fields.start_date_time).getTime() >=
      minimumRentalDurationMs,
    {
    path: ["end_date_time"],
      message: "Rental listings must be at least 3 days long.",
    },
  );

export const updateRentalListingSchema = z
  .object({
    daily_rate_ngn: listingFields.daily_rate_ngn.optional(),
    security_deposit_ngn: listingFields.security_deposit_ngn.optional(),
    pickup_location: listingFields.pickup_location.optional(),
    start_date_time: listingFields.start_date_time.optional(),
    end_date_time: listingFields.end_date_time.optional(),
    minimum_days: listingFields.minimum_days.optional(),
    status: z.enum(statusValues).optional(),
  })
  .refine((fields) => Object.keys(fields).length > 0, {
    message: "At least one rental listing field is required.",
  });

// TODO: Ensure users cannot rent a car for less than one day
const queryDateTime = z.iso.datetime({ offset: true });
const queryMoney = z.coerce.number().finite().nonnegative();

export const searchRentalListingsSchema = z
  .object({
    start_date_time: queryDateTime,
    end_date_time: queryDateTime,
    min_daily_rate_ngn: queryMoney.optional(),
    max_daily_rate_ngn: queryMoney.optional(),
  })
  .refine(
    (fields) => new Date(fields.end_date_time).getTime() > new Date(fields.start_date_time).getTime(),
    {
      path: ["end_date_time"],
      message: "End date and time must be after the start date and time.",
    },
  )
  .refine(
    (fields) =>
      fields.min_daily_rate_ngn === undefined ||
      fields.max_daily_rate_ngn === undefined ||
      fields.min_daily_rate_ngn <= fields.max_daily_rate_ngn,
    {
      path: ["max_daily_rate_ngn"],
      message: "Maximum daily rate must be greater than or equal to the minimum daily rate.",
    },
  );

export const rentalListingIdSchema = z.object({
  id: z.uuid("Rental listing ID must be a valid UUID."),
});