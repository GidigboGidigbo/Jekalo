import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

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
