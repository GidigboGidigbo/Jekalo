import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { buildApp, createTestUser, signToken, cleanupTestData, closePool } from "./helpers.js";
import { db } from "../db/index.js";
import { rides as ridesTable, rentalListings, rideBookings, rentalBookings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getLedgerEntryByGatewayReference, listEntriesForPayment, getPlatformBalance, getLedgerEntryById } from "../db/ledger.repo.js";
import { getPaymentByReference, getHeldAmountForPayment } from "../db/payments.repo.js";
import { createPayout, createRefund } from "../services/payments.service.js";
import { expireStaleHolds } from "../services/holds.service.js";

const SECRET_KEY = "sk_test_jekalo-unit";
const TEST_CALLBACK_URL = "https://app.example.com/payments/callback";
process.env.PAYSTACK_SECRET_KEY = SECRET_KEY;

let server;
let baseUrl;
let renter;
let renterToken;
let otherToken;
let ownerToken;
let ownerVehicle;

// Ride pricing is chosen so the 1% platform fee stays whole kobo:
// 250_000 -> fee 2_500; 500_000 -> 5_000; 300_000 -> 3_000.
const RIDE_PRICE = 250_000;
const RENTAL_DAILY_RATE = 100_000; // 7-day booking -> 700_000 total

before(async () => {
  await cleanupTestData();
  const app = buildApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });

  const a = await createTestUser({ email: "pay-renter@example.com" });
  renter = a.user;
  renterToken = signToken(renter.id);
  const b = await createTestUser({ email: "pay-other@example.com" });
  otherToken = signToken(b.user.id);
  const c = await createTestUser({ email: "pay-owner@example.com" });
  ownerToken = signToken(c.user.id);

  const vehicleRes = await fetch(`${baseUrl}/api/v1/vehicles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({
      make: "Toyota",
      model: "Corolla",
      manufacturingYear: "2023",
      color: "White",
      bodyType: "Sedan",
      pictures: ["https://example.com/car.jpg"],
      seatingCapacity: 4,
      licensePlateNumber: `LAG-PAY-${Date.now()}`,
    }),
  });
  ownerVehicle = await vehicleRes.json();
  assert.strictEqual(vehicleRes.status, 201);
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

function signWebhook(rawBody) {
  return crypto.createHmac("sha512", SECRET_KEY).update(rawBody).digest("hex");
}

async function post(path, body, token) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function sendWebhook(payload) {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  return fetch(`${baseUrl}/api/v1/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": signWebhook(raw) },
    body: raw,
  });
}

async function withCheckoutStub(fn) {
  const restore = stubPaystack((call) => ({
    data: {
      authorization_url: `https://checkout.paystack.com/${call.body.reference}`,
      access_code: `access_${call.body.reference}`,
      reference: call.body.reference,
    },
  }));
  try {
    return await fn();
  } finally {
    restore();
  }
}

async function createRide({ price = RIDE_PRICE, capacity = 3 } = {}, token = ownerToken) {
  const res = await fetch(`${baseUrl}/api/v1/rides`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      vehicleId: ownerVehicle.id,
      availableSeatCapacity: capacity,
      fromAddress: "Ikeja, Lagos",
      fromLat: 6.6018,
      fromLong: 3.3515,
      toAddress: "VI, Lagos",
      toLat: 6.4281,
      toLong: 3.4219,
      price,
      pickupTime: "08:00",
      pickupDate: "2026-08-30",
    }),
  });
  const ride = await res.json();
  assert.strictEqual(res.status, 201);
  assert.strictEqual(ride.status, "PENDING");
  return ride;
}

/** Books seats on a ride (checkout stubbed) and returns the full response. */
async function bookRide(rideId, { seats = 1 } = {}, token = renterToken) {
  return withCheckoutStub(async () => {
    const res = await post(
      `/api/v1/rides/${rideId}/bookings`,
      { seats, callbackUrl: TEST_CALLBACK_URL },
      token,
    );
    const body = await res.json();
    return { res, body, reference: body.reference };
  });
}

let listingCounter = 0;

async function createRentalListing(token = ownerToken) {
  const vehicleRes = await fetch(`${baseUrl}/api/v1/vehicles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      make: "Honda",
      model: "Civic",
      manufacturingYear: "2022",
      color: "Black",
      bodyType: "Sedan",
      pictures: ["https://example.com/car.jpg"],
      seatingCapacity: 4,
      licensePlateNumber: `LAG-RENT-${Date.now()}-${listingCounter++}`,
    }),
  });
  const vehicle = await vehicleRes.json();
  assert.strictEqual(vehicleRes.status, 201);

  const listingRes = await fetch(`${baseUrl}/api/v1/rentals/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      vehicleId: vehicle.id,
      dailyRate: RENTAL_DAILY_RATE,
      securityDeposit: 500_000,
      pickupLocation: { type: "Point", coordinates: [3.3515, 6.6018] },
      startDateTime: "2026-09-01T00:00:00Z",
      endDateTime: "2026-10-01T00:00:00Z",
      minimumDays: 1,
    }),
  });
  const listing = await listingRes.json();
  assert.strictEqual(listingRes.status, 201);
  return listing;
}

/** Books dates on a rental listing (checkout stubbed) and returns the response. */
async function bookRental(listingId, token = renterToken) {
  return withCheckoutStub(async () => {
    const res = await post(
      `/api/v1/rentals/listings/${listingId}/bookings`,
      {
        startDateTime: "2026-09-05T00:00:00Z",
        endDateTime: "2026-09-12T00:00:00Z",
        callbackUrl: TEST_CALLBACK_URL,
      },
      token,
    );
    const body = await res.json();
    return { res, body, reference: body.reference };
  });
}

/** Charges an existing payment via a signed webhook. Payload mirrors Paystack's
 * snake_case wire format. */
async function chargeViaWebhook(reference, amountKobo) {
  const res = await sendWebhook({
    event: "charge.success",
    data: {
      reference,
      status: "success",
      amount: amountKobo,
      channel: "card",
      gateway_response: "Successful",
      paid_at: new Date().toISOString(),
    },
  });
  assert.strictEqual(res.status, 200);
}

async function getRideRow(rideId) {
  const [row] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  return row;
}

async function getListingRow(listingId) {
  const [row] = await db.select().from(rentalListings).where(eq(rentalListings.id, listingId)).limit(1);
  return row;
}

describe("Payments", () => {
  describe("ride book-and-pay", () => {
    it("requires authentication", async () => {
      const ride = await createRide();
      const res = await post(`/api/v1/rides/${ride.id}/bookings`, { callbackUrl: TEST_CALLBACK_URL }, null);
      assert.strictEqual(res.status, 401);
    });

    it("reserves seats and creates a pending payment in kobo with the fee snapshotted", async () => {
      const ride = await createRide();
      const { res, body, reference } = await bookRide(ride.id, { seats: 2 });

      assert.strictEqual(res.status, 201);
      assert.match(reference, /^JEKALO-/);
      assert.ok(body.authorizationUrl.includes("checkout.paystack.com"));
      assert.ok(body.accessCode);
      assert.strictEqual(body.callbackUrl, TEST_CALLBACK_URL);

      // Seats are held immediately.
      assert.strictEqual(body.seatsRemaining, 1);
      // Server-computed: price x seats. Clients cannot send amounts anymore.
      assert.strictEqual(body.totalPrice, RIDE_PRICE * 2);

      assert.strictEqual(body.payment.status, "pending");
      assert.strictEqual(body.payment.purpose, "ride");
      assert.strictEqual(body.payment.amount, RIDE_PRICE * 2);
      assert.strictEqual(body.payment.platformFee, (RIDE_PRICE * 2) / 100);
      assert.strictEqual(body.payment.platformPercentage, 1);
      assert.strictEqual(body.platformFeeBps, 100);

      const row = await getPaymentByReference(reference);
      assert.strictEqual(row.amount, RIDE_PRICE * 2);
      assert.strictEqual(row.platformFee, (RIDE_PRICE * 2) / 100);
      assert.strictEqual(row.rideBookingId, body.booking.id);
      assert.strictEqual(body.booking.status, "active");

      const fresh = await getRideRow(ride.id);
      assert.strictEqual(fresh.availableSeatCapacity, 1);
    });

    it("sends Paystack the server-computed kobo amount and payer email", async () => {
      let captured;
      const restore = stubPaystack((call) => {
        captured = call.body;
        return { data: { authorization_url: "u", access_code: "a", reference: call.body.reference } };
      });
      try {
        const ride = await createRide();
        // A malicious client may still send an amount field — it is ignored.
        await post(
          `/api/v1/rides/${ride.id}/bookings`,
          { seats: 1, amount: 1, callbackUrl: TEST_CALLBACK_URL },
          renterToken,
        );
        assert.strictEqual(captured.amount, RIDE_PRICE);
        assert.strictEqual(captured.currency, "NGN");
        assert.strictEqual(captured.email, renter.email);
        assert.strictEqual(captured.callback_url, TEST_CALLBACK_URL);
      } finally {
        restore();
      }
    });

    it("requires the frontend callback url", async () => {
      const ride = await createRide();
      const missing = await post(
        `/api/v1/rides/${ride.id}/bookings`,
        { seats: 1 },
        renterToken,
      );
      assert.strictEqual(missing.status, 400);
      const body = await missing.json();
      assert.strictEqual(body.error.code, "VALIDATION_FAILED");
    });

    it("rejects bookings that exceed remaining seats without holding anything", async () => {
      const ride = await createRide({ capacity: 2 });
      const res = await bookRide(ride.id, { seats: 3 });
      assert.strictEqual(res.res.status, 422);
      const row = await getRideRow(ride.id);
      assert.strictEqual(row.availableSeatCapacity, 2);
    });

    it("returns 409 for a second active hold on the same ride", async () => {
      const ride = await createRide();
      const first = await bookRide(ride.id);
      assert.strictEqual(first.res.status, 201);

      const second = await bookRide(ride.id);
      assert.strictEqual(second.res.status, 409);
      assert.strictEqual(second.body.error.code, "STATE_CONFLICT");
    });

    it("returns 502 when Paystack fails and compensates by releasing the seats", async () => {
      const ride = await createRide({ capacity: 1 });
      const restore = stubPaystack(() => ({
        httpStatus: 400,
        envelope: { status: false, message: "Amount too small" },
      }));
      try {
        const res = await post(
          `/api/v1/rides/${ride.id}/bookings`,
          { seats: 1, callbackUrl: TEST_CALLBACK_URL },
          renterToken,
        );
        const body = await res.json();
        assert.strictEqual(res.status, 502);
        assert.strictEqual(body.error.code, "GATEWAY_ERROR");
      } finally {
        restore();
      }

      // The just-created hold was compensated away: seats are back and no
      // active booking remains.
      const fresh = await getRideRow(ride.id);
      assert.strictEqual(fresh.availableSeatCapacity, 1);
    });
  });

  describe("hold expiry sweeper", () => {
    it("expires unpaid holds past the cutoff and restores their seats", async () => {
      const ride = await createRide({ capacity: 2 });
      const booked = await bookRide(ride.id);
      assert.strictEqual(booked.res.status, 201);

      // now + HOLD_EXPIRY_MINUTES puts the hold past its cutoff.
      // now + 15min clears the cutoff for any HOLD_EXPIRY_MINUTES (max 10).
      const future = new Date(Date.now() + 15 * 60_000);
      const { ridesReleased } = await expireStaleHolds({ now: future });

      const released = ridesReleased.find((b) => b.id === booked.body.booking.id);
      assert.ok(released);
      assert.strictEqual(released.status, "expired");
      const fresh = await getRideRow(ride.id);
      assert.strictEqual(fresh.availableSeatCapacity, 2);
    });

    it("leaves paid holds alone during a sweep", async () => {
      const ride = await createRide({ capacity: 2 });
      const booked = await bookRide(ride.id);
      await chargeViaWebhook(booked.reference, RIDE_PRICE);

      // now + 15min clears the cutoff for any HOLD_EXPIRY_MINUTES (max 10).
      const future = new Date(Date.now() + 15 * 60_000);
      const { ridesReleased } = await expireStaleHolds({ now: future });
      assert.strictEqual(ridesReleased.find((b) => b.id === booked.body.booking.id), undefined);

      const row = await getPaymentByReference(booked.reference);
      assert.strictEqual(row.status, "success");
    });

    it("lets a passenger re-book after their hold expired or was cancelled", async () => {
      const ride = await createRide({ capacity: 2 });

      const expiredHold = await bookRide(ride.id);
      await expireStaleHolds({ now: new Date(Date.now() + 15 * 60_000) });

      const rebooked = await bookRide(ride.id);
      assert.strictEqual(rebooked.res.status, 201);

      // Cancel, then re-book once more: only *active* holds conflict.
      const cancelRes = await fetch(`${baseUrl}/api/v1/rides/${ride.id}/bookings/mine`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${renterToken}` },
      });
      assert.strictEqual(cancelRes.status, 204);
      const again = await bookRide(ride.id);
      assert.strictEqual(again.res.status, 201);

      const fresh = await getRideRow(ride.id);
      // 1 seat consumed by the single active hold.
      assert.strictEqual(fresh.availableSeatCapacity, 1);
    });

    it("gives value on late payment: an expired hold recovers when seats are free", async () => {
      const ride = await createRide({ capacity: 2 });
      const booked = await bookRide(ride.id);
      await expireStaleHolds({ now: new Date(Date.now() + 15 * 60_000) });

      const [bookingRow] = await db
        .select()
        .from(rideBookings)
        .where(eq(rideBookings.id, booked.body.booking.id));
      assert.strictEqual(bookingRow.status, "expired");

      // The rider pays anyway (e.g. the webhook arrives after expiry).
      await chargeViaWebhook(booked.reference, RIDE_PRICE);

      const [recovered] = await db
        .select()
        .from(rideBookings)
        .where(eq(rideBookings.id, booked.body.booking.id));
      assert.strictEqual(recovered.status, "confirmed");

      // The recovered seats are consumed again.
      const fresh = await getRideRow(ride.id);
      assert.strictEqual(fresh.availableSeatCapacity, 1);
    });

    it("refunds late payments whose seats were taken while the hold was expired", async () => {
      const ride = await createRide({ capacity: 1 });

      const first = await bookRide(ride.id); // renter's hold, later expires
      await expireStaleHolds({ now: new Date(Date.now() + 15 * 60_000) });

      // Someone else takes the last seat before the first rider pays.
      const second = await bookRide(ride.id, {}, otherToken);
      assert.strictEqual(second.res.status, 201);

      // First rider's webhook lands late — no seats left to give.
      const refundRef = `RFN-${crypto.randomUUID()}`;
      const restore = stubPaystack((call) => {
        assert.strictEqual(call.url.endsWith("/refund"), true);
        return { data: { reference: refundRef, status: "pending" } };
      });
      try {
        await chargeViaWebhook(first.reference, RIDE_PRICE);
      } finally {
        restore();
      }

      const [stillExpired] = await db
        .select()
        .from(rideBookings)
        .where(eq(rideBookings.id, first.body.booking.id));
      assert.strictEqual(stillExpired.status, "expired");

      const payment = await getPaymentByReference(first.reference);
      assert.strictEqual(payment.status, "success"); // charge settled...
      const entries = await listEntriesForPayment(payment.id);
      const refundEntry = entries.find((e) => e.gatewayReference === refundRef);
      assert.ok(refundEntry); // ...and was auto-refunded in full
      assert.strictEqual(refundEntry.entryType, "refund");
      assert.strictEqual(refundEntry.amount, RIDE_PRICE);
    });

    it("refunds late payments on cancelled holds instead of resurrecting them", async () => {
      const ride = await createRide({ capacity: 2 });
      const booked = await bookRide(ride.id);

      const cancelRes = await fetch(`${baseUrl}/api/v1/rides/${ride.id}/bookings/mine`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${renterToken}` },
      });
      assert.strictEqual(cancelRes.status, 204);

      const refundRef = `RFN-${crypto.randomUUID()}`;
      const restore = stubPaystack((call) => {
        assert.strictEqual(call.url.endsWith("/refund"), true);
        return { data: { reference: refundRef, status: "pending" } };
      });
      try {
        await chargeViaWebhook(booked.reference, RIDE_PRICE);
      } finally {
        restore();
      }

      const [row] = await db
        .select()
        .from(rideBookings)
        .where(eq(rideBookings.id, booked.body.booking.id));
      assert.strictEqual(row.status, "cancelled");

      const payment = await getPaymentByReference(booked.reference);
      const entries = await listEntriesForPayment(payment.id);
      assert.ok(entries.find((e) => e.gatewayReference === refundRef));
    });
  });

  describe("rental book-and-pay", () => {
    it("creates a pending_payment hold without flipping the listing to rented", async () => {
      const listing = await createRentalListing();
      const { res, body, reference } = await bookRental(listing.id);

      assert.strictEqual(res.status, 201);
      assert.match(reference, /^JEKALO-/);
      assert.strictEqual(body.callbackUrl, TEST_CALLBACK_URL);

      // Server-computed: dailyRate x days (Sep 05 - Sep 12 = 7 days).
      assert.strictEqual(body.booking.totalAmount, RENTAL_DAILY_RATE * 7);
      assert.strictEqual(body.booking.status, "pending_payment");

      assert.strictEqual(body.payment.purpose, "rental");
      assert.strictEqual(body.payment.rentalBookingId, body.booking.id);
      assert.strictEqual(body.payment.platformFee, (RENTAL_DAILY_RATE * 7) / 100);

      // The listing keeps accepting holds until money actually settles.
      const row = await getListingRow(listing.id);
      assert.strictEqual(row.status, "pending");
    });

    it("blocks owners from booking their own listing", async () => {
      const listing = await createRentalListing();
      const res = await bookRental(listing.id, ownerToken);
      assert.strictEqual(res.res.status, 422);
      assert.strictEqual(res.body.error.code, "BUSINESS_RULE_VIOLATION");
    });

    it("treats pending_payment holds as date conflicts (409)", async () => {
      const listing = await createRentalListing();
      const first = await bookRental(listing.id);
      assert.strictEqual(first.res.status, 201);

      const second = await bookRental(listing.id, otherToken);
      assert.strictEqual(second.res.status, 409);
      assert.strictEqual(second.body.error.code, "STATE_CONFLICT");
    });

    it("confirms the booking and flips the listing to rented on settlement", async () => {
      const listing = await createRentalListing();
      const booked = await bookRental(listing.id);
      await chargeViaWebhook(booked.reference, RENTAL_DAILY_RATE * 7);

      const payment = await getPaymentByReference(booked.reference);
      assert.strictEqual(payment.status, "success");

      const [bookingRow] = await db
        .select()
        .from(rentalBookings)
        .where(eq(rentalBookings.id, booked.body.booking.id));
      assert.strictEqual(bookingRow.status, "confirmed");

      const row = await getListingRow(listing.id);
      assert.strictEqual(row.status, "rented");
    });

    it("frees dates of expired unpaid holds for re-booking", async () => {
      const listing = await createRentalListing();
      const first = await bookRental(listing.id);
      await expireStaleHolds({ now: new Date(Date.now() + 15 * 60_000) });

      const rebooked = await bookRental(listing.id);
      assert.strictEqual(rebooked.res.status, 201);

      const payment = await getPaymentByReference(first.reference);
      assert.strictEqual(payment.status, "pending"); // never charged
    });

    it("recovers an expired hold when its dates are still free", async () => {
      const listing = await createRentalListing();
      const booked = await bookRental(listing.id);
      await expireStaleHolds({ now: new Date(Date.now() + 15 * 60_000) });

      await chargeViaWebhook(booked.reference, RENTAL_DAILY_RATE * 7);

      const [bookingRow] = await db
        .select()
        .from(rentalBookings)
        .where(eq(rentalBookings.id, booked.body.booking.id));
      assert.strictEqual(bookingRow.status, "confirmed");
      const row = await getListingRow(listing.id);
      assert.strictEqual(row.status, "rented");
    });

    it("refunds a late payment when another hold took the dates", async () => {
      const listing = await createRentalListing();

      const first = await bookRental(listing.id); // expires below
      await expireStaleHolds({ now: new Date(Date.now() + 15 * 60_000) });

      const second = await bookRental(listing.id, otherToken);
      assert.strictEqual(second.res.status, 201);

      const refundRef = `RFN-${crypto.randomUUID()}`;
      const restore = stubPaystack((call) => {
        assert.strictEqual(call.url.endsWith("/refund"), true);
        return { data: { reference: refundRef, status: "pending" } };
      });
      try {
        await chargeViaWebhook(first.reference, RENTAL_DAILY_RATE * 7);
      } finally {
        restore();
      }

      const [firstRow] = await db
        .select()
        .from(rentalBookings)
        .where(eq(rentalBookings.id, first.body.booking.id));
      assert.strictEqual(firstRow.status, "expired");

      const payment = await getPaymentByReference(first.reference);
      const entries = await listEntriesForPayment(payment.id);
      const refundEntry = entries.find((e) => e.gatewayReference === refundRef);
      assert.ok(refundEntry);
      assert.strictEqual(refundEntry.amount, RENTAL_DAILY_RATE * 7);

      // The winning hold is untouched.
      const [secondRow] = await db
        .select()
        .from(rentalBookings)
        .where(eq(rentalBookings.id, second.body.booking.id));
      assert.strictEqual(secondRow.status, "pending_payment");
    });
  });

  describe("GET /verify/:reference", () => {
    it("closes out a successful charge, confirms the booking, records exactly one credit entry", async () => {
      const ride = await createRide();
      const booked = await bookRide(ride.id);

      const restore = stubPaystack(() => ({
        data: {
          status: "success",
          reference: booked.reference,
          amount: RIDE_PRICE,
          channel: "bank_transfer",
          gateway_response: "Successful",
          paid_at: "2026-08-23T10:00:00.000Z",
        },
      }));
      try {
        const res = await fetch(`${baseUrl}/api/v1/payments/verify/${booked.reference}`, {
          headers: { Authorization: `Bearer ${renterToken}` },
        });
        const body = await res.json();
        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.status, "success");
        assert.strictEqual(body.channel, "bank_transfer");
        assert.strictEqual(body.amount, RIDE_PRICE);

        const credit = await getLedgerEntryByGatewayReference(booked.reference);
        assert.ok(credit);
        assert.strictEqual(credit.entryType, "charge");
        assert.strictEqual(credit.direction, "credit");
        assert.strictEqual(credit.amount, RIDE_PRICE);
        assert.strictEqual(await getHeldAmountForPayment(credit.paymentId), RIDE_PRICE);

        // Verify settles the booking too.
        const [bookingRow] = await db
          .select()
          .from(rideBookings)
          .where(eq(rideBookings.id, booked.body.booking.id));
        assert.strictEqual(bookingRow.status, "confirmed");

        // Re-verify must not duplicate the credit entry.
        const again = await fetch(`${baseUrl}/api/v1/payments/verify/${booked.reference}`, {
          headers: { Authorization: `Bearer ${renterToken}` },
        });
        assert.strictEqual(again.status, 200);
        const entries = await listEntriesForPayment(credit.paymentId);
        assert.strictEqual(entries.filter((e) => e.entryType === "charge").length, 1);
      } finally {
        restore();
      }
    });

    it("returns 404 for another user's payment or unknown references", async () => {
      const ride = await createRide();
      const booked = await bookRide(ride.id);
      const wrongOwner = await fetch(`${baseUrl}/api/v1/payments/verify/${booked.reference}`, {
        headers: { Authorization: `Bearer ${otherToken}` },
      });
      assert.strictEqual(wrongOwner.status, 404);

      const missing = await fetch(`${baseUrl}/api/v1/payments/verify/JEKALO-does-not-exist`, {
        headers: { Authorization: `Bearer ${renterToken}` },
      });
      assert.strictEqual(missing.status, 404);
    });
  });

  describe("POST /webhook", () => {
    it("rejects unsigned or tampered payloads", async () => {
      const raw = JSON.stringify({ event: "charge.success", data: {} });

      const unsigned = await fetch(`${baseUrl}/api/v1/payments/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw,
      });
      assert.strictEqual(unsigned.status, 401);

      const tampered = await fetch(`${baseUrl}/api/v1/payments/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-paystack-signature": "deadbeef" },
        body: raw,
      });
      assert.strictEqual(tampered.status, 401);
    });

    it("marks a charge successful exactly once across replays", async () => {
      const ride = await createRide();
      const booked = await bookRide(ride.id);
      const raw = JSON.stringify({
        event: "charge.success",
        data: {
          reference: booked.reference,
          status: "success",
          amount: RIDE_PRICE,
          channel: "ussd",
          gateway_response: "Successful",
          paid_at: "2026-08-23T11:30:00.000Z",
        },
      });

      for (let i = 0; i < 2; i++) {
        const res = await sendWebhook(raw);
        assert.strictEqual(res.status, 200);
      }

      const row = await getPaymentByReference(booked.reference);
      assert.strictEqual(row.status, "success");
      assert.strictEqual(row.channel, "ussd");
      const entries = await listEntriesForPayment(row.id);
      assert.strictEqual(entries.filter((e) => e.entryType === "charge").length, 1);
    });

    it("settles a charge exactly once under concurrent webhook + verify", async () => {
      const ride = await createRide();
      const booked = await bookRide(ride.id);

      const gatewayData = {
        status: "success",
        reference: booked.reference,
        amount: RIDE_PRICE,
        channel: "card",
        gateway_response: "Successful",
        paid_at: "2026-08-23T12:00:00.000Z",
      };
      const restore = stubPaystack(() => ({ data: gatewayData }));
      try {
        // Fire both settlement paths at the same time; only one credit entry
        // may survive.
        const [verifyRes, webhookRes] = await Promise.all([
          fetch(`${baseUrl}/api/v1/payments/verify/${booked.reference}`, {
            headers: { Authorization: `Bearer ${renterToken}` },
          }),
          sendWebhook({ event: "charge.success", data: gatewayData }),
        ]);
        assert.strictEqual(verifyRes.status, 200);
        assert.strictEqual(webhookRes.status, 200);

        const row = await getPaymentByReference(booked.reference);
        assert.strictEqual(row.status, "success");
        assert.strictEqual(await getHeldAmountForPayment(row.id), RIDE_PRICE);

        const entries = await listEntriesForPayment(row.id);
        assert.strictEqual(entries.filter((e) => e.entryType === "charge").length, 1);

        // Both settlement paths confirm the same booking exactly once.
        const [bookingRow] = await db
          .select()
          .from(rideBookings)
          .where(eq(rideBookings.id, booked.body.booking.id));
        assert.strictEqual(bookingRow.status, "confirmed");
      } finally {
        restore();
      }
    });

    it("ignores events for unknown references and non-terminal states", async () => {
      const res = await sendWebhook({ event: "charge.success", data: { reference: "JEKALO-unknown", status: "success" } });
      assert.strictEqual(res.status, 200);

      const ongoing = await sendWebhook({ event: "charge.success", data: { reference: "JEKALO-whatever", status: "ongoing" } });
      assert.strictEqual(ongoing.status, 200);
    });
  });

  describe("payouts and refunds (ledger flows)", () => {
    it("pays out held funds minus the platform fee and resolves via transfer webhooks", async () => {
      const ride = await createRide({ price: 500_000 });
      const booked = await bookRide(ride.id);
      await chargeViaWebhook(booked.reference, 500_000);
      const payment = await getPaymentByReference(booked.reference);

      const balanceBeforePayout = await getPlatformBalance();

      let capturedTransferRef;
      const restore = stubPaystack((call) => {
        assert.strictEqual(call.url.endsWith("/transfer"), true);
        // Payout = 500000 kobo minus 1% fee (5000 kobo).
        assert.strictEqual(call.body.amount, 495_000);
        assert.strictEqual(call.body.recipient, "RCP_test_driver");
        capturedTransferRef = call.body.reference;
        return { data: { transfer_reference: capturedTransferRef, status: "pending" } };
      });
      let entryId;
      try {
        const result = await createPayout({ paymentId: payment.id, recipientCode: "RCP_test_driver" });
        assert.strictEqual(result.reason, undefined);
        entryId = result.entry.id;
        assert.strictEqual(await getHeldAmountForPayment(payment.id), 5_000); // fee still ours

        // Pending debits are reserved against the platform balance.
        assert.strictEqual(await getPlatformBalance(), balanceBeforePayout - 495_000);
      } finally {
        restore();
      }

      const res = await sendWebhook({
        event: "transfer.success",
        data: { reference: capturedTransferRef, amount: 495_000, gateway_response: "Approved" },
      });
      assert.strictEqual(res.status, 200);

      const resolved = await getLedgerEntryById(entryId);
      assert.strictEqual(resolved.status, "success");
      assert.ok(resolved.completedAt);
      // Resolution itself doesn't change the balance.
      assert.strictEqual(await getPlatformBalance(), balanceBeforePayout - 495_000);
    });

    it("marks a pending payout failed on reversal and releases reserved funds", async () => {
      const ride = await createRide({ price: 300_000 });
      const booked = await bookRide(ride.id);
      await chargeViaWebhook(booked.reference, 300_000);
      const payment = await getPaymentByReference(booked.reference);

      let capturedTransferRef;
      const restore = stubPaystack((call) => {
        capturedTransferRef = call.body.reference;
        return { data: { transfer_reference: capturedTransferRef, status: "pending" } };
      });
      let entryId;
      try {
        const result = await createPayout({ paymentId: payment.id, recipientCode: "RCP_test_driver" });
        entryId = result.entry.id;
      } finally {
        restore();
      }

      const balanceAfterDebit = await getPlatformBalance();
      const res = await sendWebhook({
        event: "transfer.reversed",
        data: { reference: capturedTransferRef, gateway_response: "Recipient account unreachable" },
      });
      assert.strictEqual(res.status, 200);

      // Pending payout bounced: reservation lifts automatically (no extra
      // reversal credit — that is only for payouts that had already succeeded).
      const bounced = await getLedgerEntryById(entryId);
      assert.strictEqual(bounced.status, "failed");

      assert.strictEqual(await getHeldAmountForPayment(payment.id), 300_000);
      assert.strictEqual(await getPlatformBalance(), balanceAfterDebit + 297_000);

      const entries = await listEntriesForPayment(payment.id);
      assert.strictEqual(entries.some((e) => e.entryType === "reversal"), false);
    });

    it("records refunds as separate debit entries without mutating the charge row", async () => {
      const ride = await createRide();
      const booked = await bookRide(ride.id);
      await chargeViaWebhook(booked.reference, RIDE_PRICE);

      const refundRef = `RFN-${crypto.randomUUID()}`;
      const restore = stubPaystack((call) => {
        assert.strictEqual(call.url.endsWith("/refund"), true);
        assert.strictEqual(call.body.transaction, booked.reference);
        return { data: { reference: refundRef, status: "pending" } };
      });
      let result;
      try {
        result = await createRefund({ reference: booked.reference, userId: renter.id });
        assert.strictEqual(result.reason, undefined);
      } finally {
        restore();
      }

      // Not-yet-processed refunds reduce held funds immediately (reserved).
      const payment = await getPaymentByReference(booked.reference);
      assert.strictEqual(await getHeldAmountForPayment(payment.id), 0);

      await sendWebhook({
        event: "refund.processed",
        data: { reference: refundRef, refund_status: "processed" },
      });

      // Charge row keeps its status — refunds live only in the ledger.
      assert.strictEqual(payment.status, "success");
      const fresh = await getPaymentByReference(booked.reference);
      assert.strictEqual(fresh.status, "success");

      const entries = await listEntriesForPayment(fresh.id);
      const refundEntry = entries.find((e) => e.gatewayReference === refundRef);
      assert.strictEqual(refundEntry.entryType, "refund");
      assert.strictEqual(refundEntry.direction, "debit");
      assert.strictEqual(refundEntry.amount, RIDE_PRICE);
      assert.strictEqual(refundEntry.status, "success");
    });

    it("refuses refunds on unsuccessful payments", async () => {
      const ride = await createRide();
      const booked = await bookRide(ride.id); // stays pending
      const result = await createRefund({ reference: booked.reference, userId: renter.id });
      assert.strictEqual(result.reason, "NOT_SUCCESSFUL");
    });
  });

  describe("GET /", () => {
    it("lists the caller's payments with kobo amounts", async () => {
      const ride = await createRide();
      const booked = await bookRide(ride.id);
      const res = await fetch(`${baseUrl}/api/v1/payments`, {
        headers: { Authorization: `Bearer ${renterToken}` },
      });
      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(body));
      const mine = body.find((p) => p.reference === booked.reference);
      assert.ok(mine);
      assert.strictEqual(mine.amount, RIDE_PRICE);
      assert.strictEqual(mine.platformFee, 2_500);
    });
  });
});
