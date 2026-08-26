import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { buildApp, createTestUser, signToken, cleanupTestData, closePool } from "./helpers.js";

let server;
let baseUrl;

before(async () => {
  await cleanupTestData();
  const app = buildApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await cleanupTestData();
  await closePool();
  await new Promise((resolve) => server.close(resolve));
});

describe("Users", () => {
  describe("POST /register", () => {
    it("registers a new user and returns 201", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phoneNumber: "08012345678",
          password: "Password1",
        }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 201);
      assert.ok(body.user);
      assert.strictEqual(body.user.email, "john@example.com");
      assert.ok(!body.user.passwordHash);
    });

    it("returns 409 for duplicate email", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Jane",
          lastName: "Doe",
          email: "john@example.com",
          phoneNumber: "08099999999",
          password: "Password1",
        }),
      });

      assert.strictEqual(res.status, 409);
    });

    it("returns 400 for invalid data", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: "A" }),
      });

      assert.strictEqual(res.status, 400);
    });
  });

  describe("POST /login", () => {
    it("logs in with valid email and returns an access token", async () => {
      const { user, password } = await createTestUser({
        email: "login@example.com",
      });

      const res = await fetch(`${baseUrl}/api/v1/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: user.email, password }),
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(body.accessToken);
      assert.strictEqual(body.tokenType, "Bearer");
      assert.strictEqual(body.user.email, "login@example.com");
    });

    it("returns 401 for wrong password", async () => {
      const { user } = await createTestUser({ email: "wrong@example.com" });

      const res = await fetch(`${baseUrl}/api/v1/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: user.email, password: "WrongPass1" }),
      });

      assert.strictEqual(res.status, 401);
    });
  });

  describe("GET /profile/me", () => {
    it("returns the authenticated user's profile", async () => {
      const { user } = await createTestUser({ email: "me@example.com" });
      const token = signToken(user.id);

      const res = await fetch(`${baseUrl}/api/v1/users/profile/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.user.email, "me@example.com");
      assert.ok(!body.user.passwordHash);
    });

    it("returns 401 without auth token", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/profile/me`);
      assert.strictEqual(res.status, 401);
    });
  });
});
