import express from "express";
import userRoutes from "./routes/users.js";
import { pool, assertDatabaseConnection } from "./db/index.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/users", userRoutes);

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

const PORT = process.env.PORT || 3000;

try {
  await assertDatabaseConnection();
} catch (err) {
  console.error("Could not connect to the database. Is Postgres running? (docker compose up -d)");
  console.error(err.message);
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`listening on port: ${PORT}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
