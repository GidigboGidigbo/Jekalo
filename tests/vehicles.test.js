import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { buildApp, createTestUser, signToken, cleanupTestData, closePool } from "./helpers.js";

let server;
let baseUrl;
let driver;
let driverToken;
let vehicleId;

before(async () => {
  await cleanupTestData();
  const app = buildApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });

  const { user } = await createTestUser({ email: "driver@example.com" });
  driver = user;
  driverToken = signToken(user.id);
});

after(async () => {
  await cleanupTestData();
  await closePool();
  await new Promise((resolve) => server.close(resolve));
});

describe("Vehicles", () => {
  describe("POST /", () => {
    it("creates a new vehicle", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vehicles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          make: "Toyota",
          model: "Camry",
          manufacturingYear: "2022",
          color: "Silver",
          bodyType: "Sedan",
          pictures: ["https://example.com/car.jpg"],
          seatingCapacity: 4,
          licensePlateNumber: "LAG-123-ABC",
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 201);
      assert.ok(body.id);
      assert.strictEqual(body.make, "Toyota");
      vehicleId = body.id;
    });

    it("returns 400 for missing fields", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vehicles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({ make: "Toyota" }),
      });

      assert.strictEqual(res.status, 400);
    });

    it("returns 401 without auth", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ make: "Toyota" }),
      });

      assert.strictEqual(res.status, 401);
    });
  });

  describe("GET /:id", () => {
    it("returns a vehicle by id", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vehicles/${vehicleId}`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.make, "Toyota");
      assert.strictEqual(body.model, "Camry");
    });

    it("returns 404 for non-existent vehicle", async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/vehicles/00000000-0000-0000-0000-000000000000`,
        { headers: { Authorization: `Bearer ${driverToken}` } },
      );

      assert.strictEqual(res.status, 404);
    });
  });

  describe("GET /mine", () => {
    it("returns the driver's vehicles", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vehicles/mine`, {
        headers: { Authorization: `Bearer ${driverToken}` },
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(body));
      assert.ok(body.length >= 1);
    });
  });

  describe("PATCH /:id", () => {
    it("updates a vehicle", async () => {
      const res = await fetch(`${baseUrl}/api/v1/vehicles/${vehicleId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({ color: "Black" }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.color, "Black");
    });
  });
});
