import express from "express";
// MUST precede the route imports below: it extends Zod with `.openapi()`, and
// validationSchemas/users.js calls `.openapi` at module evaluation time.
import "./docs/registry.js";
import userRoutes from "./routes/users.js";
import vehicleRoutes from "./routes/vehicles.js";
import addressRoutes from "./routes/addresses.js";
import rideRoutes from "./routes/rides.js";
import rentalRoutes from "./routes/rentals.js";
import paymentRoutes from "./routes/payments.js";
import { pool, assertDatabaseConnection } from "./db/index.js";
import { env } from "./utils/env.js";
import { startHoldSweeper } from "./services/holds.service.js";
import { syncBanksFromPaystack } from "./services/banks.service.js";
import bankAccountRoutes from "./routes/bank_accounts.js";
import docsRoutes from "./docs/scalar.routes.js";

const app = express();

// Keeps the untouched body around so the Paystack webhook can verify its
// HMAC signature against exactly what was sent.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/vehicles", vehicleRoutes);
app.use("/api/v1/addresses", addressRoutes);
app.use("/api/v1/rides", rideRoutes);
app.use("/api/v1/rentals", rentalRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/bank-accounts", bankAccountRoutes);

// API reference is interactive documentation, not a route under test — keep it
// out of the test process so HTTP tests only see the real API surface.
if (process.env.NODE_ENV !== "test") {
  app.use("/api/v1/docs", docsRoutes);
}

app.use((req, res) => {
  res.status(404).json({
    error: { code: "RESOURCE_NOT_FOUND", message: "Route not found." },
  });
});

// Central error handler — keeps error responses JSON (including malformed
// JSON bodies rejected by express.json()).
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

const PORT = env.PORT;

try {
  await assertDatabaseConnection();
} catch (err) {
  console.error("Could not connect to the database. Is Postgres running? (docker compose up -d)");
  console.error(err.message);
  process.exit(1);
}

try {
  const count = await syncBanksFromPaystack();
  console.log(`Synced ${count} banks from Paystack.`);
} catch (err) {
  console.warn("Could not sync banks from Paystack:", err.message);
}

const server = app.listen(PORT, () => {
  console.log(`listening on port: ${PORT}`);
});

const holdSweeper = startHoldSweeper();

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  holdSweeper.stop();
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
