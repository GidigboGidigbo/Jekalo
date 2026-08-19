import { pgTable, uuid, text, boolean, timestamp, integer, numeric, time, date, pgEnum, geometry, index, uniqueIndex } from "drizzle-orm/pg-core";

// Mirrors the users table in the dbdiagram.
// nin_verified / bvn_verified are present for forward-compatibility with the
// deferred KYC work — nothing reads or writes them yet.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  phoneNumber: text("phone_number"),
  // Uniqueness is case-insensitive in practice: all writes are lowercased by
  // the Zod email schema before they reach the database.
  email: text("email").notNull().unique(),
  profilePicture: text("profile_picture"),
  ninVerified: boolean("nin_verified").notNull().default(false),
  bvnVerified: boolean("bvn_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vehicle = pgTable("vehicles", {
  id: uuid("id").defaultRandom().primaryKey(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  manufacturing_year: text("manufacturing_year").notNull(),
  color: text("color").notNull(),
  body_type: text("body_type").notNull(),
  pictures: text('pictures').array().notNull(),
  seating_capacity: integer("seating_capacity").notNull(),
  license_plate_number: text("license_plate_number").notNull(),
  driver_id: uuid("driver_id").notNull().references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const RENTAL_LISTING_STATUS = {
  PENDING: "pending",
  RENTED: "rented",
  CANCELLED: "cancelled",
  RETURNED: "returned",
};
Object.freeze(RENTAL_LISTING_STATUS);
const RENTAL_LISTING_STATUS_ENUM = pgEnum(
  "rental_listing_status",
  Object.values(RENTAL_LISTING_STATUS),
);

export const rentalListings = pgTable("rental_listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  vehicle_id: uuid("vehicle_id").notNull().references(() => vehicle.id),
  owner_id: uuid("owner_id").notNull().references(() => users.id),
  daily_rate_ngn: numeric("daily_rate_ngn", { precision: 12, scale: 2 }).notNull(),
  security_deposit_ngn: numeric("security_deposit_ngn", { precision: 12, scale: 2 }).notNull(),
  pickup_location: geometry("pickup_location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
  start_date_time: timestamp("start_date_time", { withTimezone: true }).notNull(),
  end_date_time: timestamp("end_date_time", { withTimezone: true }).notNull(),
  minimum_days: integer("minimum_days").notNull().default(1),
  status: RENTAL_LISTING_STATUS_ENUM("status").notNull().default("pending"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (rentalListings) => [
  index("rental_pickup_location_index").using("gist", rentalListings.pickup_location),
  index("rental_listing_vehicle_index").on(rentalListings.vehicle_id),
  index("rental_listing_owner_index").on(rentalListings.owner_id),
]);

export const RENTAL_BOOKING_STATUS = {
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
};
Object.freeze(RENTAL_BOOKING_STATUS);
const RENTAL_BOOKING_STATUS_ENUM = pgEnum(
  "rental_booking_status",
  Object.values(RENTAL_BOOKING_STATUS),
);

export const rentalBookings = pgTable("rental_bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  listing_id: uuid("listing_id").notNull().references(() => rentalListings.id),
  renter_id: uuid("renter_id").notNull().references(() => users.id),
  start_date_time: timestamp("start_date_time", { withTimezone: true }).notNull(),
  end_date_time: timestamp("end_date_time", { withTimezone: true }).notNull(),
  total_amount_ngn: numeric("total_amount_ngn", { precision: 12, scale: 2 }).notNull(),
  security_deposit_ngn: numeric("security_deposit_ngn", { precision: 12, scale: 2 }).notNull(),
  status: RENTAL_BOOKING_STATUS_ENUM("status").notNull().default("confirmed"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (rentalBookings) => [
  index("rental_booking_listing_dates_index").on(
    rentalBookings.listing_id,
    rentalBookings.start_date_time,
    rentalBookings.end_date_time,
  ),
  index("rental_booking_renter_index").on(rentalBookings.renter_id),
]);

export const RIDE_STATUS = {
  PENDING: "PENDING",
  STARTED: "STARTED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
}; 
Object.freeze(RIDE_STATUS);
const RIDE_STATUS_ENUM = pgEnum("ride_status", Object.values(RIDE_STATUS))

export const rides = pgTable("rides", {
  id: uuid("id").defaultRandom().primaryKey(),
  driver_id: uuid("driver_id").notNull().references(() => users.id),
  available_seat_capacity: integer("seating_capacity").notNull(),
  vehicle_id: uuid("vehicle_id").notNull().references(() => vehicle.id),
  from_address: text("from_address").notNull(),
  from_location: geometry("from_location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
  to_address: text("to_address").notNull(),
  to_location: geometry("to_location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  pickup_time: time("pickup_time").notNull(),
  pickup_date: date("pickup_date").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  status: RIDE_STATUS_ENUM("status").notNull().default("PENDING"),
  started_at: timestamp("started_at"),
  completed_at: timestamp("completed_at"),
}, (rides) => [index("from_location_index").using("gist", rides.from_location), index("to_location_index").using("gist", rides.to_location)]);

// A row = one user's booking on a ride (multi-seat supported via seats_booked).
// The unique index prevents a passenger booking the same ride twice and backs
// the 409 conflict path in the bookings endpoint.
export const ride_bookings = pgTable("ride_bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  ride_id: uuid("ride_id").notNull().references(() => rides.id),
  passenger_id: uuid("passenger_id").notNull().references(() => users.id),
  seats_booked: integer("seats_booked").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (ride_bookings) => [uniqueIndex("ride_booking_unique").on(ride_bookings.ride_id, ride_bookings.passenger_id)]);
