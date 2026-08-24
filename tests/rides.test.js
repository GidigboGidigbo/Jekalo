import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { buildApp, createTestUser, signToken, cleanupTestData, closePool } from "./helpers.js";
import { findMatchingRides } from "../db/rides.repo.js";

let server;
let baseUrl;
let driver;
let driverToken;
let vehicleId;

// Lagos coordinates for testing
const IKEJA = { lat: 6.6018, lng: 3.3515 };
const IKEJA_NEAR = { lat: 6.605, lng: 3.355 }; // ~500m from Ikeja
const VICTORIA_ISLAND = { lat: 6.4281, lng: 3.4219 }; // ~20km from Ikeja
const LEKKI = { lat: 6.4477, lng: 3.4629 }; // ~18km from Ikeja
const SURULERE = { lat: 6.5263, lng: 3.3581 }; // ~9km from Ikeja

before(async () => {
  await cleanupTestData();
  const app = buildApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });

  const { user } = await createTestUser({ email: "rider@example.com" });
  driver = user;
  driverToken = signToken(user.id);

  // Create a vehicle for the driver
  const res = await fetch(`${baseUrl}/api/v1/vehicles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${driverToken}`,
    },
    body: JSON.stringify({
      make: "Toyota",
      model: "Corolla",
      manufacturingYear: "2023",
      color: "White",
      bodyType: "Sedan",
      pictures: ["https://example.com/car.jpg"],
      seatingCapacity: 4,
      licensePlateNumber: "LAG-RIDE-001",
    }),
  });
  const vehicleBody = await res.json();
  vehicleId = vehicleBody.id;
});

after(async () => {
  await cleanupTestData();
  await closePool();
  await new Promise((resolve) => server.close(resolve));
});

async function createRide(overrides) {
  const defaults = {
    vehicleId: vehicleId,
    availableSeatCapacity: 3,
    fromAddress: "Ikeja, Lagos",
    fromLat: IKEJA.lat,
    fromLong: IKEJA.lng,
    toAddress: "Victoria Island, Lagos",
    toLat: VICTORIA_ISLAND.lat,
    toLong: VICTORIA_ISLAND.lng,
    price: 250_000,
    pickupTime: "08:00",
    pickupDate: "2026-08-20",
    ...overrides,
  };

  const res = await fetch(`${baseUrl}/api/v1/rides`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${driverToken}`,
    },
    body: JSON.stringify(defaults),
  });

  return res.json();
}

describe("Rides", () => {
  let rideId;

  describe("POST /", () => {
    it("creates a ride with coordinates", async () => {
      const res = await fetch(`${baseUrl}/api/v1/rides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          vehicleId: vehicleId,
          availableSeatCapacity: 3,
          fromAddress: "Ikeja, Lagos",
          fromLat: IKEJA.lat,
          fromLong: IKEJA.lng,
          toAddress: "Victoria Island, Lagos",
          toLat: VICTORIA_ISLAND.lat,
          toLong: VICTORIA_ISLAND.lng,
          price: 250_000,
          pickupTime: "08:00",
          pickupDate: "2026-08-20",
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 201);
      assert.ok(body.id);
      assert.strictEqual(body.fromAddress, "Ikeja, Lagos");
      assert.strictEqual(body.toAddress, "Victoria Island, Lagos");
      assert.strictEqual(body.status, "PENDING");
      rideId = body.id;
    });

    it("returns 400 for missing fields", async () => {
      const res = await fetch(`${baseUrl}/api/v1/rides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({ fromAddress: "Ikeja" }),
      });

      assert.strictEqual(res.status, 400);
    });
  });

  describe("GET /", () => {
    it("returns paginated rides for the driver", async () => {
      const res = await fetch(`${baseUrl}/api/v1/rides?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.pagination);
      assert.ok(body.pagination.total >= 1);
      assert.strictEqual(body.pagination.page, 1);
    });
  });

  describe("GET /:id", () => {
    it("returns a ride by id", async () => {
      const res = await fetch(`${baseUrl}/api/v1/rides/${rideId}`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.id, rideId);
    });

    it("returns 404 for non-existent ride", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/rides/00000000-0000-0000-0000-000000000000`,
        { headers: { Authorization: `Bearer ${driverToken}` } },
      );

      assert.strictEqual(res.status, 404);
    });
  });

  describe("PATCH /:id/status", () => {
    it("updates ride status to STARTED", async () => {
      const res = await fetch(`${baseUrl}/api/v1/rides/${rideId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({ status: "STARTED" }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.status, "STARTED");
    });

    it("returns 400 for invalid status", async () => {
      const res = await fetch(`${baseUrl}/api/v1/rides/${rideId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({ status: "INVALID" }),
      });

      assert.strictEqual(res.status, 400);
    });
  });

  describe("QUERY /search", () => {
    it("finds rides near origin and destination", async () => {
      await createRide({
        fromAddress: "Ikeja, Lagos",
        fromLat: IKEJA.lat,
        fromLong: IKEJA.lng,
        toAddress: "Lekki, Lagos",
        toLat: LEKKI.lat,
        toLong: LEKKI.lng,
        pickupTime: "09:00",
        pickupDate: "2026-08-21",
      });

      const res = await fetch(`${baseUrl}/api/v1/rides/search`, {
        method: "QUERY",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          fromLat: IKEJA_NEAR.lat,
          fromLong: IKEJA_NEAR.lng,
          toLat: 6.45,
          toLong: 3.465,
          radius: 3,
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(body));
      assert.ok(body.length >= 1);
      assert.strictEqual(body[0].fromAddress, "Ikeja, Lagos");
    });

    it("returns empty when outside radius", async () => {
      const res = await fetch(`${baseUrl}/api/v1/rides/search`, {
        method: "QUERY",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          fromLat: 6.5,
          fromLong: 3.7,
          toLat: 6.4,
          toLong: 3.5,
          radius: 1,
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 0);
    });

    it("sorts results by distance from origin", async () => {
      await createRide({
        fromAddress: "Far origin",
        fromLat: 6.62,
        fromLong: 3.37,
        toAddress: "Lekki",
        toLat: LEKKI.lat,
        toLong: LEKKI.lng,
        pickupTime: "10:00",
        pickupDate: "2026-08-22",
      });

      const res = await fetch(`${baseUrl}/api/v1/rides/search`, {
        method: "QUERY",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          fromLat: IKEJA.lat,
          fromLong: IKEJA.lng,
          toLat: LEKKI.lat,
          toLong: LEKKI.lng,
          radius: 5,
        }),
      });

      const body = await res.json();
      assert.ok(body.length >= 2);
      assert.strictEqual(body[0].fromAddress, "Ikeja, Lagos");
    });
  });

  describe("findMatchingRides", () => {
    it("only returns PENDING rides, not STARTED or COMPLETED", async () => {
      // Create a PENDING ride
      await createRide({
        fromAddress: "Pending ride",
        fromLat: IKEJA.lat,
        fromLong: IKEJA.lng,
        toAddress: "VI",
        toLat: VICTORIA_ISLAND.lat,
        toLong: VICTORIA_ISLAND.lng,
        pickupTime: "11:00",
        pickupDate: "2026-08-23",
      });

      // Create another ride and mark it STARTED
      const started = await createRide({
        fromAddress: "Started ride",
        fromLat: IKEJA.lat,
        fromLong: IKEJA.lng,
        toAddress: "VI",
        toLat: VICTORIA_ISLAND.lat,
        toLong: VICTORIA_ISLAND.lng,
        pickupTime: "12:00",
        pickupDate: "2026-08-23",
      });

      await fetch(`${baseUrl}/api/v1/rides/${started.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({ status: "STARTED" }),
      });

      const results = await findMatchingRides(
        IKEJA.lat, IKEJA.lng,
        VICTORIA_ISLAND.lat, VICTORIA_ISLAND.lng,
        20,
      );

      const addresses = results.map((r) => r.fromAddress);
      assert.ok(addresses.includes("Pending ride"));
      assert.ok(!addresses.includes("Started ride"));
    });

    it("respects custom radius — large radius captures distant rides", async () => {
      const results = await findMatchingRides(
        IKEJA.lat, IKEJA.lng,
        VICTORIA_ISLAND.lat, VICTORIA_ISLAND.lng,
        25,
      );

      assert.ok(results.length >= 1);
    });

    it("small radius filters out distant rides", async () => {
      // Create a ride from a far location (Surulere origin)
      await createRide({
        fromAddress: "Surulere ride",
        fromLat: SURULERE.lat,
        fromLong: SURULERE.lng,
        toAddress: "VI",
        toLat: VICTORIA_ISLAND.lat,
        toLong: VICTORIA_ISLAND.lng,
        pickupTime: "13:00",
        pickupDate: "2026-08-24",
      });

      // Search with a very small radius from Ikeja — should NOT find Surulere ride
      const results = await findMatchingRides(
        IKEJA.lat, IKEJA.lng,
        VICTORIA_ISLAND.lat, VICTORIA_ISLAND.lng,
        1,
      );

      const addresses = results.map((r) => r.fromAddress);
      assert.ok(!addresses.includes("Surulere ride"));
    });

    it("requires BOTH origin and destination to be within radius", async () => {
      // Create a ride with origin near Ikeja but destination far from VI
      await createRide({
        fromAddress: "Ikeja to far dest",
        fromLat: IKEJA.lat,
        fromLong: IKEJA.lng,
        toAddress: "Far destination",
        toLat: SURULERE.lat,
        toLong: SURULERE.lng,
        pickupTime: "14:00",
        pickupDate: "2026-08-25",
      });

      // Search near Ikeja origin + near VI destination
      // Should NOT match because destination is far
      const results = await findMatchingRides(
        IKEJA_NEAR.lat, IKEJA_NEAR.lng,
        VICTORIA_ISLAND.lat, VICTORIA_ISLAND.lng,
        3,
      );

      const addresses = results.map((r) => r.fromAddress);
      assert.ok(!addresses.includes("Ikeja to far dest"));
    });

    it("returns results ordered by distance from origin", async () => {
      // Create rides at different distances from a search point
      await createRide({
        fromAddress: "Close ride",
        fromLat: IKEJA_NEAR.lat,
        fromLong: IKEJA_NEAR.lng,
        toAddress: "VI",
        toLat: VICTORIA_ISLAND.lat,
        toLong: VICTORIA_ISLAND.lng,
        pickupTime: "15:00",
        pickupDate: "2026-08-26",
      });

      await createRide({
        fromAddress: "Far ride",
        fromLat: SURULERE.lat,
        fromLong: SURULERE.lng,
        toAddress: "VI",
        toLat: VICTORIA_ISLAND.lat,
        toLong: VICTORIA_ISLAND.lng,
        pickupTime: "16:00",
        pickupDate: "2026-08-26",
      });

      const results = await findMatchingRides(
        IKEJA.lat, IKEJA.lng,
        VICTORIA_ISLAND.lat, VICTORIA_ISLAND.lng,
        25,
      );

      assert.ok(results.length >= 2);
      const closeIdx = results.findIndex((r) => r.fromAddress === "Close ride");
      const farIdx = results.findIndex((r) => r.fromAddress === "Far ride");
      assert.ok(closeIdx < farIdx, "Close ride should appear before far ride");
    });
  });
});
