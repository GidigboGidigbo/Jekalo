import { createRequire } from "node:module";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry.js";
import { tagGroups } from "./openapi.tagGroups.js";

// Static imports — the complete, explicit list of every doc module. Adding a
// route means registering it in its resource module and nothing else; adding a
// resource means one more import line here. Failures are loud (import-time),
// ordering is deterministic, and the spec graph is statically analyzable.
import "./api/users.openapi.js";
import "./api/vehicles.openapi.js";
import "./api/addresses.openapi.js";
import "./api/rides.openapi.js";
import "./api/rentals.openapi.js";
import "./api/payments.openapi.js";
import "./api/bank_accounts.openapi.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

let spec;

/** Builds the full OpenAPI 3.1 document once, then caches it. */
export function buildOpenApiSpec() {
  if (spec) return spec;

  const baseDocument = {
    openapi: "3.1.0",
    info: {
      title: "Jekalo API",
      version,
      description: "API reference for Jekalo ride-sharing and car rental.",
    },
    // Routes are emitted without the /api/v1 prefix; the server anchor keeps
    // them scoped to the mounted API version.
    servers: [{ url: "/api/v1", description: "API v1" }],
    tags: [
      { name: "Users", summary: "User accounts and authentication." },
      { name: "Vehicles", summary: "Vehicle registration and management." },
      { name: "Addresses", summary: "Place search via Google Places." },
      { name: "Rides", summary: "Ride creation, search, booking and lifecycle." },
      { name: "Rentals", summary: "Car rental listings and date bookings." },
      { name: "Payments", summary: "Paystack settlement, history and webhook." },
      { name: "Bank Accounts", summary: "Driver settlement accounts." },
    ],
    "x-tagGroups": tagGroups,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {},
    },
    paths: {},
  };

  spec = new OpenApiGeneratorV31(registry.definitions).generateDocument(baseDocument);
  return spec;
}