import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "./index.js";
import { rentalListings, vehicle, RENTAL_LISTING_STATUS } from "./schema.js";
import { MIN_RENTAL_DURATION_DAYS } from "../validationSchemas/rentals.js";

// The minimum number of days a rental can be put up as available (in ms).
// Currently set to 3
const minimumRentalDurationMs = MIN_RENTAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

// A pending car can only transition to rented or cancelled
// A rented car can only transition to returned
const STATUS_TRANSITIONS = {
  [RENTAL_LISTING_STATUS.PENDING]: new Set([
    RENTAL_LISTING_STATUS.PENDING,
    RENTAL_LISTING_STATUS.RENTED,
    RENTAL_LISTING_STATUS.CANCELLED,
  ]),
  [RENTAL_LISTING_STATUS.RENTED]: new Set([
    RENTAL_LISTING_STATUS.RENTED,
    RENTAL_LISTING_STATUS.RETURNED,
  ]),
  [RENTAL_LISTING_STATUS.CANCELLED]: new Set([RENTAL_LISTING_STATUS.CANCELLED]),
  [RENTAL_LISTING_STATUS.RETURNED]: new Set([RENTAL_LISTING_STATUS.RETURNED]),
};

function pointToDatabase(point) {
  const [longitude, latitude] = point.coordinates;
  return { x: longitude, y: latitude };
}

function toDatabaseFields(fields) {
  const values = { ...fields };
  if (values.pickupLocation) values.pickupLocation = pointToDatabase(values.pickupLocation);
  if (values.startDateTime) values.startDateTime = new Date(values.startDateTime);
  if (values.endDateTime) values.endDateTime = new Date(values.endDateTime);
  return values;
}

// createRentalListing puts up a vehicle for rental. It ensures the 
// vehicle to put up is owned by the user. The rental starts with default
// status of pending.
export async function createRentalListing(ownerId, fields) {
  const startDateTime = new Date(fields.startDateTime);
  const endDateTime = new Date(fields.endDateTime);
  if (endDateTime.getTime() - startDateTime.getTime() < minimumRentalDurationMs) {
    return { reason: "INVALID_DATE_RANGE" };
  }

  const [ownedVehicle] = await db
    .select({ id: vehicle.id })
    .from(vehicle)
    .where(and(eq(vehicle.id, fields.vehicleId), eq(vehicle.driverId, ownerId)))
    .limit(1);

  if (!ownedVehicle) return { reason: "VEHICLE_NOT_OWNED" };

  const [listing] = await db
    .insert(rentalListings)
    .values({
      ...toDatabaseFields(fields),
      ownerId,
      status: RENTAL_LISTING_STATUS.PENDING,
    })
    .returning();
  return { listing };
}

// getRentalListings returns all the rental listings a user has put up
export async function getRentalListings(ownerId) {
  return db
    .select()
    .from(rentalListings)
    .where(eq(rentalListings.ownerId, ownerId));
}

// searchRentalListings allows searching listings based on start and end date
// and daily rate. This allows users to search cars they would like to rent.
// It prevents a user from seeing a listing they put up for rent themselves.
// Ensures the listing is pending or returned. (TODO: should we allowed returned
// cars here, that means a returned car is available for renting again? need to 
// understand this). TODO: enforce that the search end_date and start_date is at
// least 1 day apart.i.e. users cannot rent a car for less than one day
//
// It ensures the start and end date are within range for listings. Also checks
// that returned listings are withiin the price range specified for the search
export async function searchRentalListings(userId, filters) {
  const conditions = [
    ne(rentalListings.ownerId, userId),
    inArray(rentalListings.status, [
      RENTAL_LISTING_STATUS.PENDING,
      RENTAL_LISTING_STATUS.RETURNED,
    ]),
    lte(rentalListings.startDateTime, new Date(filters.startDateTime)),
    gte(rentalListings.endDateTime, new Date(filters.endDateTime)),
  ];

  if (filters.minDailyRate !== undefined) {
    conditions.push(gte(rentalListings.dailyRate, filters.minDailyRate));
  }
  if (filters.maxDailyRate !== undefined) {
    conditions.push(lte(rentalListings.dailyRate, filters.maxDailyRate));
  }

  return db
    .select()
    .from(rentalListings)
    .where(and(...conditions));
}

// getRentalListing gets a particular rental listing by a user.
export async function getRentalListing(id, ownerId) {
  const [listing] = await db
    .select()
    .from(rentalListings)
    .where(and(eq(rentalListings.id, id), eq(rentalListings.ownerId, ownerId)))
    .limit(1);
  return listing;
}

// updateRentalListings allows a user update a rental listing. It ensures the
// end date is after the start date. It ensures a valid transition for a
// listing's status.
export async function updateRentalListing(id, ownerId, fields) {
  const listing = await getRentalListing(id, ownerId);
  if (!listing) return { reason: "NOT_FOUND" };

  const startDateTime = fields.startDateTime
    ? new Date(fields.startDateTime)
    : listing.startDateTime;
  const endDateTime = fields.endDateTime
    ? new Date(fields.endDateTime)
    : listing.endDateTime;
  if (endDateTime.getTime() - startDateTime.getTime() < minimumRentalDurationMs) {
    return { reason: "INVALID_DATE_RANGE", listing };
  }

  if (!STATUS_TRANSITIONS[listing.status]?.has(fields.status ?? listing.status)) {
    return { reason: "INVALID_STATUS_TRANSITION", listing };
  }

  const [updated] = await db
    .update(rentalListings)
    .set({ ...toDatabaseFields(fields), updatedAt: new Date() })
    .where(and(eq(rentalListings.id, id), eq(rentalListings.ownerId, ownerId)))
    .returning();
  return { listing: updated };
}

// deleteRentalListing allows a user delete a rental listing they put up.
// It prevents an already rented listing from being deleted.
export async function deleteRentalListing(id, ownerId) {
  const listing = await getRentalListing(id, ownerId);
  if (!listing) return { reason: "NOT_FOUND" };
  if (listing.status === RENTAL_LISTING_STATUS.RENTED) {
    return { reason: "RENTED", listing };
  }

  const [deleted] = await db
    .delete(rentalListings)
    .where(and(eq(rentalListings.id, id), eq(rentalListings.ownerId, ownerId)))
    .returning({ id: rentalListings.id });
  return { deleted };
}