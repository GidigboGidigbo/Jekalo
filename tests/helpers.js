import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
// MUST precede the route imports below: it extends Zod with `.openapi()`, and
// validationSchemas/users.js calls `.openapi` at module evaluation time.
import "../docs/registry.js";
import { pool, db } from "../db/index.js";
import { users, vehicle, rides } from "../db/schema.js";
import { eq } from "drizzle-orm";
import userRoutes from "../routes/users.js";
import vehicleRoutes from "../routes/vehicles.js";
import rideRoutes from "../routes/rides.js";
import addressRoutes from "../routes/addresses.js";
import rentalRoutes from "../routes/rentals.js";
import paymentRoutes from "../routes/payments.js";
import bankAccountRoutes from "../routes/bank_accounts.js";

const JWT_SECRET = process.env.JWT_SECRET || "jekalo-dev-secret";

export function buildApp() {
  const app = express();
  // Mirrors index.js: keeps the raw body around for webhook signature checks.
  app.use(express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/api/v1/users", userRoutes);
  app.use("/api/v1/vehicles", vehicleRoutes);
  app.use("/api/v1/rides", rideRoutes);
  app.use("/api/v1/addresses", addressRoutes);
  app.use("/api/v1/rentals", rentalRoutes);
  app.use("/api/v1/payments", paymentRoutes);
  app.use("/api/v1/bank-accounts", bankAccountRoutes);

  // Mirrors index.js so unmatched routes return the standard JSON envelope.
  app.use((req, res) => {
    res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Route not found." },
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({
        error: { code: "VALIDATION_FAILED", message: "Request body is not valid JSON." },
      });
    }
    console.error(err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
    });
  });

  return app;
}

let testEmailCounter = 0;

export async function createTestUser(overrides = {}) {
  testEmailCounter++;
  const password = overrides.password || "Password1";

  const [user] = await db
    .insert(users)
    .values({
      firstName: overrides.firstName || "Test",
      lastName: overrides.lastName || "User",
      email: overrides.email || `testuser${testEmailCounter}@example.com`,
      phoneNumber: overrides.phoneNumber || `080${String(testEmailCounter).padStart(8, "0")}`,
      passwordHash: await bcrypt.hash(password, 10),
    })
    .returning();

  return { user, password };
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: 3600 });
}

export async function cleanupTestData() {
  await pool.query("DELETE FROM ledger_entries").catch(() => {});
  await pool.query("DELETE FROM payments").catch(() => {});
  await pool.query("DELETE FROM ride_bookings").catch(() => {});
  await pool.query("DELETE FROM rental_bookings").catch(() => {});
  await pool.query("DELETE FROM rental_listings").catch(() => {});
  await pool.query("DELETE FROM rides").catch(() => {});
  await pool.query("DELETE FROM vehicles").catch(() => {});
  await pool.query("DELETE FROM bank_accounts").catch(() => {});
  await pool.query("DELETE FROM users").catch(() => {});
}

export async function closePool() {
  await pool.end();
}
