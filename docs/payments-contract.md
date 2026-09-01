# Payments Contract

How money moves through Jekalo: what the Paystack integration promises, how
the webhook is secured, and the invariants the ledger enforces. This is the
agreement other parts of the system (and the frontend) should code against.

## Money representation

- **All amounts are whole kobo** (NGN 1/100) end-to-end: database columns,
  API payloads and Paystack requests alike. There is no floating-point money
  anywhere.
- Money columns are `bigint` in the schema; the API serializers convert them
  to JSON `number` on the way out (`utils/serializers.js`) without changing
  their value.
- The **platform commission is a basis-points split** (`PLATFORM_FEE_BPS` in
  `utils/money.js`). `platformPercentage` / `platformFee` on a payment row are
  snapshotted at charge time so later commission changes never rewrite history.

## Charge purpose and linkage

- A `payment` row has exactly one `purpose` (`ride` or `rental`) and exactly
  one linkage column set (`rideBookingId` OR `rentalBookingId`) — enforced by
  the `payments_single_linkage` CHECK constraint (`db/schema.js`).
- Booking endpoints are the **only** path that creates payments. Amounts are
  computed server-side (`seats × price`, or `totalAmount` from the held
  dates). There is no standalone `initialize` endpoint; the frontend cannot
  influence an amount.

## Checkout lifecycle (booking → payment)

1. `POST /rides/{id}/bookings` or `POST /rentals/listings/{id}/bookings`
   creates a hold: a `ride_booking` (status `active`) or `rental_booking`
   (status `pending_payment`) that reserves seats/dates.
2. A `payment` row is created (`pending`) and Paystack `initialize` returns
   `authorizationUrl` / `accessCode`. The frontend redirects (or uses the
   access code inline) and Paystack sends the payer to `callbackUrl`.
3. The frontend then confirms with `GET /payments/verify/{reference}` — or
   waits for the webhook. Either path calls `settleCharge`, which is
   **idempotent**: a row lock serializes racing webhook + verify calls and a
   unique gateway reference makes a duplicate credit a no-op.

## Holds, expiry and the sweeper

- A hold prevents double-booking: rides via a partial unique index on
  (ride_id, passenger_id) where status = active; rentals via date-overlap
  checks.
- If the payer abandons checkout, an unpaid hold expires after
  `HOLD_EXPIRY_MINUTES` (env, capped at 10) and `services/holds.service.js`
  releases the seats/dates so they can be re-booked.
- Riders who abandon get a fresh hold by cancelling and booking again — there
  is no "resume checkout" endpoint.

## Webhook security

- `POST /payments/webhook` verifies the `x-paystack-signature` header: an
  **HMAC-SHA512 of the raw request body** signed with
  `PAYSTACK_SECRET_KEY`. The raw body is preserved by
  `express.json({ verify })` in `index.js` because the JSON parser would
  otherwise re-serialize the body and break the signature.
- Requests with a missing/invalid signature get `401` and are dropped. The
  handler always returns `200` to an acknowledged, valid webhook.
- Webhook event types handled: charge success, transfers, refunds and
  reversals. Reversals are recorded as ledger entries so a successful charge
  row is never mutated (append-only money movements).

## Driver settlement

- A driver must link a bank account (`POST /bank-accounts`), which stores a
  Paystack transfer recipient code.
- On `PATCH /rides/{id}/complete`, a Paystack transfer is initiated for each
  confirmed booking with a successful payment. Payouts are best-effort:
  an individual payout failure is logged and does not fail ride completion.
- Payout/refund movements land in `ledger_entries` (append-only) with a
  gateway reference that doubles as webhook idempotency.