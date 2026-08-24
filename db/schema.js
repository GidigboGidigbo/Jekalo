import { pgTable, uuid, text, boolean, timestamp, integer, numeric, bigint, time, date, pgEnum, geometry, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Mirrors the users table in the dbdiagram.
// ninVerified / bvnVerified are present for forward-compatibility with the
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
  manufacturingYear: text("manufacturing_year").notNull(),
  color: text("color").notNull(),
  bodyType: text("body_type").notNull(),
  pictures: text('pictures').array().notNull(),
  seatingCapacity: integer("seating_capacity").notNull(),
  licensePlateNumber: text("license_plate_number").notNull(),
  driverId: uuid("driver_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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

// All monetary columns are integers in kobo (smallest unit). Amounts stay in
// kobo end-to-end: database, API payloads and Paystack requests alike.
export const rentalListings = pgTable("rental_listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicle.id),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  dailyRate: bigint("daily_rate", { mode: "number" }).notNull(),
  securityDeposit: bigint("security_deposit", { mode: "number" }).notNull(),
  pickupLocation: geometry("pickup_location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
  startDateTime: timestamp("start_date_time", { withTimezone: true }).notNull(),
  endDateTime: timestamp("end_date_time", { withTimezone: true }).notNull(),
  minimumDays: integer("minimum_days").notNull().default(1),
  status: RENTAL_LISTING_STATUS_ENUM("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (rentalListings) => [
  index("rental_pickup_location_index").using("gist", rentalListings.pickupLocation),
  index("rental_listing_vehicle_index").on(rentalListings.vehicleId),
  index("rental_listing_owner_index").on(rentalListings.ownerId),
]);

export const RENTAL_BOOKING_STATUS = {
  PENDING_PAYMENT: "pending_payment",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  EXPIRED: "expired",
};
Object.freeze(RENTAL_BOOKING_STATUS);
const RENTAL_BOOKING_STATUS_ENUM = pgEnum(
  "rental_booking_status",
  Object.values(RENTAL_BOOKING_STATUS),
);

export const rentalBookings = pgTable("rental_bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => rentalListings.id),
  renterId: uuid("renter_id").notNull().references(() => users.id),
  startDateTime: timestamp("start_date_time", { withTimezone: true }).notNull(),
  endDateTime: timestamp("end_date_time", { withTimezone: true }).notNull(),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
  securityDeposit: bigint("security_deposit", { mode: "number" }).notNull(),
  status: RENTAL_BOOKING_STATUS_ENUM("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (rentalBookings) => [
  index("rental_booking_listing_dates_index").on(
    rentalBookings.listingId,
    rentalBookings.startDateTime,
    rentalBookings.endDateTime,
  ),
  index("rental_booking_renter_index").on(rentalBookings.renterId),
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
  driverId: uuid("driver_id").notNull().references(() => users.id),
  availableSeatCapacity: integer("seating_capacity").notNull(),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicle.id),
  fromAddress: text("from_address").notNull(),
  fromLocation: geometry("from_location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
  toAddress: text("to_address").notNull(),
  toLocation: geometry("to_location", { type: "point", mode: "xy", srid: 4326 }).notNull(),
  price: bigint("price", { mode: "number" }).notNull(),
  pickupTime: time("pickup_time").notNull(),
  pickupDate: date("pickup_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  status: RIDE_STATUS_ENUM("status").notNull().default("PENDING"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (rides) => [index("from_location_index").using("gist", rides.fromLocation), index("to_location_index").using("gist", rides.toLocation)]);

// Lifecycle of a booking's hold on seats:
//   active    → seats reserved, awaiting payment
//   confirmed → payment settled, seats are theirs
//   cancelled → rider backed out (seats released)
//   expired   → sweeper released an unpaid hold (seats restored while pending)
export const RIDE_BOOKING_STATUS = {
  ACTIVE: "active",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};
Object.freeze(RIDE_BOOKING_STATUS);
const RIDE_BOOKING_STATUS_ENUM = pgEnum(
  "ride_booking_status",
  Object.values(RIDE_BOOKING_STATUS),
);

// A row = one user's booking on a ride (multi-seat supported via seats_booked).
// Only one *active* hold per passenger per ride: the partial unique index
// blocks double-booking while letting riders re-book after cancelling or an
// expired hold. It backs the 409 conflict path in the bookings endpoint.
export const rideBookings = pgTable("ride_bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  rideId: uuid("ride_id").notNull().references(() => rides.id),
  passengerId: uuid("passenger_id").notNull().references(() => users.id),
  seatsBooked: integer("seats_booked").notNull().default(1),
  status: RIDE_BOOKING_STATUS_ENUM("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (rideBookings) => [
  uniqueIndex("ride_booking_unique_active")
    .on(rideBookings.rideId, rideBookings.passengerId)
    .where(sql`status = 'active'`),
]);

// Mirrors Paystack transaction statuses we care about. "ongoing"/"queued" are
// kept as "pending" locally until a terminal status arrives via verify/webhook.
// Reversals are NOT a payment status — they are recorded as ledger entries so
// a successful charge row is never mutated (append-only money movements).
export const PAYMENT_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
  ABANDONED: "abandoned",
};
Object.freeze(PAYMENT_STATUS);
const PAYMENT_STATUS_ENUM = pgEnum(
  "payment_status",
  Object.values(PAYMENT_STATUS),
);

// What a charge is for. Exactly one linkage column must be set (enforced by
// the payments_single_linkage check below).
export const PAYMENT_PURPOSE = {
  RIDE: "ride",
  RENTAL: "rental",
};
Object.freeze(PAYMENT_PURPOSE);
const PAYMENT_PURPOSE_ENUM = pgEnum(
  "payment_purpose",
  Object.values(PAYMENT_PURPOSE),
);

// One row per Paystack transaction attempt. `reference` is generated by us and
// doubles as the idempotency key for webhook events. platformPercentage /
// platformFee snapshot the commission taken at charge time so later changes
// to PLATFORM_FEE_BPS never rewrite history.
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  purpose: PAYMENT_PURPOSE_ENUM("purpose").notNull(),
  rentalBookingId: uuid("rental_booking_id").references(() => rentalBookings.id),
  rideBookingId: uuid("ride_booking_id").references(() => rideBookings.id),
  reference: text("reference").notNull().unique(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  platformPercentage: numeric("platform_percentage", { precision: 5, scale: 2 }).notNull(),
  platformFee: bigint("platform_fee", { mode: "number" }).notNull(),
  status: PAYMENT_STATUS_ENUM("status").notNull().default("pending"),
  channel: text("channel"),
  gatewayResponse: text("gateway_response"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (payments) => [
  index("payment_user_index").on(payments.userId),
  check(
    "payments_single_linkage",
    sql`((${payments.rentalBookingId} IS NULL)::int + (${payments.rideBookingId} IS NULL)::int) = 1`,
  ),
]);

// Append-only double-entry style ledger of every money movement against a
// charge. Rows are never deleted and only `status`/response fields ever
// change; corrections happen by adding new entries (e.g. reversals), never by
// mutating existing ones.
export const LEDGER_ENTRY_TYPE = {
  CHARGE: "charge",
  PAYOUT: "payout",
  REFUND: "refund",
  REVERSAL: "reversal",
  ADJUSTMENT: "adjustment",
};
Object.freeze(LEDGER_ENTRY_TYPE);
const LEDGER_ENTRY_TYPE_ENUM = pgEnum(
  "ledger_entry_type",
  Object.values(LEDGER_ENTRY_TYPE),
);

// Direction is relative to the platform balance:
// credit = money in, debit = money out.
export const LEDGER_ENTRY_DIRECTION = {
  CREDIT: "credit",
  DEBIT: "debit",
};
Object.freeze(LEDGER_ENTRY_DIRECTION);
const LEDGER_ENTRY_DIRECTION_ENUM = pgEnum(
  "ledger_entry_direction",
  Object.values(LEDGER_ENTRY_DIRECTION),
);

export const LEDGER_ENTRY_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
};
Object.freeze(LEDGER_ENTRY_STATUS);
const LEDGER_ENTRY_STATUS_ENUM = pgEnum(
  "ledger_entry_status",
  Object.values(LEDGER_ENTRY_STATUS),
);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  entryType: LEDGER_ENTRY_TYPE_ENUM("entry_type").notNull(),
  direction: LEDGER_ENTRY_DIRECTION_ENUM("direction").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  status: LEDGER_ENTRY_STATUS_ENUM("status").notNull().default("pending"),
  // Paystack reference for this movement (transfer ref / refund ref). The
  // unique constraint doubles as webhook idempotency; NULLs are allowed and
  // never collide.
  gatewayReference: text("gateway_reference").unique(),
  gatewayResponse: text("gateway_response"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (ledgerEntries) => [
  index("ledger_entry_payment_index").on(ledgerEntries.paymentId),
]);
