import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { buildApp, createTestUser, signToken, cleanupTestData, closePool } from "./helpers.js";

process.env.PAYSTACK_SECRET_KEY = "sk_test_jekalo-unit";

let server;
let baseUrl;
let user;
let userToken;
let otherToken;

const FAKE_BANK_CODE = "044";
const FAKE_ACCOUNT_NUMBER = "1234567890";
const FAKE_ACCOUNT_NAME = "John Doe";
const FAKE_RECIPIENT_CODE = "RCP_test123";

before(async () => {
  await cleanupTestData();
  const app = buildApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });

  const a = await createTestUser({ email: "bank-user@example.com" });
  user = a.user;
  userToken = signToken(user.id);
  const b = await createTestUser({ email: "bank-other@example.com" });
  otherToken = signToken(b.user.id);

  // Seed a bank so the bank lookup works
  const { pool } = await import("../db/index.js");
  await pool.query(`INSERT INTO banks (code, name) VALUES ('044', 'Access Bank') ON CONFLICT (code) DO NOTHING`);
});

after(async () => {
  await cleanupTestData();
  await closePool();
  await new Promise((resolve) => server.close(resolve));
});

function stubPaystack(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (!url.startsWith("https://api.paystack.co")) {
      return originalFetch(input, init);
    }
    const call = {
      url,
      method: (init.method || "GET").toUpperCase(),
      body: init.body ? JSON.parse(init.body) : null,
    };
    const result = handler(call) ?? {};
    return new Response(
      JSON.stringify(result.envelope ?? { status: true, message: "Approved", data: result.data ?? {} }),
      { status: result.httpStatus ?? 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

describe("Bank Accounts", () => {
  describe("GET /banks", () => {
    it("returns the list of seeded banks", async () => {
      const res = await fetch(`${baseUrl}/api/v1/bank-accounts/banks`, {
        headers: authHeaders(userToken),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(body));
      assert.ok(body.some((b) => b.code === "044"));
    });

    it("returns 401 without auth", async () => {
      const res = await fetch(`${baseUrl}/api/v1/bank-accounts/banks`);
      assert.strictEqual(res.status, 401);
    });
  });

  describe("POST /resolve", () => {
    it("resolves a valid account number", async () => {
      const restore = stubPaystack(() => ({
        data: { account_name: FAKE_ACCOUNT_NAME, account_number: FAKE_ACCOUNT_NUMBER, bank_id: 1 },
      }));

      const res = await fetch(`${baseUrl}/api/v1/bank-accounts/resolve`, {
        method: "POST",
        headers: authHeaders(userToken),
        body: JSON.stringify({ accountNumber: FAKE_ACCOUNT_NUMBER, bankCode: FAKE_BANK_CODE }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.accountName, FAKE_ACCOUNT_NAME);
      restore();
    });

    it("returns 502 on Paystack failure", async () => {
      const restore = stubPaystack(() => ({
        envelope: { status: false, message: "Invalid account" },
        httpStatus: 400,
      }));

      const res = await fetch(`${baseUrl}/api/v1/bank-accounts/resolve`, {
        method: "POST",
        headers: authHeaders(userToken),
        body: JSON.stringify({ accountNumber: "0000000000", bankCode: FAKE_BANK_CODE }),
      });
      assert.strictEqual(res.status, 502);
      restore();
    });

    it("returns 400 for invalid data", async () => {
      const res = await fetch(`${baseUrl}/api/v1/bank-accounts/resolve`, {
        method: "POST",
        headers: authHeaders(userToken),
        body: JSON.stringify({ accountNumber: "123", bankCode: "" }),
      });
      assert.strictEqual(res.status, 400);
    });
  });

  describe("POST /", () => {
    it("creates a bank account", async () => {
      const restore = stubPaystack((call) => {
        if (call.url.includes("/bank/resolve")) {
          return { data: { account_name: FAKE_ACCOUNT_NAME, account_number: FAKE_ACCOUNT_NUMBER, bank_id: 1 } };
        }
        if (call.url.includes("/transferrecipient")) {
          return { data: { recipient_code: FAKE_RECIPIENT_CODE, name: FAKE_ACCOUNT_NAME } };
        }
      });

      const res = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        method: "POST",
        headers: authHeaders(userToken),
        body: JSON.stringify({ accountNumber: FAKE_ACCOUNT_NUMBER, bankCode: FAKE_BANK_CODE }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 201);
      assert.strictEqual(body.accountName, FAKE_ACCOUNT_NAME);
      assert.strictEqual(body.bankCode, FAKE_BANK_CODE);
      assert.strictEqual(body.accountNumber, "******7890");
      restore();
    });

    it("returns 409 if user already has an account", async () => {
      const restore = stubPaystack((call) => {
        if (call.url.includes("/bank/resolve")) {
          return { data: { account_name: FAKE_ACCOUNT_NAME, account_number: FAKE_ACCOUNT_NUMBER, bank_id: 1 } };
        }
        if (call.url.includes("/transferrecipient")) {
          return { data: { recipient_code: "RCP_new", name: FAKE_ACCOUNT_NAME } };
        }
      });

      const res = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        method: "POST",
        headers: authHeaders(userToken),
        body: JSON.stringify({ accountNumber: "9999999999", bankCode: FAKE_BANK_CODE }),
      });
      assert.strictEqual(res.status, 409);
      restore();
    });
  });

  describe("GET /", () => {
    it("returns the user's bank account with masked number", async () => {
      const res = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        headers: authHeaders(userToken),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.accountNumber, "******7890");
      assert.strictEqual(body.bankCode, FAKE_BANK_CODE);
      assert.strictEqual(body.bankName, "Access Bank");
      assert.strictEqual(body.accountName, FAKE_ACCOUNT_NAME);
      assert.ok(body.id);
      assert.ok(body.createdAt);
    });

    it("returns 404 if no account exists", async () => {
      const res = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        headers: authHeaders(otherToken),
      });
      assert.strictEqual(res.status, 404);
    });
  });

  describe("PATCH /", () => {
    it("updates the bank account", async () => {
      const NEW_ACCOUNT = "0987654321";
      const NEW_RECIPIENT = "RCP_updated";

      const restore = stubPaystack((call) => {
        if (call.url.includes("/bank/resolve")) {
          return { data: { account_name: FAKE_ACCOUNT_NAME, account_number: NEW_ACCOUNT, bank_id: 1 } };
        }
        if (call.url.includes("/transferrecipient")) {
          return { data: { recipient_code: NEW_RECIPIENT, name: FAKE_ACCOUNT_NAME } };
        }
      });

      const res = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        method: "PATCH",
        headers: authHeaders(userToken),
        body: JSON.stringify({ accountNumber: NEW_ACCOUNT, bankCode: FAKE_BANK_CODE }),
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.accountNumber, "******4321");
      assert.strictEqual(body.bankCode, FAKE_BANK_CODE);
      restore();
    });

    it("returns 404 if no account exists", async () => {
      const res = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        method: "PATCH",
        headers: authHeaders(otherToken),
        body: JSON.stringify({ accountNumber: "1234567890", bankCode: FAKE_BANK_CODE }),
      });
      assert.strictEqual(res.status, 404);
    });

    it("returns 400 if only one field is provided", async () => {
      const res = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        method: "PATCH",
        headers: authHeaders(userToken),
        body: JSON.stringify({ accountNumber: "1234567890" }),
      });
      assert.strictEqual(res.status, 400);
    });
  });

  describe("DELETE /", () => {
    it("deletes the bank account", async () => {
      const res = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        method: "DELETE",
        headers: authHeaders(userToken),
      });
      assert.strictEqual(res.status, 204);

      // Confirm it's gone
      const check = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        headers: authHeaders(userToken),
      });
      assert.strictEqual(check.status, 404);
    });

    it("returns 404 if no account exists", async () => {
      const res = await fetch(`${baseUrl}/api/v1/bank-accounts`, {
        method: "DELETE",
        headers: authHeaders(userToken),
      });
      assert.strictEqual(res.status, 404);
    });
  });
});
