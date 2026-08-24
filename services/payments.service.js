import crypto from "node:crypto";
import { PLATFORM_FEE_BPS, computePlatformFee } from "../utils/money.js";
import {
  createPendingPayment,
  getPaymentById,
  getPaymentByReference,
  settleCharge,
} from "../db/payments.repo.js";
import {
  insertLedgerEntry,
  getLedgerEntryByGatewayReference,
  updateLedgerEntryStatus,
  applyTransferReversal,
} from "../db/ledger.repo.js";
import { confirmRideBooking, recoverRideBookingSeats } from "../db/ride_bookings.repo.js";
import { confirmRentalBooking, recoverRentalBookingDates } from "../db/rental_bookings.repo.js";
import {
  PAYMENT_STATUS,
  PAYMENT_PURPOSE,
  LEDGER_ENTRY_TYPE,
  LEDGER_ENTRY_DIRECTION,
  LEDGER_ENTRY_STATUS,
} from "../db/schema.js";

const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

// Platform commission snapshot stored on every payment (percent, e.g. 1.00).
export const PLATFORM_FEE_PERCENTAGE = PLATFORM_FEE_BPS / 100;

export class PaystackError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "PaystackError";
    this.status = status;
    this.body = body;
  }
}

function requireSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not set. Copy .env.example to .env and fill it in.",
    );
  }
  return secretKey;
}

async function paystackRequest(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${requireSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new PaystackError(`Could not reach Paystack: ${err.message}`);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body — fall through to the generic error below.
  }

  if (!response.ok || !payload?.status) {
    throw new PaystackError(payload?.message || `Paystack request failed with status ${response.status}.`, {
      status: response.status,
      body: payload,
    });
  }
  return payload.data;
}

export function generateReference(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Maps a Paystack transaction status to a local one. Returns null for
// non-terminal statuses ("ongoing", "queued") so callers leave the stored
// status untouched. Gateway-side "reversed" is ignored here: reversals are
// money movements and belong in the ledger, not on the charge row.
function mapGatewayStatus(gatewayStatus) {
  switch (gatewayStatus) {
    case "success":
      return PAYMENT_STATUS.SUCCESS;
    case "failed":
      return PAYMENT_STATUS.FAILED;
    case "abandoned":
      return PAYMENT_STATUS.ABANDONED;
    default:
      return null;
  }
}

/**
 * Creates a pending payment row (with the platform fee snapshotted) and asks
 * Paystack for a checkout session. `amount` is in kobo.
 * Returns { payment, authorizationUrl, accessCode, reference, callbackUrl }.
 */
export async function initializePayment({
  userId,
  email,
  amount,
  purpose,
  rentalBookingId,
  rideBookingId,
  callbackUrl,
  metadata,
}) {
  if (![PAYMENT_PURPOSE.RIDE, PAYMENT_PURPOSE.RENTAL].includes(purpose)) {
    throw new Error("A payment purpose of 'ride' or 'rental' is required.");
  }

  const reference = generateReference(`JEKALO-${purpose.toUpperCase()}`);
  const payment = await createPendingPayment({
    userId,
    purpose,
    rentalBookingId,
    rideBookingId,
    reference,
    amountKobo: amount,
    platformFeeKobo: computePlatformFee(amount),
    platformPercentage: PLATFORM_FEE_PERCENTAGE,
  });

  const data = await paystackRequest("/transaction/initialize", {
    method: "POST",
    body: {
      email,
      amount,
      reference,
      currency: "NGN",
      callback_url: callbackUrl,
      metadata: {
        ...metadata,
        userId: userId,
        purpose,
        rentalBookingId: rentalBookingId,
        rideBookingId: rideBookingId,
      },
    },
  });

  return {
    payment,
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference ?? reference,
    callbackUrl: callbackUrl,
  };
}

// Normalizes Paystack's snake_case charge payload into the fields
// settleCharge persists. Non-terminal gateway statuses map to null.
function chargeUpdateFields(gatewayData) {
  return {
    status: mapGatewayStatus(gatewayData.status),
    channel: gatewayData.channel ?? null,
    gatewayResponse: gatewayData.gateway_response ?? null,
    paidAt: gatewayData.paid_at ? new Date(gatewayData.paid_at) : null,
  };
}

/**
 * Re-checks a payment against Paystack and persists the result. Only the
 * owner's row is updated; returns null when no such payment exists.
 */
export async function verifyPayment(reference, userId) {
  const payment = await getPaymentByReference(reference);
  if (!payment || payment.userId !== userId) return null;

  const data = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);

  const settled = await settleCharge(payment.reference, chargeUpdateFields(data));
  await reconcileBookingWithPayment(settled);
  return settled;
}

/**
 * After a charge settles we make its booking valuable:
 *   - active/pending_payment hold → confirmed (seats/dates are theirs)
 *   - hold expired meanwhile      → try to give value: re-give exactly what
 *     was paid for if the seats/dates are still available
 *   - cancelled or gone           → full automatic refund (intent was reversed)
 * Reconciliation failures are logged, never thrown into webhook processing —
 * money state is already correct at this point.
 */
async function reconcileBookingWithPayment(payment) {
  if (!payment || payment.status !== PAYMENT_STATUS.SUCCESS) return;

  try {
    if (payment.purpose === PAYMENT_PURPOSE.RIDE && payment.rideBookingId) {
      if (await confirmRideBooking(payment.rideBookingId)) return;
      if ((await recoverRideBookingSeats(payment.rideBookingId)).recovered) return;
    } else if (payment.purpose === PAYMENT_PURPOSE.RENTAL && payment.rentalBookingId) {
      if (await confirmRentalBooking(payment.rentalBookingId)) return;
      if ((await recoverRentalBookingDates(payment.rentalBookingId)).recovered) return;
    }
    // No bookable hold survived to receive this payment — refund in full.
    const refund = await createRefund({ reference: payment.reference });
    if (refund.reason) {
      console.error(
        `Could not auto-refund unfulfilled payment ${payment.reference}: ${refund.reason}`,
      );
    }
  } catch (err) {
    console.error(`Booking reconciliation failed for payment ${payment.reference}:`, err);
  }
}

/**
 * Validates the x-paystack-signature header (HMAC-SHA512 of the raw request
 * body with the secret key). `raw_body` must be the untouched Buffer.
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (!rawBody || !signature) return false;
  const expected = crypto
    .createHmac("sha512", requireSecretKey())
    .update(rawBody)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");
  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

/**
 * Applies a webhook event to payments and/or ledger entries:
 *   charge.success                      → close out the charge (+ credit entry)
 *   transfer.success/failed/reversed    → resolve the payout debit entry
 *   refund.processed/failed             → resolve the refund debit entry
 * Every branch is idempotent; unknown events are acknowledged unhandled.
 */
export async function processWebhookEvent(event) {
  switch (event?.event) {
    case "charge.success":
      return handleChargeSuccess(event.data);
    case "transfer.success":
    case "transfer.failed":
    case "transfer.reversed":
      return handleTransferEvent(event.event, event.data);
    case "refund.processed":
    case "refund.failed":
      return handleRefundEvent(event.event, event.data);
    default:
      return { handled: false };
  }
}

async function handleChargeSuccess(data) {
  if (data?.status !== "success" || !data.reference) return { handled: false };

  const payment = await getPaymentByReference(data.reference);
  if (!payment) return { handled: false };

  // Cheap read-only fast path so replayed webhooks don't open a transaction.
  const existing = await getLedgerEntryByGatewayReference(payment.reference);
  if (payment.status === PAYMENT_STATUS.SUCCESS || existing) {
    return { handled: true, idempotent: true };
  }

  const settled = await settleCharge(payment.reference, chargeUpdateFields(data));
  await reconcileBookingWithPayment(settled);
  return { handled: true };
}

async function handleTransferEvent(eventName, data) {
  // We supply the transfer reference at creation time, so webhooks always
  // carry it back to us.
  const entry = await getLedgerEntryByGatewayReference(data?.reference);
  if (!entry) return { handled: false };

  if (eventName === "transfer.success") {
    if (entry.status === LEDGER_ENTRY_STATUS.SUCCESS) return { handled: true, idempotent: true };
    await updateLedgerEntryStatus(entry.id, {
      status: LEDGER_ENTRY_STATUS.SUCCESS,
      gatewayResponse: data.gateway_response ?? null,
    });
    return { handled: true };
  }

  if (eventName === "transfer.failed") {
    if (entry.status !== LEDGER_ENTRY_STATUS.PENDING) return { handled: true, idempotent: true };
    await updateLedgerEntryStatus(entry.id, {
      status: LEDGER_ENTRY_STATUS.FAILED,
      gatewayResponse: data.gateway_response ?? null,
    });
    return { handled: true };
  }

  // transfer.reversed: the payout bounced back to us.
  // - Pending payout → funds were only reserved; mark failed, reservation lifts.
  // - Already-successful payout → money genuinely left earlier; append a
  //   reversal credit so the books reflect its return.
  await applyTransferReversal(entry, {
    gatewayResponse: `reversed: ${data.gateway_response ?? ""}`.trim(),
    reversalReference: data.reversal_reference ?? null,
  });
  return { handled: true };
}

async function handleRefundEvent(eventName, data) {
  const entry = await getLedgerEntryByGatewayReference(data?.reference);
  if (!entry) return { handled: false };

  const status = eventName === "refund.processed" ? LEDGER_ENTRY_STATUS.SUCCESS : LEDGER_ENTRY_STATUS.FAILED;
  if (entry.status === status) return { handled: true, idempotent: true };

  await updateLedgerEntryStatus(entry.id, {
    status,
    gatewayResponse: data.refund_status ?? null,
  });
  return { handled: true };
}

/**
 * Requests a Paystack refund against a successful charge and records the
 * pending refund debit entry. Pass `amountKobo` for partial refunds.
 */
export async function createRefund({ reference, userId, amountKobo }) {
  const payment = await getPaymentByReference(reference);
  if (!payment || (userId !== undefined && payment.userId !== userId)) {
    return { reason: "NOT_FOUND" };
  }
  if (payment.status !== PAYMENT_STATUS.SUCCESS) {
    return { reason: "NOT_SUCCESSFUL" };
  }
  if (amountKobo !== undefined && amountKobo > payment.amount) {
    return { reason: "AMOUNT_EXCEEDS_PAYMENT" };
  }

  const data = await paystackRequest("/refund", {
    method: "POST",
    body: {
      transaction: reference,
      ...(amountKobo !== undefined && amountKobo < payment.amount ? { amount: amountKobo } : {}),
    },
  });

  const entry = await insertLedgerEntry({
    paymentId: payment.id,
    entryType: LEDGER_ENTRY_TYPE.REFUND,
    direction: LEDGER_ENTRY_DIRECTION.DEBIT,
    amountKobo: amountKobo ?? payment.amount,
    status: LEDGER_ENTRY_STATUS.PENDING,
    gatewayReference: data.reference ?? null,
    gatewayResponse: data.status ?? null,
  });

  return { payment, entry };
}

/**
 * Initiates a payout (Paystack transfer) of what is still held on a
 * successful payment, minus the platform fee. Records the pending payout
 * debit entry; the transfer.* webhooks resolve its status.
 */
export async function createPayout({ paymentId, recipientCode }) {
  const payment = await getPaymentById(paymentId);
  if (!payment) return { reason: "NOT_FOUND" };
  if (payment.status !== PAYMENT_STATUS.SUCCESS) {
    return { reason: "NOT_SUCCESSFUL" };
  }

  const payoutAmount = payment.amount - payment.platformFee;
  if (payoutAmount <= 0) return { reason: "NOTHING_TO_PAYOUT" };

  // We always set our own reference so transfer webhooks can find the entry.
  const transferReference = generateReference("TRF");

  const data = await paystackRequest("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: payoutAmount,
      recipient: recipientCode,
      reference: transferReference,
      reason: `Payout for ${payment.reference}`,
    },
  });

  const entry = await insertLedgerEntry({
    paymentId: payment.id,
    entryType: LEDGER_ENTRY_TYPE.PAYOUT,
    direction: LEDGER_ENTRY_DIRECTION.DEBIT,
    amountKobo: payoutAmount,
    status: LEDGER_ENTRY_STATUS.PENDING,
    gatewayReference: data.transfer_reference ?? transferReference,
    gatewayResponse: data.status ?? null,
  });

  return { payment, entry, payoutAmount };
}
