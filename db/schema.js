import { pgTable, uuid, text, boolean, timestamp, integer, numeric, time, date, pgEnum, geometry, index } from "drizzle-orm/pg-core";

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
  manufacturing_year: text("year").notNull(),
  color: text("color").notNull(),
  bod_type: text("body_type").notNull(),
  pictures: text('pictures').array().notNull(),
  seating_capacity: integer("seating_capacity").notNull(),
  license_plate_number: text("license_plate_number").notNull(),
  driver_id: uuid("driver_id").notNull().references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
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
